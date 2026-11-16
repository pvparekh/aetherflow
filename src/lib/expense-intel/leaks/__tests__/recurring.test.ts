import { describe, expect, it } from "vitest";
import { buildLeakReport } from "../report";
import { addDays } from "../dates";
import { everyNDays, monthly, periodMarkers, seeded, txn } from "./fixtures";

const TODAY = "2026-11-15";

function report(...groups: ReturnType<typeof txn>[][]) {
  return buildLeakReport(groups.flat(), TODAY);
}

describe("recurring charges: detected", () => {
  it("finds a monthly subscription with its annual cost and next date", () => {
    const netflix = monthly("NETFLIX.COM 866-579-7172 CA", 15.49, "2026-05-07", 6, "Entertainment");
    const r = report(netflix, periodMarkers("2026-05-01", "2026-10-31"));

    expect(r.subscriptions).toHaveLength(1);
    expect(r.subscriptions[0]).toMatchObject({
      key: "netflix:monthly",
      vendor: "Netflix",
      cadence: "monthly",
      typicalAmount: 15.49,
      lastAmount: 15.49,
      lastDate: "2026-10-07",
      nextExpectedDate: "2026-12-07", // Nov 7 is before today, so the next one ahead
      annualCost: 185.88,
      occurrences: 6,
      confidence: "high",
      status: "active",
      category: "Entertainment",
    });
    expect(r.subscriptions[0].transactionIds).toEqual(netflix.map((t) => t.id));
    expect(r.priceChanges).toEqual([]);
  });

  it("keeps a bill on the 31st on month ends instead of drifting", () => {
    const dates = ["2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-31"];
    const r = buildLeakReport(
      dates.map((d) => txn(d, "Figma", 15)),
      "2026-11-01",
    );
    expect(r.subscriptions[0]).toMatchObject({ cadence: "monthly", nextExpectedDate: "2026-11-30" });
  });

  it("finds an annual renewal from two charges a year apart", () => {
    const r = report([txn("2025-03-10", "1Password", 35.88), txn("2026-03-12", "1Password", 35.88)], periodMarkers("2025-03-01", "2026-10-31"));
    expect(r.subscriptions).toHaveLength(1);
    expect(r.subscriptions[0]).toMatchObject({
      cadence: "annual",
      annualCost: 35.88,
      nextExpectedDate: "2027-03-12",
      confidence: "medium",
      status: "active",
    });
  });

  it("tolerates one missing statement month but lowers confidence", () => {
    const charges = monthly("Notion Labs", 10, "2026-03-15", 8).filter((t) => t.date !== "2026-06-15");
    const r = report(charges, periodMarkers("2026-03-01", "2026-10-31"));
    expect(r.subscriptions).toHaveLength(1);
    expect(r.subscriptions[0]).toMatchObject({ cadence: "monthly", occurrences: 7, confidence: "medium" });
  });

  it("accepts a varying utility bill that arrives on a steady day", () => {
    const amounts = [82.4, 91.1, 78.95, 86.3, 88.0, 80.75];
    const r = report(monthly("PG&E WEB ONLINE", amounts, "2026-05-18", 6, "Utilities"), periodMarkers("2026-05-01", "2026-10-31"));
    expect(r.subscriptions).toHaveLength(1);
    expect(r.subscriptions[0]).toMatchObject({ cadence: "monthly", confidence: "medium", typicalAmount: 84.35 });
    expect(r.priceChanges).toEqual([]);
  });

  it("finds a weekly fixed-price plan at a vendor with no other spending", () => {
    const r = report(everyNDays("HELLOFRESH", 69.99, "2026-08-24", 10, 7, "Food/Dining"), periodMarkers("2026-08-01", "2026-10-31"));
    expect(r.subscriptions[0]).toMatchObject({ cadence: "weekly", annualCost: 3639.48, status: "active" });
  });

  it("finds a subscription inside a vendor that also has one-off purchases", () => {
    const prime = monthly("AMAZON PRIME*2K4AB91", 14.99, "2026-04-12", 7, "Misc");
    const rand = seeded(7);
    const shopping = Array.from({ length: 25 }, (_, i) =>
      txn(addDays("2026-04-01", i * 8 + Math.floor(rand() * 5)), "AMZN Mktp US*8H31K", Math.round((8 + rand() * 120) * 100) / 100, "Office/Supplies"),
    );
    const r = report(prime, shopping, periodMarkers("2026-04-01", "2026-10-31"));
    expect(r.subscriptions).toHaveLength(1);
    expect(r.subscriptions[0]).toMatchObject({ vendor: "Amazon", cadence: "monthly", typicalAmount: 14.99 });
    expect(r.subscriptions[0].transactionIds).toEqual(prime.map((t) => t.id));
  });

  it("treats two seats billed together each month as two subscriptions", () => {
    const seatA = monthly("SLACK T0123ABC", 8.75, "2026-05-02", 6);
    const seatB = monthly("SLACK T0123ABC", 8.75, "2026-05-02", 6);
    const r = report(seatA, seatB, periodMarkers("2026-05-01", "2026-10-31"));
    expect(r.subscriptions.map((s) => s.key).sort()).toEqual(["slack:monthly", "slack:monthly:2"]);
    expect(r.totals.subscriptionsAnnual).toBe(210);
    expect(r.duplicates).toEqual([]);
  });

  it("ignores a single one-off amount in the middle of a subscription", () => {
    const netflix = monthly("Netflix", 15.49, "2026-04-07", 7, "Entertainment");
    const extra = txn("2026-07-20", "Netflix", 45, "Entertainment");
    const r = report(netflix, [extra], periodMarkers("2026-04-01", "2026-10-31"));
    expect(r.subscriptions).toHaveLength(1);
    expect(r.subscriptions[0].transactionIds).not.toContain(extra.id);
  });
});

describe("recurring charges: not subscriptions", () => {
  it("does not call rent a subscription, however regular", () => {
    const rent = monthly("OAKWOOD APARTMENTS ONLINE PMT", 2150, "2026-01-01", 10, "Misc");
    const pm = monthly("Greystar Property Management", 1890, "2026-01-03", 10, "Misc");
    const lodging = monthly("Harbor Lofts", 1750, "2026-01-01", 10, "Accommodation");
    const r = report(rent, pm, lodging);
    expect(r.subscriptions).toEqual([]);
  });

  it("does not call rent paid by transfer a subscription", () => {
    const r = report(monthly("ZELLE PAYMENT TO J SMITH", 1400, "2026-01-01", 10, "Misc"));
    expect(r.subscriptions).toEqual([]);
  });

  it("does not call irregular grocery shopping a subscription", () => {
    const rand = seeded(42);
    const groceries = Array.from({ length: 40 }, (_, i) =>
      txn(addDays("2026-01-03", i * 7 + Math.floor(rand() * 3)), "WHOLEFDS MKT #10234", Math.round((45 + rand() * 110) * 100) / 100, "Food/Dining"),
    );
    expect(report(groceries).subscriptions).toEqual([]);
  });

  it("does not call a monthly shopping habit with similar totals a subscription", () => {
    const amounts = [212.4, 198.75, 226.1, 205.3, 219.95, 201.6, 209.8];
    expect(report(monthly("COSTCO WHSE #0482", amounts, "2026-03-14", 7, "Food/Dining")).subscriptions).toEqual([]);
  });

  it("does not call the usual weekly coffee a subscription", () => {
    const mondays = everyNDays("STARBUCKS STORE 1123", 5.45, "2026-06-01", 12, 7, "Food/Dining");
    const others = [txn("2026-06-10", "STARBUCKS STORE 1123", 8.9, "Food/Dining"), txn("2026-07-22", "STARBUCKS STORE 1123", 12.15, "Food/Dining")];
    expect(report(mondays, others).subscriptions).toEqual([]);
  });

  it("does not trust a same-price weekly habit with fewer than 5 visits", () => {
    expect(report(everyNDays("Blue Bottle", 6, "2026-09-01", 4, 7, "Food/Dining")).subscriptions).toEqual([]);
  });

  it("needs at least 3 monthly charges", () => {
    expect(report(monthly("Calm", 14.99, "2026-08-01", 2)).subscriptions).toEqual([]);
  });

  it("does not call same-price visits at uneven gaps a subscription", () => {
    const dates = ["2026-01-05", "2026-02-02", "2026-03-19", "2026-04-21", "2026-06-20", "2026-07-18"];
    expect(report(dates.map((d) => txn(d, "Fade Masters Barbers", 40, "Misc"))).subscriptions).toEqual([]);
  });

  it("does not call two store visits a year apart at different prices an annual plan", () => {
    const r = report([txn("2025-12-12", "Toy Haven", 84.2, "Misc"), txn("2026-12-18", "Toy Haven", 97.55, "Misc")]);
    expect(r.subscriptions).toEqual([]);
  });
});

describe("cancelled subscriptions", () => {
  it("marks a stream possibly cancelled when charges stop and leaves it out of totals", () => {
    const hulu = monthly("HULU 877-8244858 CA", [7.99, 7.99, 9.99, 9.99, 9.99], "2026-01-20", 5, "Entertainment");
    const r = report(hulu, periodMarkers("2026-01-01", "2026-10-31"));
    expect(r.subscriptions[0]).toMatchObject({ status: "possibly_cancelled", nextExpectedDate: "2026-06-20" });
    expect(r.totals.subscriptionsAnnual).toBe(0);
    expect(r.priceChanges).toEqual([]); // a price rise on a cancelled plan costs nothing now
  });

  it("is not fooled by old statements: overdue is judged at the last statement date", () => {
    const spotify = monthly("Spotify USA", 11.99, "2026-01-09", 6, "Entertainment");
    const r = report(spotify, periodMarkers("2026-01-01", "2026-06-30"));
    expect(r.subscriptions[0]).toMatchObject({ status: "active", nextExpectedDate: "2026-12-09" });
  });

  it("allows a late charge inside the grace period", () => {
    const r = buildLeakReport([...monthly("Spotify USA", 11.99, "2026-04-09", 6, "Entertainment"), ...periodMarkers("2026-04-01", "2026-10-30")], "2026-10-30");
    // Next due Oct 9 was not seen by Oct 30: 21 days late, under half a month plus 7 days.
    expect(r.subscriptions[0].status).toBe("active");
  });
});
