import { it, expect, vi, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { testClient } from "./test-db";
const state = vi.hoisted(() => ({
  owner: "10000000-0000-4000-8000-000000000001" as string | null,
  client: {} as unknown,
  fail: false,
}));
vi.mock("@/lib/imports/access", () => ({
  importAccess: async () =>
    state.owner ? { user: { id: state.owner }, db: state.client } : null,
  classifyImportFailure: (e: unknown, phase?: string) => ({
    error: "Retry safely",
    status: 503,
    diagnostic: `${phase ?? "unknown"}:${e instanceof Error ? e.name : "unknown"}`,
  }),
  importFailure: (e: unknown) =>
    NextResponse.json(
      { error: "Retry safely", detail: e instanceof Error ? e.message : e },
      { status: 503 },
    ),
}));
vi.mock("@/lib/openai", () => ({
  getOpenAI: () => ({
    responses: {
      create: async ({ input }: { input: string }) => {
        if (state.fail) throw new Error("Provider unavailable");
        const n = Number(/Categorize these (\d+)/.exec(input)?.[1]);
        return {
          output_text: JSON.stringify({
            items: Array.from({ length: n }, () => ({
              vendor: "ignored normalization",
              amount: 999,
              date: "1999-01-01",
              category: "Software/SaaS",
              subcategory: "Subscription",
              confidence: 0.9,
            })),
          }),
        };
      },
    },
  }),
}));
import { POST as preview } from "@/app/api/imports/preview/route";
import { POST as commit } from "@/app/api/imports/[id]/commit/route";
import { PATCH as save } from "@/app/api/imports/[id]/route";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("src/lib/imports/test-schema.sql", "utf8"));
  await db.exec(
    readFileSync("supabase/migrations/20261024_import_review.sql", "utf8"),
  );
  state.client = testClient(db);
}, 20000);
afterAll(async () => db.close());
function context(id: string) {
  return { params: Promise.resolve({ id }) };
}
it("runs CSV → persisted review → exclusion → categorization → deterministic stats/vendor publication → idempotent replay", async () => {
  const form = new FormData();
  form.append(
    "file",
    new File(
      [
        "Vendor,Amount,Date\n" +
          Array.from(
            { length: 26 },
            (_, i) => `Figma,${i + 1}.00,2026-10-01`,
          ).join("\n"),
      ],
      "monthly.csv",
      { type: "text/csv" },
    ),
  );
  const res = await preview(
    new Request("http://local/api/imports/preview", {
      method: "POST",
      body: form,
    }),
  );
  expect(res.status).toBe(200);
  const { draft } = await res.json();
  expect(draft.review.rows).toHaveLength(26);
  expect((await db.query("select * from uploads")).rows).toHaveLength(0);
  draft.review.rows[0].included = false;
  const saved = await save(
    new Request("http://local", {
      method: "PATCH",
      body: JSON.stringify({
        review: draft.review,
        updated_at: draft.updated_at,
      }),
    }),
    context(draft.id),
  );
  expect(saved.status).toBe(200);
  // 25 selected rows: one atomic publication, reviewed amounts/dates survive model changes.
  const complete = await commit(
    new Request("http://local", { method: "POST" }),
    context(draft.id),
  );
  expect(await complete.clone().json()).toMatchObject({ complete: true });
  expect(complete.status).toBe(200);
  const result = await complete.json();
  expect(result.complete).toBe(true);
  const u = (
    await db.query<{ total_amount: string; pass1_status: string }>(
      "select * from uploads where id=$1",
      [result.upload_id],
    )
  ).rows[0];
  expect(u.total_amount).toBe("350");
  expect(u.pass1_status).toBe("complete");
  expect(
    (
      await db.query(
        "select amount,transaction_date from line_items order by amount limit 1",
      )
    ).rows[0],
  ).toEqual({
    amount: "2",
    transaction_date: new Date("2026-10-01T00:00:00.000Z"),
  });
  const replay = await commit(
    new Request("http://local", { method: "POST" }),
    context(draft.id),
  );
  expect(replay.status).toBe(200);
  expect((await db.query("select * from uploads")).rows).toHaveLength(1);
  expect(
    (await db.query("select total_spend,total_occurrences from vendors")).rows,
  ).toEqual([{ total_spend: "350.00", total_occurrences: 25 }]);
  state.owner = "10000000-0000-4000-8000-000000000002";
  expect(
    (
      await commit(
        new Request("http://local", { method: "POST" }),
        context(draft.id),
      )
    ).status,
  ).toBe(404);
  state.owner = null;
  expect(
    (
      await commit(
        new Request("http://local", { method: "POST" }),
        context(draft.id),
      )
    ).status,
  ).toBe(401);
}, 20000);
it("resumes the second chunk after provider failure without duplicating the first chunk or publication", async () => {
  state.owner = "10000000-0000-4000-8000-000000000001";
  state.fail = false;
  const form = new FormData();
  form.append(
    "file",
    new File(
      [
        "Vendor,Amount,Date\n" +
          Array(26).fill("Adobe,2.00,2026-10-02").join("\n"),
      ],
      "second.csv",
      { type: "text/csv" },
    ),
  );
  const response = await preview(
    new Request("http://local", { method: "POST", body: form }),
  );
  expect(response.status).toBe(200);
  const { draft } = await response.json();
  const first = await commit(
    new Request("http://local", { method: "POST" }),
    context(draft.id),
  );
  expect(await first.json()).toMatchObject({ complete: false, processed: 25 });
  const before = (await db.query("select * from uploads")).rows.length;
  state.fail = true;
  const failed = await commit(
    new Request("http://local", { method: "POST" }),
    context(draft.id),
  );
  expect(failed.status).toBe(503);
  expect((await db.query("select * from uploads")).rows).toHaveLength(before);
  expect(
    (
      await db.query("select cursor,status from import_drafts where id=$1", [
        draft.id,
      ])
    ).rows,
  ).toEqual([{ cursor: 25, status: "error" }]);
  state.fail = false;
  const done = await commit(
    new Request("http://local", { method: "POST" }),
    context(draft.id),
  );
  expect(await done.json()).toMatchObject({ complete: true, processed: 26 });
  expect((await db.query("select * from uploads")).rows).toHaveLength(
    before + 1,
  );
  expect(
    (
      await db.query(
        "select total_spend,total_occurrences from vendors where vendor_name=$1",
        ["Adobe"],
      )
    ).rows,
  ).toEqual([{ total_spend: "52.00", total_occurrences: 26 }]);
}, 20000);
