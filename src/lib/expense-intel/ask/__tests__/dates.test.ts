import { describe, expect, it } from "vitest";
import { describeRange, isIsoDate, monthsBetween, resolvePeriod } from "../dates";

describe("resolvePeriod", () => {
  it.each([
    ["all_time", null],
    ["this_month", { from: "2026-11-01", to: "2026-11-15" }],
    ["last_month", { from: "2026-10-01", to: "2026-10-31" }],
    ["this_quarter", { from: "2026-10-01", to: "2026-11-15" }],
    ["last_quarter", { from: "2026-07-01", to: "2026-09-30" }],
    ["this_year", { from: "2026-01-01", to: "2026-11-15" }],
    ["last_year", { from: "2025-01-01", to: "2025-12-31" }],
    ["last_30_days", { from: "2026-10-17", to: "2026-11-15" }],
    ["last_90_days", { from: "2026-08-18", to: "2026-11-15" }],
    ["last_12_months", { from: "2025-11-16", to: "2026-11-15" }],
  ] as const)("%s relative to 2026-11-15", (period, expected) => {
    expect(resolvePeriod(period, "2026-11-15")).toEqual(expected);
  });

  it("crosses year boundaries", () => {
    expect(resolvePeriod("last_month", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolvePeriod("last_quarter", "2026-02-01")).toEqual({ from: "2025-10-01", to: "2025-12-31" });
    expect(resolvePeriod("last_month", "2024-03-31")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });

  it("passes custom bounds through, open ends included", () => {
    expect(resolvePeriod("custom", "2026-11-15", { from: "2026-07-01", to: null })).toEqual({ from: "2026-07-01", to: null });
    expect(resolvePeriod("custom", "2026-11-15")).toBeNull();
  });
});

describe("date helpers", () => {
  it("validates real calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate("last month")).toBe(false);
  });

  it("lists months inclusively across years", () => {
    expect(monthsBetween("2025-11-20", "2026-02-01")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("describes ranges in plain English", () => {
    expect(describeRange({ from: "2026-10-01", to: "2026-10-31" })).toBe("in October 2026");
    expect(describeRange({ from: "2026-07-01", to: "2026-09-30" })).toBe("in Q3 2026");
    expect(describeRange({ from: "2025-01-01", to: "2025-12-31" })).toBe("in 2025");
    expect(describeRange({ from: "2026-10-17", to: "2026-11-15" })).toBe("from Oct 17, 2026 to Nov 15, 2026");
    expect(describeRange({ from: "2026-07-01", to: null })).toBe("since Jul 1, 2026");
    expect(describeRange(null)).toBe("");
  });
});
