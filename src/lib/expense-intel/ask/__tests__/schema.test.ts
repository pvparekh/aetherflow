import { describe, expect, it } from "vitest";
import { AskQueryError, parseAskQuery, parseTranslation, TRANSLATION_SCHEMA } from "../schema";
import { query } from "./fixtures";

const valid = () => JSON.parse(JSON.stringify(query())) as Record<string, unknown> & {
  filters: Record<string, unknown>;
};

describe("parseAskQuery", () => {
  it("accepts a well-formed query unchanged", () => {
    const q = query({ metric: "average", groupBy: "vendor", filters: { categories: ["Utilities"] } });
    expect(parseAskQuery(q)).toEqual(q);
  });

  it("normalises safe variations", () => {
    const raw = valid();
    raw.metric = "list";
    raw.groupBy = "vendor";
    raw.limit = 500;
    raw.extra = "ignored";
    raw.filters.categories = ["software/saas", "Software/SaaS"];
    raw.filters.vendorText = "  Netflix<script>  ";
    raw.filters.dateFrom = "2026-01-01"; // ignored unless the period is custom
    const q = parseAskQuery(raw);
    expect(q.groupBy).toBe("none");
    expect(q.limit).toBe(50);
    expect(q).not.toHaveProperty("extra");
    expect(q.filters.categories).toEqual(["Software/SaaS"]);
    expect(q.filters.vendorText).toBe("Netflix script");
    expect(q.filters.dateFrom).toBeNull();
  });

  it.each<[string, (q: ReturnType<typeof valid>) => void]>([
    ["unknown metric", (q) => (q.metric = "median")],
    ["unknown grouping", (q) => (q.groupBy = "week")],
    ["unknown category", (q) => (q.filters.categories = ["Groceries"])],
    ["unknown period", (q) => (q.filters.period = "yesterday")],
    ["custom period without dates", (q) => (q.filters.period = "custom")],
    ["impossible date", (q) => Object.assign(q.filters, { period: "custom", dateFrom: "2026-02-30" })],
    ["reversed dates", (q) => Object.assign(q.filters, { period: "custom", dateFrom: "2026-05-01", dateTo: "2026-04-01" })],
    ["negative amount", (q) => (q.filters.minAmount = -5)],
    ["reversed amounts", (q) => Object.assign(q.filters, { minAmount: 50, maxAmount: 10 })],
    ["string amount", (q) => (q.filters.maxAmount = "100")],
    ["non-boolean recurring", (q) => (q.filters.recurringOnly = "yes")],
    ["missing filters", (q) => delete (q as Record<string, unknown>).filters],
    ["non-numeric limit", (q) => (q.limit = "ten")],
  ])("rejects %s", (_, mutate) => {
    const raw = valid();
    mutate(raw);
    expect(() => parseAskQuery(raw)).toThrow(AskQueryError);
  });
});

describe("parseTranslation", () => {
  it("drops any query attached to an out-of-scope verdict", () => {
    expect(parseTranslation({ scope: "advice", query: query() })).toEqual({ scope: "advice", query: null });
  });

  it("requires a query for a spending question", () => {
    expect(() => parseTranslation({ scope: "spending_question", query: null })).toThrow(AskQueryError);
    expect(() => parseTranslation({ scope: "answer", query: null })).toThrow(AskQueryError);
    expect(() => parseTranslation("You spent $5")).toThrow(AskQueryError);
  });
});

describe("TRANSLATION_SCHEMA", () => {
  // OpenAI strict mode: every object is closed and requires all of its properties.
  function assertStrict(node: unknown): void {
    if (Array.isArray(node)) return node.forEach(assertStrict);
    if (typeof node !== "object" || node === null) return;
    const n = node as Record<string, unknown>;
    if (n.type === "object") {
      expect(n.additionalProperties).toBe(false);
      expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
    }
    Object.values(n).forEach(assertStrict);
  }

  it("is valid under strict mode", () => {
    assertStrict(TRANSLATION_SCHEMA.schema);
  });
});
