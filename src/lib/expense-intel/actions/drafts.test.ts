import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm")>()),
  completeJson: vi.fn(),
}));

import { completeJson, LlmUnavailableError } from "@/lib/llm";
import type { PriceChange, RecurringStream } from "../contracts";
import { checkFaithfulness } from "../ai/faithfulness";
import { findGuideEntry } from "./cancel-guide";
import { checkTone, draftCancellation, draftNegotiation } from "./drafts";
import { cancellationFactSheet, negotiationFactSheet } from "./facts";
import { templateCancellation, templateNegotiation } from "./templates";

const mockComplete = vi.mocked(completeJson);

const stream: RecurringStream = {
  key: "spotify:monthly",
  vendor: "Spotify",
  vendorKey: "spotify",
  category: "Entertainment",
  cadence: "monthly",
  typicalAmount: 10.99,
  lastAmount: 11.99,
  lastDate: "2026-10-03",
  nextExpectedDate: "2026-11-03",
  annualCost: 143.88,
  occurrences: 12,
  confidence: "high",
  status: "active",
  transactionIds: ["t1", "t2"],
};

const increase: PriceChange = {
  streamKey: "spotify:monthly",
  vendor: "Spotify",
  previousAmount: 10.99,
  newAmount: 11.99,
  changedOn: "2026-08-03",
  pct: 9.1,
  annualImpact: 12,
};

const unknownStream: RecurringStream = { ...stream, key: "acme:monthly", vendor: "Acme Hosting", vendorKey: "acme hosting" };

function modelWrites(...values: ({ subject: string | null; body: string } | Error)[]) {
  for (const value of values) {
    if (value instanceof Error) mockComplete.mockRejectedValueOnce(value);
    else mockComplete.mockResolvedValueOnce({ value, provider: "ollama", model: "test", latencyMs: 1 });
  }
}

beforeEach(() => mockComplete.mockReset());

describe("template drafts", () => {
  it("builds a cancellation with the verified link, guide steps and code-computed facts", () => {
    const draft = templateCancellation(stream, findGuideEntry("spotify"));
    expect(draft).toMatchObject({
      kind: "cancel",
      vendor: "Spotify",
      channel: "web_form",
      subject: "Cancel my Spotify subscription",
      cancelUrl: "https://support.spotify.com/us/article/cancel-premium/",
      source: "template",
    });
    expect(draft.body).toContain("My most recent charge was $11.99 on October 3, 2026.");
    expect(draft.steps.at(-1)).toBe("Keep the confirmation, and check that no new charge appears after November 3, 2026.");
    expect(draft.facts).toEqual([
      { label: "Vendor", value: "Spotify" },
      { label: "Amount per charge", value: "$11.99" },
      { label: "Billed", value: "every month" },
      { label: "Last charge", value: "October 3, 2026" },
      { label: "Next expected charge", value: "November 3, 2026" },
      { label: "Cost per year", value: "$143.88" },
      { label: "Charges found", value: "12" },
    ]);
  });

  it("falls back to generic steps, email and no link for an unknown vendor", () => {
    const draft = templateCancellation(unknownStream, null);
    expect(draft.channel).toBe("email");
    expect(draft.cancelUrl).toBeNull();
    expect(draft.steps[0]).toContain("Acme Hosting");
  });

  it("builds a polite negotiation script from the price change", () => {
    const draft = templateNegotiation(stream, increase);
    expect(draft).toMatchObject({ kind: "negotiate", channel: "phone_script", subject: null, source: "template" });
    expect(draft.body).toContain("My price went up from $10.99 to $11.99 on August 3, 2026, which adds $12.00 a year.");
    expect(draft.steps[0]).toContain("check what comparable services charge yourself");
    expect(draft.facts).toContainEqual({ label: "Increase per charge", value: "$1.00 (9.1%)" });
    expect(checkTone(draft.body)).toEqual([]);
  });

  it("uses the regular price when there is no price change", () => {
    expect(templateNegotiation(stream, null).body).toContain("I pay $11.99 every month, which comes to $143.88 a year.");
  });

  it("passes its own faithfulness check", () => {
    const cancel = templateCancellation(stream, null);
    const negotiate = templateNegotiation(stream, increase);
    expect(checkFaithfulness(`${cancel.subject}\n${cancel.body}`, cancellationFactSheet(stream).check).ok).toBe(true);
    expect(checkFaithfulness(negotiate.body, negotiationFactSheet(stream, increase).check).ok).toBe(true);
  });
});

describe("checkTone", () => {
  it.each([
    ["This will save you money, guaranteed.", ["Promises a guarantee", "Promises a saving"]],
    ["My lawyer will be in touch.", ["Threatens legal action"]],
    ["A competitor is offering me half price.", ["Claims a competitor offer"]],
    ["Lower the price or else.", ["Uses an ultimatum"]],
  ])("flags %s", (text, problems) => {
    expect(checkTone(text)).toEqual(problems);
  });
});

describe("draftCancellation", () => {
  it("uses model wording that passes the checks, keeping code facts and steps", async () => {
    modelWrites({
      subject: "Please cancel my Spotify plan",
      body: "Hello, please cancel my Spotify subscription. My last charge was $11.99 on October 3, 2026. Please confirm in writing.\n\n[Your name]",
    });
    const draft = await draftCancellation(stream);
    expect(draft.source).toBe("model");
    expect(draft.subject).toBe("Please cancel my Spotify plan");
    expect(draft.cancelUrl).toBe("https://support.spotify.com/us/article/cancel-premium/");
    expect(draft.facts).toEqual(templateCancellation(stream, findGuideEntry("spotify")).facts);
    expect(mockComplete.mock.calls[0][0].task).toBe("draft");
  });

  it("falls back to the template when the model invents figures twice", async () => {
    const invented = { subject: "Cancel", body: "Please cancel. I was charged $15.99 on November 9." };
    modelWrites(invented, invented);
    const draft = await draftCancellation(stream);
    expect(draft).toEqual(templateCancellation(stream, findGuideEntry("spotify")));
    expect(mockComplete.mock.calls[1][0].user).toContain("Amount $15.99 is not in the supplied data");
  });

  it("falls back immediately when the model is unavailable", async () => {
    modelWrites(new LlmUnavailableError("Model provider is not reachable", false));
    expect((await draftCancellation(stream)).source).toBe("template");
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });
});

describe("draftNegotiation", () => {
  it("rejects a script that names another vendor or threatens, then uses the template", async () => {
    modelWrites(
      { subject: null, body: "Netflix is cheaper, so lower my $11.99 price." },
      { subject: null, body: "Lower my $11.99 price or else I will call my lawyer." },
    );
    const draft = await draftNegotiation(stream, increase);
    expect(draft).toEqual(templateNegotiation(stream, increase, findGuideEntry("spotify")));
    expect(mockComplete.mock.calls[1][0].user).toContain('Mentions "Netflix"');
  });

  it("accepts a faithful, polite script", async () => {
    modelWrites({
      subject: null,
      body: "Hi, I'm calling about my Spotify account. My price went from $10.99 to $11.99 on August 3, about 9% more. Are there any loyalty discounts or lower-priced plans?",
    });
    const draft = await draftNegotiation(stream, increase);
    expect(draft.source).toBe("model");
    expect(draft.subject).toBeNull();
  });
});
