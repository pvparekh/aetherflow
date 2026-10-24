import { describe, it, expect } from "vitest";
import {
  parseMoney,
  parseDate,
  validateReview,
  DEFAULT_OPTIONS,
  reviewTotal,
} from "./contract";
import { parseTextReview } from "./parse";
import { csvCell } from "../expense-intel/csv";
describe("import review boundaries", () => {
  it("handles decimal money exactly at input and rejects trailing junk", () => {
    expect(parseMoney("$1,234.50")).toBe(1234.5);
    expect(parseMoney("(12.30)")).toBe(-12.3);
    expect(parseMoney("12widgets")).toBeNull();
    expect(parseMoney("Infinity")).toBeNull();
    expect(parseMoney("1.234")).toBeNull();
  });
  it("rejects impossible dates instead of normalizing them", () => {
    expect(parseDate("02/30/2026", "mdy")).toBeNull();
    expect(parseDate("31/12/2026", "dmy")).toBe("2026-12-31");
    expect(parseDate("2026-02-28", "mdy")).toBe("2026-02-28");
  });
  it("preserves quoted CSV descriptions and excludes bank credits visibly", () => {
    const r = parseTextReview(
      'Date,Description,Debit,Credit\n10/01/2026,"Office, Inc",12.50,\n10/02/2026,Deposit,,100',
      "bank.csv",
      DEFAULT_OPTIONS,
    );
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].vendor).toBe("Office, Inc");
    expect(reviewTotal(r.rows)).toBe(12.5);
    expect(r.rows[1].included).toBe(false);
    expect(r.rows[1].kind).toBe("credit");
  });
  it("requires direction confirmation for negative expense-file entries", () => {
    const r = parseTextReview(
      "Date,Description,Amount\n10/01/2026,Refund,-10",
      "a.csv",
      DEFAULT_OPTIONS,
    );
    expect(r.rows[0].included).toBe(false);
    expect(r.rows[0].kind).toBe("unknown");
  });
  it("supports signed statement convention without turning deposits into spend", () => {
    const r = parseTextReview(
      "Date,Description,Amount\n10/01/2026,Shop,-10\n10/02/2026,Payroll,200",
      "a.csv",
      { ...DEFAULT_OPTIONS, amountMode: "negative-outflow" },
    );
    expect(reviewTotal(r.rows)).toBe(10);
    expect(r.rows[1].kind).toBe("credit");
  });
  it("does not silently discard malformed rows or ambiguous dates", () => {
    const r = parseTextReview(
      "Date,Description,Amount\n02/30/2026,Shop,12\n10/02/2026,Other,10xyz",
      "a.csv",
      DEFAULT_OPTIONS,
    );
    expect(r.rows).toHaveLength(2);
    expect(r.rows.every((x) => !x.included)).toBe(true);
  });
  it("rejects oversized batches, invalid reviewed fields and duplicate IDs", () => {
    expect(() =>
      parseTextReview(
        "Vendor,Amount\n" + Array(501).fill("Shop,1").join("\n"),
        "a.csv",
        DEFAULT_OPTIONS,
      ),
    ).toThrow();
    const r = parseTextReview(
      "Vendor,Amount\nShop,1",
      "a.csv",
      DEFAULT_OPTIONS,
    );
    r.rows[0].kind = "credit";
    expect(() => validateReview(r)).toThrow();
  });
  it("escapes quotes/newlines and spreadsheet formulas in exported strings", () => {
    expect(csvCell("=1+1")).toBe('"\'=1+1"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell(-2)).toBe('"-2"');
  });
});
describe("less tidy CSV exports", () => {
  it("reads BOM, preamble, embedded newlines and CRLF without dropping transactions", () => {
    const r = parseTextReview(
      '\uFEFFExport generated,October\r\nDate,Description,Amount\r\n10/01/2026,"Office\nSupplies",12.50\r\n',
      "a.csv",
      DEFAULT_OPTIONS,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].vendor).toBe("Office\nSupplies");
    expect(reviewTotal(r.rows)).toBe(12.5);
  });
  it("treats zero debit / nonzero credit as credit and ambiguous double columns as unknown", () => {
    const r = parseTextReview(
      "Description,Debit,Credit\nRefund,0,100\nAmbiguous,10,20",
      "a.csv",
      DEFAULT_OPTIONS,
    );
    expect(r.rows.map((r) => r.kind)).toEqual(["credit", "unknown"]);
    expect(reviewTotal(r.rows)).toBe(0);
  });
  it("rejects decimal comma ambiguity and exposes unsupported currencies", () => {
    expect(parseMoney("12,34")).toBeNull();
    expect(parseMoney("1.234,50")).toBeNull();
    const r = parseTextReview(
      "Description,Amount,Currency\nShop,15,EUR",
      "a.csv",
      DEFAULT_OPTIONS,
    );
    expect(r.rows[0].included).toBe(false);
  });
  it("keeps legacy TXT patterns and rejects malformed quoted CSV", () => {
    expect(
      reviewTotal(
        parseTextReview("Figma 25.00\nOffice $12.50", "a.txt", DEFAULT_OPTIONS)
          .rows,
      ),
    ).toBe(37.5);
    expect(() =>
      parseTextReview('Vendor,Amount\n"broken,12', "a.csv", DEFAULT_OPTIONS),
    ).toThrow();
  });
});
