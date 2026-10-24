import { it, expect, vi, afterEach } from "vitest";
const provider = vi.hoisted(() => vi.fn());
vi.mock("@/lib/openai", () => ({
  getOpenAI: () => ({ responses: { create: provider } }),
}));
import { categorizeBatch } from "./categorizer";
afterEach(() => vi.useRealTimers());
it("keeps reviewed amount/date authoritative even when the provider changes them", async () => {
  provider.mockResolvedValue({
    output_text: JSON.stringify({
      items: [
        {
          vendor: "Model name",
          amount: 99999,
          date: "1999-01-01",
          category: "software/saas",
          subcategory: "Cloud",
          confidence: 0.9,
        },
      ],
    }),
  });
  const [r] = await categorizeBatch([
    {
      raw_text: "Figma $45",
      vendor: "Figma",
      amount: 45,
      transaction_date: "2026-10-01",
    },
  ]);
  expect(r.amount).toBe(45);
  expect(r.date).toBe("2026-10-01");
  expect(r.category).toBe("Software/SaaS");
});
it("does not convert repeated malformed output into a successful Misc import", async () => {
  vi.useFakeTimers();
  provider.mockResolvedValue({ output_text: '{"items":[null]}' });
  const assertion = expect(
    categorizeBatch([
      { raw_text: "Shop", vendor: "Shop", amount: 10, transaction_date: null },
    ]),
  ).rejects.toThrow("invalid output");
  await vi.runAllTimersAsync();
  await assertion;
});
