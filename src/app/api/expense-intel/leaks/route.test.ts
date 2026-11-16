import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Txn } from "@/lib/expense-intel/contracts";
import { GET as getLeaks } from "./route";
import { GET as getCalendar } from "../calendar/route";

const state = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  txns: [] as Txn[],
  fail: false,
  calls: [] as string[],
}));

vi.mock("@/lib/imports/access", () => ({
  importAccess: async () => (state.user ? { user: state.user, db: { fake: true } } : null),
}));

vi.mock("@/lib/expense-intel/txns", () => ({
  loadUserTxns: async (_db: unknown, userId: string) => {
    state.calls.push(userId);
    if (state.fail) throw new Error("connection refused");
    return state.txns;
  },
}));

function netflixMonths(): Txn[] {
  // Charges on the 1st of the last 6 months relative to the real clock, since
  // the routes use today's date.
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6 + i, 1));
    return {
      id: `n${i}`,
      date: d.toISOString().slice(0, 10),
      vendor: "Netflix",
      vendorKey: "netflix",
      amount: 15.49,
      category: "Entertainment",
      uploadId: "u1",
      tags: [],
      note: null,
    };
  });
}

beforeEach(() => {
  state.user = { id: "user-1" };
  state.txns = netflixMonths();
  state.fail = false;
  state.calls = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each([
  ["GET /api/expense-intel/leaks", getLeaks],
  ["GET /api/expense-intel/calendar", getCalendar],
])("%s", (_name, handler) => {
  it("requires sign-in", async () => {
    state.user = null;
    const res = await handler();
    expect(res.status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("never caches", async () => {
    const res = await handler();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a plain error without internals when loading fails", async () => {
    state.fail = true;
    const res = await handler();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/try again/);
    expect(JSON.stringify(body)).not.toContain("connection refused");
  });
});

describe("GET /api/expense-intel/leaks", () => {
  it("returns the signed-in user's leak report", async () => {
    const res = await getLeaks();
    expect(res.status).toBe(200);
    expect(state.calls).toEqual(["user-1"]);
    const report = await res.json();
    expect(report.transactionCount).toBe(6);
    expect(report.subscriptions).toHaveLength(1);
    expect(report.subscriptions[0]).toMatchObject({ vendor: "Netflix", cadence: "monthly", status: "active" });
  });
});

describe("GET /api/expense-intel/calendar", () => {
  it("returns a downloadable calendar file", async () => {
    const res = await getCalendar();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="aether-flow-bills.ics"');
    const body = await res.text();
    expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(12);
  });
});
