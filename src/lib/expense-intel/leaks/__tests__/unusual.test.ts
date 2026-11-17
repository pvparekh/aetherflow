import { describe, expect, it } from "vitest";
import { buildLeakReport } from "../report";
import { timesText } from "../unusual";
import { addDays } from "../dates";
import { monthly, txn } from "./fixtures";

const TODAY = "2026-11-15";
const JARGON = /z-?score|standard deviation|\bmad\b|median|baseline|sigma|deviation|outlier/i;

function visits(rawVendor: string, amounts: number[], category: string, start = "2026-03-02", every = 9) {
  return amounts.map((amount, i) => txn(addDays(start, i * every), rawVendor, amount, category));
}

describe("unusual charges", () => {
  it("flags a charge far above the vendor's own usual amount, in plain English", () => {
    const lunches = visits("CHIPOTLE 1734", [12.4, 13.1, 11.85, 12.95, 14.2, 12.6, 13.45], "Food/Dining");
    const catering = txn("2026-06-20", "CHIPOTLE 1734", 186.5, "Food/Dining");
    const r = buildLeakReport([...lunches, catering], TODAY);

    expect(r.unusual).toEqual([
      {
        transactionId: catering.id,
        vendor: "Chipotle",
        category: "Food/Dining",
        date: "2026-06-20",
        amount: 186.5,
        typicalAmount: 12.95,
        baseline: "vendor",
        reason: "$186.50 is about 14 times your usual $12.95 at Chipotle.",
        severity: "critical",
      },
    ]);
  });

  it("falls back to the category when the vendor is new", () => {
    const outings = visits("AMC THEATRES 00123", [24, 31.5, 18.75, 42, 27.3, 35.1, 22.9, 29.99, 38.4, 26.25, 33.6], "Entertainment", "2026-01-05", 14);
    const tickets = txn("2026-08-14", "StubHub", 1395, "Entertainment");
    const r = buildLeakReport([...outings, tickets], TODAY);

    expect(r.unusual).toHaveLength(1);
    expect(r.unusual[0]).toMatchObject({ transactionId: tickets.id, baseline: "category", severity: "critical", typicalAmount: 29.99 });
    expect(r.unusual[0].reason).toBe("$1,395.00 is about 47 times a typical Entertainment charge of $29.99.");
  });

  it("never judges lumpy categories against the category", () => {
    // A flight next to subway fares, or a chair next to printer paper, is normal.
    const fares = visits("MTA NYCT PAYGO", [2.9, 2.9, 2.9, 2.9, 2.9, 2.9, 2.9, 2.9, 2.9, 2.9, 2.9], "Travel/Transport", "2026-01-05", 7);
    const supplies = visits("STAPLES 00123", [24, 31.5, 18.75, 42, 27.3, 35.1, 22.9, 29.99, 38.4, 26.25, 33.6], "Office/Supplies", "2026-01-05", 14);
    const r = buildLeakReport(
      [...fares, ...supplies, txn("2026-08-14", "JETBLUE 2792345", 412.3, "Travel/Transport"), txn("2026-08-15", "Herman Miller Store", 1395, "Office/Supplies")],
      TODAY,
    );
    expect(r.unusual).toEqual([]);
  });

  it("does not flag a category charge that is within its usual range", () => {
    // Dinners up to about $140 are normal here, so $160 is not unusual even
    // though it is many times the typical coffee-sized charge.
    const coffee = visits("Blue Bottle", [4.5, 5, 4.75, 5.25, 4.5, 5, 4.75, 5, 4.5, 5.25, 4.75, 5], "Food/Dining", "2026-01-05", 7);
    const dinners = [txn("2026-03-01", "Lilia", 128.4, "Food/Dining"), txn("2026-05-02", "Via Carota", 141.3, "Food/Dining")];
    const r = buildLeakReport([...coffee, ...dinners, txn("2026-08-20", "Carbone", 160, "Food/Dining")], TODAY);
    expect(r.unusual).toEqual([]);
  });

  it("uses a warning, not critical, for a charge about twice the usual", () => {
    const lunches = visits("Sweetgreen", [15, 15.5, 15.25, 15, 15.75, 15.5], "Food/Dining");
    const r = buildLeakReport([...lunches, txn("2026-06-22", "Sweetgreen", 36.4, "Food/Dining")], TODAY);
    expect(r.unusual).toHaveLength(1);
    expect(r.unusual[0].severity).toBe("warning");
    expect(r.unusual[0].reason).toBe("$36.40 is about 2.5 times your usual $15.38 at Sweetgreen.");
  });

  it("never uses statistics jargon in reasons", () => {
    const lunches = visits("CHIPOTLE 1734", [12.4, 13.1, 11.85, 12.95, 14.2, 12.6], "Food/Dining");
    const outings = visits("AMC Theatres", [24, 31.5, 18.75, 42, 27.3, 35.1, 22.9, 29.99, 38.4, 26.25], "Entertainment");
    const r = buildLeakReport(
      [...lunches, ...outings, txn("2026-06-20", "CHIPOTLE 1734", 186.5, "Food/Dining"), txn("2026-06-21", "StubHub", 900, "Entertainment")],
      TODAY,
    );
    expect(r.unusual.length).toBeGreaterThan(1);
    for (const u of r.unusual) expect(u.reason).not.toMatch(JARGON);
  });

  it("does not flag a few dollars over a small usual amount", () => {
    const coffee = visits("Blue Bottle", [4.5, 4.75, 4.5, 4.25, 4.5, 4.5], "Food/Dining");
    const r = buildLeakReport([...coffee, txn("2026-06-20", "Blue Bottle", 16.2, "Food/Dining")], TODAY);
    expect(r.unusual).toEqual([]);
  });

  it("does not flag a vendor whose amounts normally swing widely", () => {
    const dinners = visits("Nopa Restaurant", [38, 92, 55, 140, 47, 118, 66, 85], "Food/Dining");
    const r = buildLeakReport([...dinners, txn("2026-06-20", "Nopa Restaurant", 165, "Food/Dining")], TODAY);
    expect(r.unusual).toEqual([]);
  });

  it("does not flag subscription charges or the rent", () => {
    const software = monthly("GitHub", 4, "2026-01-08", 10);
    const bigPlan = monthly("Salesforce", 300, "2026-01-12", 10);
    const rent = monthly("Oakwood Apartments", 2150, "2026-01-01", 10, "Misc");
    const misc = visits("Etsy", [18, 22, 25, 19, 30, 21, 24, 27, 20, 23], "Misc");
    const r = buildLeakReport([...software, ...bigPlan, ...rent, ...misc], TODAY);
    expect(r.unusual).toEqual([]);
  });

  it("needs enough history before judging", () => {
    const r = buildLeakReport([txn("2026-06-01", "Lumber Yard", 12, "Misc"), txn("2026-06-02", "Lumber Yard", 900, "Misc")], TODAY);
    expect(r.unusual).toEqual([]);
  });
});

describe("timesText", () => {
  it.each([
    [2.04, "about twice"],
    [2.3, "about 2.5 times"],
    [3.9, "about 4 times"],
    [14.4, "about 14 times"],
  ])("%s -> %s", (ratio, text) => expect(timesText(ratio)).toBe(text));
});
