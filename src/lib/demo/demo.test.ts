import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { vendorKey } from "@/lib/expense-intel/normalize";
import { CATEGORIES } from "@/lib/expense-intel/types";
import { generateDemoRows, type DemoRow } from "./generate";
import {
  DEMO_PERIOD,
  DEMO_PLANTED,
  DEMO_SUBSCRIPTIONS,
  demoLineItems,
  demoRows,
  demoTxns,
} from "./index";

const rows = demoRows();
const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY_MS;
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const tagged = (tag: string) => rows.filter((r) => r.tag === tag);

function intervals(dates: string[]): number[] {
  const sorted = [...dates].sort();
  return sorted.slice(1).map((d, i) => daysBetween(sorted[i], d));
}

function coefficientOfVariation(values: number[]): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

describe("demo generator", () => {
  it("is deterministic: same seed, same rows", () => {
    expect(generateDemoRows()).toEqual(generateDemoRows());
    expect(generateDemoRows(1)).toEqual(generateDemoRows(1));
    expect(generateDemoRows(1)).not.toEqual(generateDemoRows());
  });

  it("covers the 12 months ending 2026-10-31 with about 600 rows", () => {
    expect(rows.length).toBeGreaterThanOrEqual(560);
    expect(rows.length).toBeLessThanOrEqual(660);
    expect(rows[0].date).toBe(DEMO_PERIOD.start);
    expect(rows.at(-1)!.date <= DEMO_PERIOD.end).toBe(true);
    const months = new Map<string, number>();
    for (const r of rows) months.set(r.date.slice(0, 7), (months.get(r.date.slice(0, 7)) ?? 0) + 1);
    expect(months.size).toBe(12);
    for (const count of months.values()) expect(count).toBeGreaterThanOrEqual(35);
  });

  it("produces well-formed rows", () => {
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.size).toBe(rows.length);
    for (const r of rows) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.amount).toBeGreaterThan(0);
      expect(Math.round(r.amount * 100) / 100).toBe(r.amount);
      expect(CATEGORIES).toContain(r.category);
      expect(r.descriptor.trim()).toBe(r.descriptor);
      expect(r.subcategory.length).toBeGreaterThan(0);
    }
    const dates = rows.map((r) => r.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("uses every category except where the persona has no reason to", () => {
    const used = new Set(rows.map((r) => r.category));
    for (const category of CATEGORIES) expect(used, category).toContain(category);
  });

  it("follows weekday rhythms: coffee on workdays, restaurants at weekends", () => {
    const share = (subcategory: string, days: number[]) => {
      const matching = rows.filter((r) => r.subcategory === subcategory);
      return matching.filter((r) => days.includes(weekday(r.date))).length / matching.length;
    };
    expect(share("Coffee", [1, 2, 3, 4, 5])).toBeGreaterThan(0.7);
    expect(share("Restaurants", [5, 6])).toBeGreaterThan(0.4);
    expect(share("Co-working", [0, 6])).toBe(0);
  });
});

describe("planted subscriptions", () => {
  it.each(DEMO_SUBSCRIPTIONS.map((s) => [s.id, s] as const))("%s is billed as declared", (id, sub) => {
    const charges = tagged(`subscription:${id}`);
    const keys = new Set(sub.descriptors.map(vendorKey));
    expect(keys.size, "all descriptors of one subscription share a vendor key").toBe(1);
    expect(new Set(charges.map((c) => vendorKey(c.descriptor)))).toEqual(keys);

    if (sub.cadence === "annual") {
      expect(charges.map((c) => c.date)).toEqual(sub.dates);
      return;
    }
    const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
    const expectedCount = monthIndex(sub.lastCharge ?? DEMO_PERIOD.end) - monthIndex(DEMO_PERIOD.start) + 1;
    expect(charges).toHaveLength(expectedCount);
    for (const c of charges) expect(Number(c.date.slice(8, 10))).toBe(sub.day);
  });

  it("no other merchant shares a vendor key with a subscription", () => {
    const subKeys = new Set(DEMO_SUBSCRIPTIONS.map((s) => vendorKey(s.descriptors[0])));
    const others = rows.filter((r) => !r.tag?.startsWith("subscription:"));
    for (const r of others) expect(subKeys.has(vendorKey(r.descriptor)), r.descriptor).toBe(false);
  });

  it("has one annual plan, one price increase, one cancellation and one forgotten charge", () => {
    const stories = DEMO_SUBSCRIPTIONS.map((s) => s.story).filter(Boolean).sort();
    expect(stories).toEqual(["annual", "cancelled", "forgotten", "price_increase"]);
    expect(DEMO_SUBSCRIPTIONS.length).toBeGreaterThanOrEqual(10);
    expect(DEMO_SUBSCRIPTIONS.length).toBeLessThanOrEqual(14);
  });

  it("raises Adobe once, and the new price persists", () => {
    const [change] = DEMO_PLANTED.priceChanges;
    const amounts = tagged(`subscription:${change.subscriptionId}`).map((c) => [c.date, c.amount]);
    const before = amounts.filter(([d]) => d < change.changedOn).map(([, a]) => a);
    const after = amounts.filter(([d]) => d >= change.changedOn).map(([, a]) => a);
    expect(new Set(before)).toEqual(new Set([change.previousAmount]));
    expect(new Set(after)).toEqual(new Set([change.newAmount]));
    expect(after.length).toBeGreaterThanOrEqual(2);
    expect(amounts.find(([, a]) => a === change.newAmount)![0]).toBe(change.changedOn);
  });

  it("stops billing the cancelled subscription long before the demo's today", () => {
    const cancelled = DEMO_SUBSCRIPTIONS.find((s) => s.story === "cancelled")!;
    const last = tagged(`subscription:${cancelled.id}`).at(-1)!;
    expect(last.date).toBe(cancelled.lastCharge);
    expect(daysBetween(last.date, DEMO_PLANTED.today)).toBeGreaterThan(60);
  });
});

describe("planted duplicate and unusual charges", () => {
  it("contains exactly one same-merchant, same-amount pair within 3 days: the planted one", () => {
    const pairs: [DemoRow, DemoRow][] = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length && daysBetween(rows[i].date, rows[j].date) <= 3; j++) {
        if (rows[i].amount === rows[j].amount && vendorKey(rows[i].descriptor) === vendorKey(rows[j].descriptor)) {
          pairs.push([rows[i], rows[j]]);
        }
      }
    }
    const [dup] = DEMO_PLANTED.duplicates;
    expect(pairs.map(([a, b]) => [a.descriptor, a.amount, a.date, b.date])).toEqual([
      [dup.descriptor, dup.amount, ...dup.dates],
    ]);
  });

  it("the duplicate's merchant also appears at other amounts, as a real restaurant would", () => {
    const [dup] = DEMO_PLANTED.duplicates;
    const visits = rows.filter((r) => vendorKey(r.descriptor) === vendorKey(dup.descriptor));
    expect(visits.length).toBeGreaterThanOrEqual(4);
  });

  it("the vendor-baseline outlier stands far above that vendor's other charges", () => {
    const planted = DEMO_PLANTED.unusual.find((u) => u.baseline === "vendor")!;
    const history = rows.filter(
      (r) => vendorKey(r.descriptor) === vendorKey(planted.descriptor) && r.tag === null,
    );
    expect(history.length).toBeGreaterThanOrEqual(5);
    expect(planted.amount).toBeGreaterThan(3 * Math.max(...history.map((r) => r.amount)));
  });

  it("the category-baseline outlier is a one-off merchant far above the rest of its category", () => {
    const planted = DEMO_PLANTED.unusual.find((u) => u.baseline === "category")!;
    expect(rows.filter((r) => vendorKey(r.descriptor) === vendorKey(planted.descriptor))).toHaveLength(1);
    const rest = rows.filter((r) => r.category === planted.category && r.tag !== `unusual:${planted.id}`);
    expect(planted.amount).toBeGreaterThan(2.5 * Math.max(...rest.map((r) => r.amount)));
  });
});

describe("negatives: repeat spending that is not a subscription", () => {
  it("groceries are frequent but irregular in timing and amount", () => {
    const [traderJoes] = DEMO_PLANTED.negatives[0].descriptors;
    const visits = rows.filter((r) => r.descriptor === traderJoes);
    expect(visits.length).toBeGreaterThanOrEqual(15);
    expect(coefficientOfVariation(visits.map((v) => v.amount))).toBeGreaterThan(0.3);
    expect(coefficientOfVariation(intervals(visits.map((v) => v.date)))).toBeGreaterThan(0.5);
  });

  it("rent is a monthly transfer under one vendor key, paid on varying days and twice split", () => {
    const rent = tagged("negative:rent");
    expect(new Set(rent.map((r) => vendorKey(r.descriptor))).size).toBe(1);
    expect(new Set(rent.map((r) => r.date.slice(0, 7))).size).toBe(12);
    expect(new Set(rent.map((r) => r.date.slice(8))).size).toBeGreaterThan(3);
    expect(rent.length).toBe(14);
  });

  it("co-working passes are bought on irregular workdays", () => {
    const passes = tagged("negative:coworking");
    expect(passes.length).toBeGreaterThanOrEqual(15);
    expect(coefficientOfVariation(intervals(passes.map((p) => p.date)))).toBeGreaterThan(0.5);
    for (const gap of intervals(passes.map((p) => p.date))) expect(gap).toBeGreaterThan(3);
  });
});

describe("demo exports", () => {
  it("demoLineItems mirrors the rows, one upload per month", () => {
    const items = demoLineItems();
    expect(items).toHaveLength(rows.length);
    expect(new Set(items.map((i) => i.upload_id)).size).toBe(12);
    expect(items[0]).toMatchObject({
      id: rows[0].id,
      vendor: rows[0].descriptor,
      amount: rows[0].amount,
      transaction_date: rows[0].date,
      category: rows[0].category,
    });
  });

  it("demoTxns keeps every row and normalises vendors", () => {
    const txns = demoTxns();
    expect(txns).toHaveLength(rows.length);
    const adobe = txns.find((t) => t.id === tagged("subscription:adobe")[0].id)!;
    expect(adobe.vendorKey).toBe(vendorKey(DEMO_SUBSCRIPTIONS[0].descriptors[0]));
    expect(adobe.amount).toBe(59.99);
  });

  it("returns copies, so callers cannot corrupt the cached dataset", () => {
    demoRows()[0].amount = -1;
    expect(demoRows()[0].amount).toBeGreaterThan(0);
  });

  it("stays isomorphic: no server-only imports", () => {
    for (const file of ["index.ts", "generate.ts", "planted.ts", "prng.ts"]) {
      const source = readFileSync(path.join(__dirname, file), "utf8");
      const imports = [...source.matchAll(/^(?:import|export)\b[^;]*?\bfrom\s+"([^"]+)"/gm)].map((m) => m[1]);      for (const spec of imports) {
        expect(spec, `${file} imports ${spec}`).toMatch(
          /^(\.\/|@\/lib\/expense-intel\/(contracts|types|normalize)$)/,
        );
      }
    }
  });
});
