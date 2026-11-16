import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonRequest } from "@/lib/llm";
import { createRateLimiter } from "../rate-limit";
import { query, TXNS } from "./fixtures";

const state = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  modelOutput: null as unknown,
  modelCalls: 0,
}));

vi.mock("@/lib/imports/access", () => ({
  importAccess: async () => (state.user ? { user: state.user, db: {} } : null),
}));
vi.mock("@/lib/expense-intel/txns", () => ({
  loadUserTxns: async () => TXNS,
}));
vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...actual,
    completeJson: async (request: JsonRequest<unknown>) => {
      state.modelCalls += 1;
      if (state.modelOutput instanceof Error) throw state.modelOutput;
      return { value: request.validate(state.modelOutput), provider: "ollama", model: "test", latencyMs: 1 };
    },
  };
});

import { LlmUnavailableError } from "@/lib/llm";
import { POST } from "@/app/api/expense-intel/ask/route";

let userCounter = 0;
const ask = (body: unknown) =>
  POST(new Request("http://test/api/expense-intel/ask", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  // A fresh user per test keeps the module-level rate limiter out of the way.
  state.user = { id: `user-${++userCounter}` };
  state.modelOutput = { scope: "spending_question", query: query({ groupBy: "category", limit: 2 }) };
  state.modelCalls = 0;
});

describe("POST /api/expense-intel/ask", () => {
  it("requires sign-in", async () => {
    state.user = null;
    expect((await ask({ question: "hi" })).status).toBe(401);
  });

  it.each([{}, { question: "" }, { question: "   " }, { question: 42 }, { question: "x".repeat(301) }])(
    "rejects an invalid question %#",
    async (body) => {
      const res = await ask(body);
      expect(res.status).toBe(400);
      expect(state.modelCalls).toBe(0);
    },
  );

  it("returns the computed answer, rows and capped transactions", async () => {
    const res = await ask({ question: "Spending by category?" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.kind).toBe("answer");
    expect(body.answer.source).toBe("template");
    expect(body.rows.map((r: { label: string }) => r.label)).toEqual(["Travel/Transport", "Food/Dining"]);
    expect(body.totalRows).toBe(4);
    expect(body.overall).toEqual({ count: 9, total: 704.24, average: 78.25, largestTransactionId: "t6" });
    expect(body.transactions).toHaveLength(9);
    expect(body.recurringSource).toBeNull();
  });

  it("returns a canned reply for out-of-scope questions", async () => {
    state.modelOutput = { scope: "unrelated", query: null };
    const body = await (await ask({ question: "Write me a poem" })).json();
    expect(body).toMatchObject({ kind: "declined", reason: "unrelated" });
    expect(body).not.toHaveProperty("rows");
  });

  it("reports a model outage as 503", async () => {
    state.modelOutput = new LlmUnavailableError("down", false);
    const res = await ask({ question: "Spending by category?" });
    expect(res.status).toBe(503);
  });

  it("rate-limits each user to 10 questions a minute", async () => {
    for (let i = 0; i < 10; i++) expect((await ask({ question: "q" })).status).toBe(200);
    const res = await ask({ question: "q" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

describe("createRateLimiter", () => {
  it("allows again once the window slides past old attempts", () => {
    const limiter = createRateLimiter(2, 1000);
    expect(limiter.take("a", 0).allowed).toBe(true);
    expect(limiter.take("a", 500).allowed).toBe(true);
    expect(limiter.take("a", 900)).toEqual({ allowed: false, retryAfterMs: 100 });
    expect(limiter.take("b", 900).allowed).toBe(true);
    expect(limiter.take("a", 1000).allowed).toBe(true);
  });
});
