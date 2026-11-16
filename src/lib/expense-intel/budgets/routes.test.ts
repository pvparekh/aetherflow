// Budgets and transaction-annotation routes against real Postgres (PGlite)
// with the leak-finder migration applied. A second user must never read or
// change the first user's budgets or transactions.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite, types } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { testClient } from "@/lib/imports/test-db";

const OWNER = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";

const state = vi.hoisted(() => ({
  user: null as string | null,
  client: {} as unknown,
}));

vi.mock("@/lib/imports/access", () => ({
  importAccess: async () =>
    state.user ? { user: { id: state.user }, db: state.client } : null,
  importFailure: (e: unknown) =>
    NextResponse.json(
      { error: "Server error", detail: e instanceof Error ? e.message : e },
      { status: 503 },
    ),
}));

import { DELETE, GET, PUT } from "@/app/api/expense-intel/budgets/route";
import { PATCH } from "@/app/api/expense-intel/transactions/[id]/route";

let db: PGlite;
let ownerItem: string;
let otherItem: string;

async function seedUpload(userId: string, rows: [string, number, string][]) {
  const upload = await db.query<{ id: string }>(
    "insert into uploads(user_id,filename,pass1_status) values($1,'statement.csv','complete') returning id",
    [userId],
  );
  const ids: string[] = [];
  for (const [date, amount, category] of rows) {
    const item = await db.query<{ id: string }>(
      "insert into line_items(upload_id,vendor,amount,transaction_date,category) values($1,'Shop',$2,$3,$4) returning id",
      [upload.rows[0].id, amount, date, category],
    );
    ids.push(item.rows[0].id);
  }
  return ids;
}

async function budgetRows() {
  return (
    await db.query<{ user_id: string; category: string; monthly_target: string }>(
      "select user_id,category,monthly_target from budgets order by user_id,category",
    )
  ).rows;
}

async function annotations(id: string) {
  return (
    await db.query<{ tags: string[]; note: string | null }>(
      "select tags,note from line_items where id=$1",
      [id],
    )
  ).rows[0];
}

function as(user: string | null) {
  state.user = user;
}

const url = (query = "") => `http://local/api/expense-intel/budgets${query}`;

function put(body: unknown) {
  return PUT(
    new Request(url(), {
      method: "PUT",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function patch(id: string, body: unknown) {
  return PATCH(
    new Request(`http://local/api/expense-intel/transactions/${id}`, {
      method: "PATCH",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeAll(async () => {
  // PostgREST returns dates and timestamps as strings; match it.
  const asText = (value: string) => value;
  db = new PGlite({
    parsers: { [types.DATE]: asText, [types.TIMESTAMPTZ]: asText },
  });
  await db.exec(readFileSync("src/lib/imports/test-schema.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261024_import_review.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261116_leak_finder.sql", "utf8"));
  state.client = testClient(db);

  [ownerItem] = await seedUpload(OWNER, [
    ["2026-10-02", 40, "Food/Dining"],
    ["2026-10-08", 20, "Food/Dining"],
    ["2026-10-09", 95, "Software/SaaS"],
    ["2026-09-20", 500, "Food/Dining"],
  ]);
  [otherItem] = await seedUpload(OTHER, [["2026-10-03", 1000, "Food/Dining"]]);

  // Only Date is faked, so PGlite's own timers are unaffected.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
}, 20000);

afterAll(async () => {
  vi.useRealTimers();
  await db.close();
});

beforeEach(() => as(OWNER));

describe("budgets route", () => {
  it("requires authentication for every method", async () => {
    as(null);
    expect((await GET(new Request(url()))).status).toBe(401);
    expect((await put({ category: "Misc", monthly_target: 1 })).status).toBe(401);
    expect(
      (await DELETE(new Request(url("?category=Misc"), { method: "DELETE" }))).status,
    ).toBe(401);
  });

  it("creates a budget, then replaces its target on a second PUT", async () => {
    const created = await put({ category: "Food/Dining", monthly_target: 80 });
    expect(created.status).toBe(200);
    expect(created.headers.get("Cache-Control")).toBe("no-store");
    expect((await created.json()).budget).toMatchObject({
      category: "Food/Dining",
      monthly_target: 80,
    });

    const replaced = await put({ category: "Food/Dining", monthly_target: 70.5 });
    expect((await replaced.json()).budget.monthly_target).toBe(70.5);
    expect(await budgetRows()).toEqual([
      { user_id: OWNER, category: "Food/Dining", monthly_target: "70.5" },
    ]);
  });

  it("rejects invalid input without writing", async () => {
    const before = await budgetRows();
    const bad = await put({ category: "Groceries", monthly_target: 10 });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "Choose a valid category" });
    expect((await put({ category: "Misc", monthly_target: -1 })).status).toBe(400);
    expect((await put("{not json")).status).toBe(400);
    expect(await budgetRows()).toEqual(before);
  });

  it("lists progress for the latest month of data by default, from the owner's spend only", async () => {
    await put({ category: "Software/SaaS", monthly_target: 100 });
    const res = await GET(new Request(url()));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.month).toBe("2026-10");
    expect(body.asOf).toBe("2026-10-10");
    expect(body.budgets).toEqual([
      {
        category: "Food/Dining",
        month: "2026-10",
        target: 70.5,
        // 40 + 20; September's 500 and the other user's 1000 are excluded.
        spent: 60,
        remaining: 10.5,
        percentUsed: 85,
        projected: 186,
        status: "near",
      },
      {
        category: "Software/SaaS",
        month: "2026-10",
        target: 100,
        spent: 95,
        remaining: 5,
        percentUsed: 95,
        projected: 294.5,
        status: "near",
      },
    ]);
  });

  it("honours an explicit month and validates it", async () => {
    const res = await GET(new Request(url("?month=2026-09")));
    const food = (await res.json()).budgets[0];
    expect(food).toMatchObject({ month: "2026-09", spent: 500, status: "over", projected: 500 });
    expect((await GET(new Request(url("?month=2026-9")))).status).toBe(400);
  });

  it("isolates users: another user cannot read, overwrite or delete the owner's budgets", async () => {
    as(OTHER);
    const listed = await (await GET(new Request(url("?month=2026-10")))).json();
    expect(listed.budgets).toEqual([]);

    // Same category: the other user gets their own row; the owner's is untouched.
    await put({ category: "Food/Dining", monthly_target: 5 });
    const ownBudgets = (await (await GET(new Request(url("?month=2026-10")))).json())
      .budgets;
    expect(ownBudgets).toHaveLength(1);
    expect(ownBudgets[0]).toMatchObject({ target: 5, spent: 1000, status: "over" });

    const missing = await DELETE(
      new Request(url("?category=Software%2FSaaS"), { method: "DELETE" }),
    );
    expect(missing.status).toBe(404);
    expect(
      (await DELETE(new Request(url("?category=Food%2FDining"), { method: "DELETE" })))
        .status,
    ).toBe(200);

    expect(await budgetRows()).toEqual([
      { user_id: OWNER, category: "Food/Dining", monthly_target: "70.5" },
      { user_id: OWNER, category: "Software/SaaS", monthly_target: "100" },
    ]);
  });

  it("deletes the owner's budget once, then reports it missing", async () => {
    const request = () =>
      DELETE(new Request(url("?category=Software%2FSaaS"), { method: "DELETE" }));
    const first = await request();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ deleted: true, category: "Software/SaaS" });
    expect((await request()).status).toBe(404);
    expect(
      (await DELETE(new Request(url("?category=Nope"), { method: "DELETE" }))).status,
    ).toBe(400);
  });
});

describe("transaction annotations route", () => {
  it("requires authentication", async () => {
    as(null);
    expect((await patch(ownerItem, { note: "x" })).status).toBe(401);
  });

  it("normalises tags and saves a note on an owned transaction", async () => {
    const res = await patch(ownerItem, {
      tags: [" Client A ", "client a", "Q4"],
      note: "  Team lunch  ",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      transaction: { id: ownerItem, tags: ["client a", "q4"], note: "Team lunch" },
    });
    expect(await annotations(ownerItem)).toEqual({
      tags: ["client a", "q4"],
      note: "Team lunch",
    });
  });

  it("changes only the fields sent, and clears a note with null", async () => {
    await patch(ownerItem, { note: null });
    expect(await annotations(ownerItem)).toEqual({
      tags: ["client a", "q4"],
      note: null,
    });
    await patch(ownerItem, { tags: [] });
    expect(await annotations(ownerItem)).toEqual({ tags: [], note: null });
  });

  it("rejects invalid bodies without writing", async () => {
    await patch(ownerItem, { tags: ["keep"], note: "keep" });
    expect((await patch(ownerItem, { tags: ["bad_tag"] })).status).toBe(400);
    expect((await patch(ownerItem, { note: "n".repeat(501) })).status).toBe(400);
    expect((await patch(ownerItem, {})).status).toBe(400);
    expect((await patch(ownerItem, "{oops")).status).toBe(400);
    expect(await annotations(ownerItem)).toEqual({ tags: ["keep"], note: "keep" });
  });

  it("returns 404 for unknown or malformed ids", async () => {
    expect((await patch("20000000-0000-4000-8000-00000000abcd", { note: "x" })).status).toBe(
      404,
    );
    expect((await patch("not-a-uuid", { note: "x" })).status).toBe(404);
  });

  it("isolates users: another user cannot read or change the owner's transaction", async () => {
    as(OTHER);
    const res = await patch(ownerItem, { tags: ["mine"], note: "overwritten" });
    expect(res.status).toBe(404);
    // The response leaks nothing about the row.
    expect(await res.json()).toEqual({ error: "Transaction not found" });
    expect(await annotations(ownerItem)).toEqual({ tags: ["keep"], note: "keep" });

    // The other user's own transaction still works, and the owner cannot touch it.
    expect((await patch(otherItem, { note: "own" })).status).toBe(200);
    as(OWNER);
    expect((await patch(otherItem, { note: "hijack" })).status).toBe(404);
    expect(await annotations(otherItem)).toEqual({ tags: [], note: "own" });
  });
});
