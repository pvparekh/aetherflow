import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_OPTIONS } from "./contract";
const provider = vi.hoisted(() => vi.fn());
vi.mock("@/lib/openai", () => ({
  getOpenAI: () => ({ responses: { create: provider } }),
}));
import { parsePdfReview } from "./pdf";
const result = (transactions: unknown[]) => ({
  status: "completed",
  output_text: JSON.stringify({ transactions, warnings: [] }),
});
const rows = [
  {
    description: "Figma",
    amount: 45,
    date: "2026-10-01",
    kind: "expense",
    page: 1,
    evidence: "2026-10-01 Figma $45.00",
  },
  {
    description: "Adobe",
    amount: 59.99,
    date: "2026-10-01",
    kind: "expense",
    page: 2,
    evidence: "2026-10-01 Adobe $59.99",
  },
];
describe("PDF transport and source validation (provider mocked, no OCR accuracy claim)", () => {
  beforeEach(() => provider.mockReset());
  it("reads all native pages and keeps page evidence with every row unselected", async () => {
    provider.mockResolvedValue(result(rows));
    const r = await parsePdfReview(
      readFileSync("src/lib/imports/fixtures/native-statement.pdf"),
      "statement.pdf",
      DEFAULT_OPTIONS,
    );
    expect(r.pages).toBe(2);
    expect(r.rows.map((r) => r.page)).toEqual([1, 2]);
    expect(r.rows.every((r) => !r.included)).toBe(true);
    expect(provider.mock.calls[0][0].input[0].content[0].text).toContain(
      "PAGE 2",
    );
  });
  it("routes sparse/mixed pages through visual PDF input instead of declaring empty success", async () => {
    provider.mockResolvedValue(result([rows[0]]));
    const r = await parsePdfReview(
      readFileSync("src/lib/imports/fixtures/sparse-statement.pdf"),
      "scan.pdf",
      DEFAULT_OPTIONS,
    );
    expect(r.method).toContain("Visual");
    expect(provider.mock.calls[0][0].input[0].content[0].type).toBe(
      "input_file",
    );
  });
  it("rejects unmatched source evidence, incomplete responses, invalid files and invalid amounts", async () => {
    const file = readFileSync("src/lib/imports/fixtures/native-statement.pdf");
    provider.mockResolvedValue(
      result([{ ...rows[0], evidence: "Invented vendor" }]),
    );
    await expect(
      parsePdfReview(file, "a.pdf", DEFAULT_OPTIONS),
    ).rejects.toThrow("matched");
    provider.mockResolvedValue({ status: "incomplete", output_text: "" });
    await expect(
      parsePdfReview(file, "a.pdf", DEFAULT_OPTIONS),
    ).rejects.toThrow("incomplete");
    await expect(
      parsePdfReview(Buffer.from("not a pdf"), "a.pdf", DEFAULT_OPTIONS),
    ).rejects.toThrow("valid PDF");
    provider.mockResolvedValue(result([{ ...rows[0], amount: 1.234 }]));
    await expect(
      parsePdfReview(file, "a.pdf", DEFAULT_OPTIONS),
    ).rejects.toThrow("invalid transaction");
  });
});
