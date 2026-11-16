// eval:ci — the leak engine finds exactly the leaks planted in the demo data.
//
// Skipped until workstream B's module exists at src/lib/expense-intel/leaks/.
// The module is loaded by a runtime specifier so this file typechecks and
// runs before B lands; once it exists, import errors fail loudly instead of
// being mistaken for "not available".
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_PLANTED, DEMO_SUBSCRIPTIONS, demoRows, demoTxns } from "@/lib/demo";
import type { LeakReport, Txn } from "@/lib/expense-intel/contracts";
import { vendorKey } from "@/lib/expense-intel/normalize";

const LEAKS_DIR = path.resolve("src", "lib", "expense-intel", "leaks");
const leakEngineAvailable = ["index.ts", "index.tsx"].some((f) => existsSync(path.join(LEAKS_DIR, f)));

interface LeakEngine {
  buildLeakReport(txns: Txn[], today: string): LeakReport;
}

const keysOf = (descriptors: readonly string[]) => [...new Set(descriptors.map(vendorKey))];
const sorted = (values: Iterable<string>) => [...values].sort();

describe.skipIf(!leakEngineAvailable)("leak engine on the demo dataset", () => {
  let report: LeakReport;
  let txns: Txn[];

  beforeAll(async () => {
    const specifier = "@/lib/expense-intel/leaks";
    const engine = (await import(/* @vite-ignore */ specifier)) as LeakEngine;
    txns = demoTxns();
    report = engine.buildLeakReport(txns, DEMO_PLANTED.today);
  });

  it("finds exactly the planted subscriptions", () => {
    const expected = DEMO_SUBSCRIPTIONS.map((s) => vendorKey(s.descriptors[0]));
    expect(sorted(report.subscriptions.map((s) => s.vendorKey))).toEqual(sorted(expected));
  });

  it.each(DEMO_SUBSCRIPTIONS.map((s) => [s.id, s] as const))("%s has the planted cadence and status", (_id, sub) => {
    const stream = report.subscriptions.find((s) => s.vendorKey === vendorKey(sub.descriptors[0]));
    expect(stream).toBeDefined();
    expect(stream!.cadence).toBe(sub.cadence);
    expect(stream!.status).toBe(sub.status);
    expect(stream!.lastAmount).toBe(sub.priceChange?.amount ?? sub.amount);
  });

  it("finds exactly the planted price change", () => {
    const expected = DEMO_PLANTED.priceChanges.map((p) => {
      const sub = DEMO_SUBSCRIPTIONS.find((s) => s.id === p.subscriptionId)!;
      return { vendorKey: vendorKey(sub.descriptors[0]), ...p };
    });
    const streamKey = (key: string) => report.subscriptions.find((s) => s.key === key)?.vendorKey;
    expect(
      report.priceChanges.map((p) => ({
        vendorKey: streamKey(p.streamKey),
        previousAmount: p.previousAmount,
        newAmount: p.newAmount,
        changedOn: p.changedOn,
      })),
    ).toEqual(
      expected.map(({ vendorKey: key, previousAmount, newAmount, changedOn }) => ({
        vendorKey: key,
        previousAmount,
        newAmount,
        changedOn,
      })),
    );
  });

  it("finds exactly the planted duplicate", () => {
    expect(
      report.duplicates.map((d) => ({ vendorKey: d.vendorKey, amount: d.amount, dates: sorted(d.dates) })),
    ).toEqual(
      DEMO_PLANTED.duplicates.map((d) => ({
        vendorKey: vendorKey(d.descriptor),
        amount: d.amount,
        dates: sorted(d.dates),
      })),
    );
  });

  it("flags both planted unusual charges", () => {
    const plantedIds = DEMO_PLANTED.unusual.map(
      (u) => txns.find((t) => t.date === u.date && t.amount === u.amount && t.vendorKey === vendorKey(u.descriptor))!.id,
    );
    expect(plantedIds.every(Boolean)).toBe(true);
    const flagged = new Set(report.unusual.map((u) => u.transactionId));
    for (const id of plantedIds) expect(flagged.has(id), id).toBe(true);
  });

  it("flags no other unusual charges", () => {
    // The strictest check. If B's category scoring legitimately flags other
    // demo rows (one-off flights, the hotel), adjust the demo data rather than
    // loosening this: the demo's unusual list is what recruiters see first.
    const planted = new Set(DEMO_PLANTED.unusual.map((u) => `${u.date}|${u.amount}`));
    const extra = report.unusual.filter((u) => !planted.has(`${u.date}|${u.amount}`));
    expect(extra.map((u) => `${u.date} ${u.vendor} ${u.amount}: ${u.reason}`)).toEqual([]);
  });

  it("does not report the negatives as subscriptions", () => {
    const subscriptionKeys = new Set(report.subscriptions.map((s) => s.vendorKey));
    const rows = demoRows();
    for (const negative of DEMO_PLANTED.negatives) {
      const descriptors = rows
        .filter((r) => negative.descriptors.some((d) => r.descriptor.startsWith(d)))
        .map((r) => r.descriptor);
      expect(descriptors.length, negative.vendor).toBeGreaterThan(0);
      for (const key of keysOf(descriptors)) expect(subscriptionKeys.has(key), `${negative.vendor} (${key})`).toBe(false);
    }
  });

  it("headline total is the price increase plus the duplicate, nothing guessed", () => {
    const priceIncrease = DEMO_PLANTED.priceChanges.reduce((sum, p) => sum + (p.newAmount - p.previousAmount) * 12, 0);
    const duplicate = DEMO_PLANTED.duplicates.reduce((sum, d) => sum + d.amount * (d.dates.length - 1), 0);
    expect(report.totals.foundAnnual).toBeCloseTo(priceIncrease + duplicate, 2);
  });
});

describe("leak engine availability", () => {
  it(`is ${leakEngineAvailable ? "present: planted-leak checks ran" : "not merged yet: planted-leak checks skipped"}`, () => {
    expect(typeof leakEngineAvailable).toBe("boolean");
  });
});
