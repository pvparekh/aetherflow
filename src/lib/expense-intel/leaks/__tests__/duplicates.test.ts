import { describe, expect, it } from "vitest";
import { buildLeakReport } from "../report";
import { everyNDays, monthly, periodMarkers, txn } from "./fixtures";

const TODAY = "2026-11-15";

describe("duplicate charges", () => {
  it("finds a subscription charged twice and keeps the stream intact", () => {
    const adobe = monthly("ADOBE *CREATIVE CLOUD", 54.99, "2026-05-14", 6);
    const extra = txn("2026-08-15", "ADOBE *CREATIVE CLOUD", 54.99);
    const r = buildLeakReport([...adobe, extra, ...periodMarkers("2026-05-01", "2026-10-31")], TODAY);

    expect(r.duplicates).toEqual([
      {
        vendor: "Adobe",
        vendorKey: "adobe",
        amount: 54.99,
        dates: ["2026-08-14", "2026-08-15"],
        transactionIds: [adobe[3].id, extra.id],
        extraCost: 54.99,
      },
    ]);
    expect(r.subscriptions).toHaveLength(1);
    expect(r.subscriptions[0]).toMatchObject({ occurrences: 6, annualCost: 659.88, confidence: "high" });
    expect(r.subscriptions[0].transactionIds).not.toContain(extra.id);
    expect(r.totals.duplicatesTotal).toBe(54.99);
  });

  it("finds a one-off double charge on the same statement", () => {
    const stay = [txn("2026-07-02", "MARRIOTT DOWNTOWN", 289.4, "Accommodation"), txn("2026-07-02", "MARRIOTT DOWNTOWN", 289.4, "Accommodation")];
    const r = buildLeakReport(stay, TODAY);
    expect(r.duplicates).toHaveLength(1);
    expect(r.duplicates[0]).toMatchObject({ extraCost: 289.4, dates: ["2026-07-02", "2026-07-02"] });
  });

  it("counts every extra charge in a triple charge", () => {
    const r = buildLeakReport(
      ["2026-07-02", "2026-07-03", "2026-07-04"].map((d) => txn(d, "Canva", 12.99)),
      TODAY,
    );
    expect(r.duplicates[0].extraCost).toBe(25.98);
  });

  it("ignores the same row repeated by overlapping statement uploads", () => {
    const march = txn("2026-03-30", "Delta Air Lines", 412.6, "Travel/Transport", { uploadId: "jan-mar" });
    const again = { ...march, id: "copy-of-march-row", uploadId: "mar-may" };
    expect(buildLeakReport([march, again], TODAY).duplicates).toEqual([]);
  });

  it("ignores charges more than 3 days apart", () => {
    const r = buildLeakReport([txn("2026-07-02", "Canva", 12.99), txn("2026-07-06", "Canva", 12.99)], TODAY);
    expect(r.duplicates).toEqual([]);
  });

  it("ignores a habitual purchase bought twice in a few days", () => {
    const coffee = ["2026-06-01", "2026-06-09", "2026-06-20", "2026-07-01", "2026-07-02"].map((d) =>
      txn(d, "Blue Bottle Coffee", 6.5, "Food/Dining"),
    );
    expect(buildLeakReport(coffee, TODAY).duplicates).toEqual([]);
  });

  it("ignores equal payments to people and cash withdrawals", () => {
    const r = buildLeakReport(
      [
        txn("2026-07-02", "VENMO PAYMENT 1023", 20, "Misc"),
        txn("2026-07-03", "VENMO PAYMENT 1023", 20, "Misc"),
        txn("2026-07-02", "ATM WITHDRAWAL 0042", 100, "Misc"),
        txn("2026-07-02", "ATM WITHDRAWAL 0042", 100, "Misc"),
      ],
      TODAY,
    );
    expect(r.duplicates).toEqual([]);
  });

  it("does not call regular weekly charges duplicates", () => {
    const r = buildLeakReport(everyNDays("HELLOFRESH", 69.99, "2026-09-07", 8, 7, "Food/Dining"), TODAY);
    expect(r.duplicates).toEqual([]);
  });

  it("does not call two seats billed together duplicates, even if one month has a third", () => {
    const seats = [...monthly("Slack", 8.75, "2026-05-02", 6), ...monthly("Slack", 8.75, "2026-05-02", 6)];
    const r = buildLeakReport([...seats, txn("2026-08-02", "Slack", 8.75), ...periodMarkers("2026-05-01", "2026-10-31")], TODAY);
    expect(r.duplicates).toEqual([]);
  });
});
