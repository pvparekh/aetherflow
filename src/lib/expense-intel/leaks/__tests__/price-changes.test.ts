import { describe, expect, it } from "vitest";
import { buildLeakReport } from "../report";
import { addDays } from "../dates";
import { monthly, periodMarkers, seeded, txn } from "./fixtures";

const TODAY = "2026-11-15";

describe("price increases", () => {
  it("reports a monthly increase once the new price has repeated", () => {
    const spotify = monthly("Spotify USA", [10.99, 10.99, 10.99, 10.99, 11.99, 11.99], "2026-05-09", 6, "Entertainment");
    const r = buildLeakReport([...spotify, ...periodMarkers("2026-05-01", "2026-10-31")], TODAY);

    expect(r.priceChanges).toEqual([
      {
        streamKey: "spotify:monthly",
        vendor: "Spotify",
        previousAmount: 10.99,
        newAmount: 11.99,
        changedOn: "2026-09-09",
        pct: 9.1,
        annualImpact: 12,
      },
    ]);
    expect(r.subscriptions[0]).toMatchObject({ annualCost: 143.88, typicalAmount: 10.99, lastAmount: 11.99 });
    expect(r.totals.priceIncreasesAnnual).toBe(12);
  });

  it("waits for a second charge at the new price before reporting", () => {
    const spotify = monthly("Spotify USA", [10.99, 10.99, 10.99, 10.99, 10.99, 11.99], "2026-05-09", 6, "Entertainment");
    const r = buildLeakReport([...spotify, ...periodMarkers("2026-05-01", "2026-10-31")], TODAY);
    expect(r.subscriptions).toHaveLength(1);
    expect(r.subscriptions[0].annualCost).toBe(131.88); // still the established price
    expect(r.priceChanges).toEqual([]);
  });

  it("reports an annual renewal at a higher price from the latest charge", () => {
    const r = buildLeakReport(
      [txn("2025-02-01", "Dropbox", 119.88), txn("2026-02-01", "Dropbox", 143.88), ...periodMarkers("2025-01-15", "2026-10-31")],
      TODAY,
    );
    expect(r.priceChanges).toEqual([
      expect.objectContaining({ previousAmount: 119.88, newAmount: 143.88, pct: 20, annualImpact: 24, changedOn: "2026-02-01" }),
    ]);
    expect(r.subscriptions[0].annualCost).toBe(143.88);
  });

  it("follows a price change inside a vendor that also has one-off purchases", () => {
    const appleTv = monthly("APPLE.COM/BILL 866-712-7753", [9.99, 9.99, 9.99, 12.99, 12.99, 12.99], "2026-05-03", 6, "Entertainment");
    const rand = seeded(3);
    const apps = Array.from({ length: 6 }, (_, i) =>
      txn(addDays("2026-05-10", i * 29 + Math.floor(rand() * 9)), "APPLE.COM/BILL", [0.99, 4.99, 2.99, 6.99, 1.99, 3.99][i], "Entertainment"),
    );
    const r = buildLeakReport([...appleTv, ...apps, ...periodMarkers("2026-05-01", "2026-10-31")], TODAY);
    expect(r.subscriptions).toHaveLength(1);
    expect(r.subscriptions[0]).toMatchObject({ status: "active", occurrences: 6 });
    expect(r.priceChanges).toEqual([expect.objectContaining({ previousAmount: 9.99, newAmount: 12.99, annualImpact: 36 })]);
  });

  it("does not read a cheaper prorated first charge as an increase", () => {
    const r = buildLeakReport([...monthly("Linear", [4.17, 10, 10, 10, 10, 10], "2026-05-20", 6), ...periodMarkers("2026-05-01", "2026-10-31")], TODAY);
    expect(r.subscriptions).toHaveLength(1);
    expect(r.priceChanges).toEqual([]);
  });

  it("does not report a price decrease as a leak", () => {
    const r = buildLeakReport([...monthly("Canva", [14.99, 14.99, 14.99, 12.99, 12.99, 12.99], "2026-05-20", 6), ...periodMarkers("2026-05-01", "2026-10-31")], TODAY);
    expect(r.priceChanges).toEqual([]);
    expect(r.subscriptions[0].annualCost).toBe(155.88);
  });

  it("does not read a varying utility bill as price increases", () => {
    const amounts = [61.2, 61.5, 74.8, 75.1, 63.0, 70.4, 70.6];
    const r = buildLeakReport([...monthly("Comcast", amounts, "2026-04-11", 7, "Utilities"), ...periodMarkers("2026-04-01", "2026-10-31")], TODAY);
    expect(r.subscriptions).toHaveLength(1);
    expect(r.priceChanges).toEqual([]);
  });

  it("ignores increases below 50 cents or 3%", () => {
    const r = buildLeakReport([...monthly("Zoom.us", [15.99, 15.99, 15.99, 16.29, 16.29, 16.29], "2026-05-20", 6), ...periodMarkers("2026-05-01", "2026-10-31")], TODAY);
    expect(r.priceChanges).toEqual([]);
  });
});
