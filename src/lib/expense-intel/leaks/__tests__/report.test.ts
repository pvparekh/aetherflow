import { describe, expect, it } from "vitest";
import type { Txn } from "../../contracts";
import { buildLeakReport } from "../report";
import { addDays } from "../dates";
import { everyNDays, monthly, seeded, txn } from "./fixtures";

const TODAY = "2026-11-15";

/** A year of one person's spending with known leaks planted in it. */
function plantedYear(): { txns: Txn[]; extra: Txn } {
  const rand = seeded(2026);
  const extra = txn("2026-06-04", "ADOBE *CREATIVE CLOUD", 54.99);
  const txns = [
    ...monthly("NETFLIX.COM", 15.49, "2025-11-07", 12, "Entertainment"),
    ...monthly("Spotify USA", [...Array(9).fill(10.99), 11.99, 11.99, 11.99], "2025-11-09", 12, "Entertainment"),
    ...monthly("ADOBE *CREATIVE CLOUD", 54.99, "2025-11-03", 12),
    extra,
    ...monthly("HULU", 7.99, "2025-11-20", 5, "Entertainment"), // cancelled in March
    ...monthly("PG&E WEB ONLINE", [92.1, 101.4, 118.3, 109.9, 97.6, 88.2, 84.75, 90.3, 99.95, 95.4, 87.6, 93.15], "2025-11-18", 12, "Utilities"),
    txn("2025-12-02", "1Password", 35.88),
    ...monthly("OAKWOOD APARTMENTS", 2150, "2025-11-01", 12, "Misc"),
    ...Array.from({ length: 50 }, (_, i) =>
      txn(addDays("2025-11-02", i * 7 + Math.floor(rand() * 3)), "WHOLEFDS MKT #10234", Math.round((40 + rand() * 120) * 100) / 100, "Food/Dining"),
    ),
    ...everyNDays("STARBUCKS STORE 1123", 5.45, "2025-11-03", 30, 4, "Food/Dining"),
    ...Array.from({ length: 30 }, (_, i) =>
      txn(addDays("2025-11-05", i * 11 + Math.floor(rand() * 4)), "UBER *TRIP", Math.round((9 + rand() * 25) * 100) / 100, "Travel/Transport"),
    ),
    txn("2026-08-19", "UBER *TRIP", 214.6, "Travel/Transport"),
    txn("2026-10-30", "Paper Source", 18.5, "Office/Supplies"),
  ];
  return { txns, extra };
}

describe("buildLeakReport", () => {
  it("finds exactly the planted leaks in a realistic year", () => {
    const { txns, extra } = plantedYear();
    const r = buildLeakReport(txns, TODAY);

    expect(r.subscriptions.map((s) => `${s.key} ${s.status}`)).toEqual([
      "pge:monthly active",
      "adobe:monthly active",
      "netflix:monthly active",
      "spotify:monthly active",
      "hulu:monthly possibly_cancelled",
    ]);
    expect(r.priceChanges.map((p) => [p.vendor, p.annualImpact])).toEqual([["Spotify", 12]]);
    expect(r.duplicates.map((d) => d.transactionIds.at(-1))).toEqual([extra.id]);
    expect(r.unusual.map((u) => [u.vendor, u.amount])).toEqual([["Uber", 214.6]]);
    expect(r.totals).toEqual({
      subscriptionsMonthly: 176.75,
      subscriptionsAnnual: 2121, // 185.88 + 143.88 + 659.88 + 94.28 x 12; Hulu is cancelled
      priceIncreasesAnnual: 12,
      duplicatesTotal: 54.99,
      foundAnnual: 66.99,
    });
    expect(r.coverageNote).toBeNull();
  });

  it("describes the period it covers", () => {
    const r = buildLeakReport(plantedYear().txns, TODAY);
    expect(r).toMatchObject({
      generatedAt: TODAY,
      periodStart: "2025-11-01",
      periodEnd: "2026-10-30",
      monthsCovered: 12,
      transactionCount: plantedYear().txns.length,
    });
  });

  it("is deterministic and independent of input order", () => {
    const { txns } = plantedYear();
    const shuffled = [...txns].sort((a, b) => b.id.localeCompare(a.id));
    expect(buildLeakReport(shuffled, TODAY)).toEqual(buildLeakReport(txns, TODAY));
  });

  it("does not modify its input", () => {
    const { txns } = plantedYear();
    const before = JSON.stringify(txns);
    buildLeakReport(txns, TODAY);
    expect(JSON.stringify(txns)).toBe(before);
  });

  it("rounds every money value to cents", () => {
    const r = buildLeakReport(plantedYear().txns, TODAY);
    const money = [
      ...Object.values(r.totals),
      ...r.subscriptions.flatMap((s) => [s.typicalAmount, s.lastAmount, s.annualCost]),
      ...r.priceChanges.flatMap((p) => [p.previousAmount, p.newAmount, p.annualImpact]),
      ...r.duplicates.flatMap((d) => [d.amount, d.extraCost]),
      ...r.unusual.flatMap((u) => [u.amount, u.typicalAmount]),
    ];
    for (const value of money) expect(Math.round(value * 100) / 100).toBe(value);
  });

  it("returns an empty report with a helpful note when there is no data", () => {
    const r = buildLeakReport([], TODAY);
    expect(r).toMatchObject({ periodStart: null, periodEnd: null, monthsCovered: 0, transactionCount: 0, subscriptions: [] });
    expect(r.totals.foundAnnual).toBe(0);
    expect(r.coverageNote).toMatch(/upload/i);
  });

  it("asks for more history when statements cover under 3 months", () => {
    const r = buildLeakReport([txn("2026-09-01", "Figma", 15), txn("2026-10-15", "Figma", 15)], TODAY);
    expect(r.coverageNote).toMatch(/3 months/);
  });

  it("mentions yearly plans when statements cover under a year", () => {
    const r = buildLeakReport(monthly("Figma", 15, "2026-04-01", 6), TODAY);
    expect(r.coverageNote).toMatch(/yearly/i);
  });

  it("skips rows with malformed dates", () => {
    const r = buildLeakReport([txn("2026-02-30", "Figma", 15), txn("2026-03-01", "Figma", 15)], TODAY);
    expect(r.transactionCount).toBe(1);
  });

  it("rejects a malformed today", () => {
    expect(() => buildLeakReport([], "11/15/2026")).toThrow(RangeError);
  });
});
