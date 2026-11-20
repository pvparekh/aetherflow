// The downloadable sample must stay importable and tell the demo's story.
// Regenerate with: npx tsx --tsconfig tsconfig.json scripts/make-sample-statement.mts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseExpenseFile } from "@/lib/expense-intel/parser";
import { MAX_ROWS } from "@/lib/imports/contract";

const FILE = "public/sample/sample-card-statement-12-months.csv";

describe("downloadable sample statement", () => {
  const parsed = parseExpenseFile(readFileSync(FILE, "utf8"), "sample-card-statement-12-months.csv");

  it("fits the import limit and covers a full year", () => {
    expect(parsed.rows.length).toBeGreaterThan(400);
    expect(parsed.rows.length).toBeLessThanOrEqual(MAX_ROWS);
    const dates = parsed.rows.map((r) => r.transaction_date).filter(Boolean).sort();
    expect(dates[0]).toBe("2025-11-01");
    expect(dates.at(-1)!.slice(0, 7)).toBe("2026-10");
    expect(parsed.rows.every((r) => r.amount > 0)).toBe(true);
  });

  it("contains the planted leaks", () => {
    const text = parsed.rows.map((r) => `${r.vendor} ${r.amount}`).join("\n");
    expect(text).toMatch(/ADOBE[^\n]* 69\.99/i);
    expect(text).toMatch(/ADOBE[^\n]* 59\.99/i);
    expect(text.match(/ROBERTAS[^\n]* 74\.32/gi)?.length).toBe(2);
    expect(text).toMatch(/HULU/i);
  });
});
