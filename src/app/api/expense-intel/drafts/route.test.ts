import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeakReport, RecurringStream, Txn } from "@/lib/expense-intel/contracts";

const state = vi.hoisted(() => ({
  user: "user-1" as string | null,
  loadFails: false,
  report: null as unknown,
}));

vi.mock("@/lib/imports/access", () => ({
  importAccess: async () => (state.user ? { user: { id: state.user }, db: {} } : null),
}));
vi.mock("@/lib/expense-intel/txns", () => ({
  loadUserTxns: vi.fn(async (): Promise<Txn[]> => {
    if (state.loadFails) throw new Error("db down");
    return [];
  }),
}));
vi.mock("@/lib/expense-intel/leaks", () => ({
  buildLeakReport: () => state.report,
}));
vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...actual,
    completeJson: vi.fn(async () => {
      throw new actual.LlmUnavailableError("Model provider is not reachable", false);
    }),
  };
});

import { POST } from "./route";
import { loadUserTxns } from "@/lib/expense-intel/txns";

const netflix: RecurringStream = {
  key: "netflix:monthly",
  vendor: "Netflix",
  vendorKey: "netflix",
  category: "Entertainment",
  cadence: "monthly",
  typicalAmount: 15.49,
  lastAmount: 17.99,
  lastDate: "2026-10-12",
  nextExpectedDate: "2026-11-12",
  annualCost: 215.88,
  occurrences: 10,
  confidence: "high",
  status: "active",
  transactionIds: [],
};

function report(): LeakReport {
  return {
    generatedAt: "2026-11-15",
    periodStart: "2026-01-01",
    periodEnd: "2026-10-31",
    monthsCovered: 10,
    transactionCount: 100,
    subscriptions: [netflix],
    priceChanges: [
      { streamKey: "netflix:monthly", vendor: "Netflix", previousAmount: 15.49, newAmount: 17.99, changedOn: "2026-07-12", pct: 16.1, annualImpact: 30 },
    ],
    duplicates: [],
    unusual: [],
    totals: { subscriptionsMonthly: 17.99, subscriptionsAnnual: 215.88, priceIncreasesAnnual: 30, duplicatesTotal: 0, foundAnnual: 30 },
    coverageNote: null,
  };
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/expense-intel/drafts", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  state.user = "user-1";
  state.loadFails = false;
  state.report = report();
  vi.mocked(loadUserTxns).mockClear();
});

describe("POST /api/expense-intel/drafts", () => {
  it("requires authentication", async () => {
    state.user = null;
    const res = await post({ kind: "cancel", streamKey: "netflix:monthly" });
    expect(res.status).toBe(401);
    expect(loadUserTxns).not.toHaveBeenCalled();
  });

  it.each([
    ["not JSON", "{"],
    ["an unknown kind", { kind: "refund", streamKey: "netflix:monthly" }],
    ["a missing stream key", { kind: "cancel" }],
    ["an oversized stream key", { kind: "cancel", streamKey: "x".repeat(201) }],
  ])("rejects %s", async (_, body) => {
    expect((await post(body)).status).toBe(400);
  });

  it("returns 404 for a stream the user does not have", async () => {
    expect((await post({ kind: "cancel", streamKey: "hulu:monthly" })).status).toBe(404);
  });

  it("returns 503 when transactions cannot be loaded", async () => {
    state.loadFails = true;
    expect((await post({ kind: "cancel", streamKey: "netflix:monthly" })).status).toBe(503);
  });

  it("loads the caller's own transactions and returns a cancellation draft", async () => {
    const res = await post({ kind: "cancel", streamKey: "netflix:monthly" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(vi.mocked(loadUserTxns).mock.calls[0][1]).toBe("user-1");
    const draft = await res.json();
    expect(draft).toMatchObject({
      kind: "cancel",
      vendor: "Netflix",
      cancelUrl: "https://help.netflix.com/en/node/407",
      source: "template",
    });
  });

  it("passes the stream's price change into a negotiation script", async () => {
    const draft = await (await post({ kind: "negotiate", streamKey: "netflix:monthly" })).json();
    expect(draft).toMatchObject({ kind: "negotiate", channel: "phone_script", source: "template" });
    expect(draft.body).toContain("from $15.49 to $17.99 on July 12, 2026");
  });
});
