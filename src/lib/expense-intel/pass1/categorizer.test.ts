import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonRequest } from "@/lib/llm";

const completeJson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm")>()),
  completeJson,
}));

import { LlmOutputError, LlmUnavailableError } from "@/lib/llm";
import { categorizeRows, parseBatch } from "./categorizer";
import type { ParsedRow } from "../types";

type Item = { id: string; description: string; amount: number };
type Answer = (items: Item[]) => unknown;

function sentItems(request: JsonRequest<unknown>): Item[] {
  return JSON.parse(request.user.slice(request.user.indexOf("\n") + 1));
}

// Behaves like completeJson: the caller's validator decides, and a failed
// validation surfaces as LlmOutputError.
function modelAnswers(answer: Answer) {
  return async (request: JsonRequest<unknown>) => {
    let value: unknown;
    try {
      value = request.validate(answer(sentItems(request)));
    } catch (error) {
      throw new LlmOutputError(String(error));
    }
    return { value, provider: "ollama", model: "test", latencyMs: 1 };
  };
}

const allSoftware: Answer = (items) => ({
  items: items.map((item) => ({
    id: item.id,
    vendor: item.description,
    category: "Software/SaaS",
    subcategory: "Subscription",
  })),
});

// Fails any batch containing the poisoned description.
const poisoned =
  (description: string): Answer =>
  (items) =>
    items.some((item) => item.description === description)
      ? { items: [] }
      : allSoftware(items);

function row(vendor: string, amount = 10): ParsedRow {
  return { raw_text: vendor, vendor, amount, transaction_date: "2026-10-01" };
}

const descriptionsSent = () =>
  completeJson.mock.calls.map(([request]) =>
    sentItems(request).map((item) => item.description),
  );

beforeEach(() => {
  completeJson.mockReset();
});

describe("rules-first resolution", () => {
  it("sends only rows that no rule or history vote resolves to the model", async () => {
    completeJson.mockImplementation(modelAnswers(allSoftware));
    const result = await categorizeRows(
      [row("SQ *BLUE BOTTLE 0423 OAKLAND CA"), row("Figma"), row("NEW VENDOR")],
      {
        rules: [{ vendorKey: "blue bottle", category: "Food/Dining" }],
        votes: new Map([["figma", "Software/SaaS"]]),
      },
    );
    expect(descriptionsSent()).toEqual([["NEW VENDOR"]]);
    expect(result).toEqual([
      { category: "Food/Dining", subcategory: null, confidence: 1, origin: "rule" },
      { category: "Software/SaaS", subcategory: null, confidence: 0.9, origin: "history" },
      { category: "Software/SaaS", subcategory: "Subscription", confidence: 0.7, origin: "model" },
    ]);
  });

  it("makes no model call when everything is known", async () => {
    const result = await categorizeRows([row("Figma")], {
      rules: [{ vendorKey: "figma", category: "Software/SaaS" }],
      votes: new Map(),
    });
    expect(completeJson).not.toHaveBeenCalled();
    expect(result[0].origin).toBe("rule");
  });
});

describe("ID-keyed model output", () => {
  it("maps items back by id even when the model reorders them", async () => {
    completeJson.mockImplementation(
      modelAnswers((items) => ({
        items: items
          .map((item) => ({
            id: item.id,
            vendor: item.description,
            category: item.description === "Uber" ? "travel/transport" : "Food/Dining",
            subcategory: "  Label ",
          }))
          .reverse(),
      })),
    );
    const result = await categorizeRows([row("Uber"), row("Chipotle")]);
    expect(result.map((r) => r.category)).toEqual(["Travel/Transport", "Food/Dining"]);
    expect(result[0].subcategory).toBe("Label");
  });

  it("asks for an enum of exactly the batch's ids and the nine categories", async () => {
    completeJson.mockImplementation(modelAnswers(allSoftware));
    await categorizeRows([row("A"), row("B")]);
    const item = completeJson.mock.calls[0][0].schema.schema.properties.items.items;
    expect(item.properties.id.enum).toEqual(["1", "2"]);
    expect(item.properties.category.enum).toHaveLength(9);
    expect(item.required).toEqual(["id", "vendor", "category", "subcategory"]);
  });

  const ids = ["1", "2"];
  const valid = (id: string) => ({ id, vendor: "V", category: "Misc", subcategory: "" });
  it.each([
    ["a missing id", { items: [valid("1")] }, "missing"],
    ["a repeated id", { items: [valid("1"), valid("1")] }, "repeated"],
    ["an unknown id", { items: [valid("1"), valid("3")] }, "unknown id"],
    ["a non-canonical category", { items: [valid("1"), { ...valid("2"), category: "Groceries" }] }, "unknown category"],
    ["a missing subcategory", { items: [valid("1"), { ...valid("2"), subcategory: 4 }] }, "subcategory"],
    ["no items array", { rows: [] }, "items"],
  ])("rejects output with %s", (_, output, message) => {
    expect(() => parseBatch(output, ids)).toThrow(message);
  });
});

describe("failure ladder", () => {
  it("retries a failed batch once before splitting it", async () => {
    completeJson
      .mockImplementationOnce(modelAnswers(() => ({ items: [] })))
      .mockImplementation(modelAnswers(allSoftware));
    const result = await categorizeRows([row("A"), row("B"), row("C")]);
    expect(descriptionsSent()).toEqual([["A", "B", "C"], ["A", "B", "C"]]);
    expect(result.every((r) => r.origin === "model")).toBe(true);
  });

  it("halves the batch, then tries single items, then falls back to Misc for review", async () => {
    completeJson.mockImplementation(modelAnswers(poisoned("C")));
    const result = await categorizeRows([row("A"), row("B"), row("C"), row("D")]);
    expect(descriptionsSent()).toEqual([
      ["A", "B", "C", "D"],
      ["A", "B", "C", "D"],
      ["A", "B"],
      ["C", "D"],
      ["C"],
      ["D"],
    ]);
    expect(result.map((r) => r.origin)).toEqual(["model", "model", "fallback", "model"]);
    expect(result[2]).toEqual({
      category: "Misc",
      subcategory: "Needs review",
      confidence: 0,
      origin: "fallback",
    });
  });

  it("falls back for a single row after its retry", async () => {
    completeJson.mockImplementation(modelAnswers(() => "not an object"));
    const [result] = await categorizeRows([row("A")]);
    expect(completeJson).toHaveBeenCalledTimes(2);
    expect(result.origin).toBe("fallback");
  });

  it("retries a transient outage once, then reports it instead of hiding it as Misc", async () => {
    completeJson.mockRejectedValue(new LlmUnavailableError("Model provider is not reachable", false));
    await expect(categorizeRows([row("A"), row("B")])).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(completeJson).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permanent provider failure", async () => {
    completeJson.mockRejectedValue(
      new LlmUnavailableError("Model provider rejected the request", true, 402, "billing_not_active"),
    );
    await expect(categorizeRows([row("A")])).rejects.toThrow("rejected");
    expect(completeJson).toHaveBeenCalledTimes(1);
  });

  it("recovers when the outage clears on the retry", async () => {
    completeJson
      .mockRejectedValueOnce(new LlmUnavailableError("Model provider is not reachable", false))
      .mockImplementation(modelAnswers(allSoftware));
    const result = await categorizeRows([row("A")]);
    expect(result[0].origin).toBe("model");
  });
});

describe("batching", () => {
  it("sends 25 rows per call by default and honours a smaller batch size", async () => {
    completeJson.mockImplementation(modelAnswers(allSoftware));
    const rows = Array.from({ length: 30 }, (_, i) => row(`Vendor ${i}`));
    await categorizeRows(rows);
    expect(descriptionsSent().map((batch) => batch.length)).toEqual([25, 5]);

    completeJson.mockClear();
    const result = await categorizeRows(rows, undefined, { batchSize: 10 });
    expect(descriptionsSent().map((batch) => batch.length)).toEqual([10, 10, 10]);
    expect(result).toHaveLength(30);
  });
});
