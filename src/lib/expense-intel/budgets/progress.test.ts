import { describe, expect, it } from "vitest";
import type { Txn } from "../contracts";
import {
  budgetProgress,
  budgetStatus,
  defaultBudgetMonth,
  projectMonthEnd,
} from "./progress";
import { daysElapsed, daysInMonth, isIsoDate, isMonth } from "./month";

let nextId = 0;
function txn(date: string, amount: number, category = "Food/Dining"): Txn {
  nextId += 1;
  return {
    id: `t${nextId}`,
    date,
    vendor: "Vendor",
    vendorKey: "vendor",
    amount,
    category,
    uploadId: "u1",
    tags: [],
    note: null,
  };
}

describe("month helpers", () => {
  it("validates months and dates", () => {
    expect(isMonth("2026-10")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-1")).toBe(false);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-10-32")).toBe(false);
  });

  it("counts days in a month including leap years", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2024-02")).toBe(29);
    expect(daysInMonth("2026-10")).toBe(31);
    expect(daysInMonth("2026-11")).toBe(30);
  });

  it("counts elapsed days before, during and after the month", () => {
    expect(daysElapsed("2026-10", "2026-09-30")).toBe(0);
    expect(daysElapsed("2026-10", "2026-10-01")).toBe(1);
    expect(daysElapsed("2026-10", "2026-10-15")).toBe(15);
    expect(daysElapsed("2026-10", "2027-01-02")).toBe(31);
  });
});

describe("budgetStatus", () => {
  it("is under below 85%, near from 85% to the target, over above it", () => {
    expect(budgetStatus(84.99, 100)).toBe("under");
    expect(budgetStatus(85, 100)).toBe("near");
    expect(budgetStatus(100, 100)).toBe("near");
    expect(budgetStatus(100.01, 100)).toBe("over");
  });
});

describe("projectMonthEnd", () => {
  it("does not project in the first four days", () => {
    expect(projectMonthEnd(50, "2026-10", "2026-10-04")).toBeNull();
    expect(projectMonthEnd(50, "2026-10", "2026-09-20")).toBeNull();
  });

  it("projects linearly from the fifth day", () => {
    // 50 over 5 days of a 31-day month.
    expect(projectMonthEnd(50, "2026-10", "2026-10-05")).toBe(310);
    // 300 over 15 days of a 30-day month.
    expect(projectMonthEnd(300, "2026-11", "2026-11-15")).toBe(600);
  });

  it("equals actual spend once the month is over", () => {
    expect(projectMonthEnd(123.45, "2026-10", "2026-11-15")).toBe(123.45);
  });
});

describe("budgetProgress", () => {
  const txns = [
    txn("2026-10-02", 40.1),
    txn("2026-10-09", 20.2),
    txn("2026-10-10", 30.3, "Software/SaaS"),
    txn("2026-09-30", 999), // previous month
    txn("2026-11-01", 999), // next month
    txn("2026-10-11", 500, "Travel/Transport"), // no budget
  ];

  it("sums only the month's spend per budgeted category", () => {
    const result = budgetProgress(
      txns,
      [
        { category: "Software/SaaS", monthly_target: 30 },
        { category: "Food/Dining", monthly_target: 100 },
      ],
      "2026-10",
      "2026-10-10",
    );
    expect(result).toEqual([
      {
        category: "Food/Dining",
        month: "2026-10",
        target: 100,
        spent: 60.3,
        remaining: 39.7,
        percentUsed: 60,
        projected: 186.93,
        status: "under",
      },
      {
        category: "Software/SaaS",
        month: "2026-10",
        target: 30,
        spent: 30.3,
        remaining: -0.3,
        percentUsed: 101,
        projected: 93.93,
        status: "over",
      },
    ]);
  });

  it("reports zero spend for a budget with no transactions", () => {
    const [entertainment] = budgetProgress(
      txns,
      [{ category: "Entertainment", monthly_target: 50 }],
      "2026-10",
      "2026-10-20",
    );
    expect(entertainment).toMatchObject({
      spent: 0,
      remaining: 50,
      percentUsed: 0,
      projected: 0,
      status: "under",
    });
  });

  it("adds many small charges without floating-point drift", () => {
    const coffees = Array.from({ length: 10 }, (_, i) =>
      txn(`2026-10-${String(i + 1).padStart(2, "0")}`, 0.1),
    );
    const [food] = budgetProgress(
      coffees,
      [{ category: "Food/Dining", monthly_target: 1 }],
      "2026-10",
      "2026-10-31",
    );
    expect(food.spent).toBe(1);
    expect(food.remaining).toBe(0);
    expect(food.status).toBe("near");
  });

  it("returns nothing when there are no budgets", () => {
    expect(budgetProgress(txns, [], "2026-10", "2026-10-15")).toEqual([]);
  });
});

describe("defaultBudgetMonth", () => {
  it("uses the latest transaction's month, else today's", () => {
    expect(
      defaultBudgetMonth([txn("2026-08-03", 1), txn("2026-09-14", 1)], "2026-11-15"),
    ).toBe("2026-09");
    expect(defaultBudgetMonth([], "2026-11-15")).toBe("2026-11");
  });
});
