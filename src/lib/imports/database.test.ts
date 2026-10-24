import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const owner = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002",
  run = "20000000-0000-4000-8000-000000000001";
let db: PGlite;
async function draft(count = 1) {
  const r = await db.query<{ id: string }>(
    `insert into import_drafts(user_id,fingerprint,review,status,run_id) values($1,gen_random_uuid()::text,$2,'processing',$3) returning id`,
    [
      owner,
      {
        filename: "test.csv",
        rows: Array.from({ length: count }, () => ({
          included: true,
          amount: 12.5,
          vendor: "Shop",
          date: "2026-10-01",
          source: "source",
        })),
      },
      run,
    ],
  );
  return r.rows[0].id;
}
const row = {
  vendor: "Shop",
  amount: 12.5,
  transaction_date: "2026-10-01",
  category: "Misc",
  subcategory: "Office",
  confidence: 0.7,
  raw_text: "source",
};
async function append(
  id: string,
  cursor: number,
  rows: unknown[],
  who = owner,
  token = run,
) {
  return (
    await db.query<{ id: string | null }>(
      "select append_import_chunk($1,$2,$3,$4,$5::jsonb) id",
      [id, who, token, cursor, JSON.stringify(rows)],
    )
  ).rows[0].id;
}
async function count(table: string) {
  return Number(
    (await db.query<{ n: number }>(`select count(*) n from ${table}`)).rows[0]
      .n,
  );
}
describe("Postgres import transactions and authorization", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(readFileSync("src/lib/imports/test-schema.sql", "utf8"));
    await db.exec(
      readFileSync("supabase/migrations/20261024_import_review.sql", "utf8"),
    );
  }, 20000);
  afterAll(async () => {
    await db.close();
  });
  it("publishes once and exact replay returns the same upload", async () => {
    const id = await draft();
    const before = await count("uploads");
    const u = await append(id, 0, [row]);
    expect(u).toBeTruthy();
    expect(await append(id, 0, [row])).toBe(u);
    expect(await count("uploads")).toBe(before + 1);
    expect(
      (await db.query("select amount from line_items where upload_id=$1", [u]))
        .rows,
    ).toEqual([{ amount: "12.5" }]);
  });
  it("saves a partial chunk without publishing and refuses stale cursor/run", async () => {
    const id = await draft(26),
      before = await count("uploads");
    expect(await append(id, 0, Array(25).fill(row))).toBeNull();
    expect(await count("uploads")).toBe(before);
    await expect(append(id, 0, [row])).rejects.toThrow("Import changed");
    await db.query(
      "update import_drafts set run_id=$2,status='processing' where id=$1",
      [id, run],
    );
    expect(await append(id, 25, [row])).toBeTruthy();
  });
  it("enforces owner and rolls back invalid insertion", async () => {
    const id = await draft();
    await expect(append(id, 0, [row], other)).rejects.toThrow(
      "Import not found",
    );
    const before = await count("uploads");
    await expect(append(id, 0, [{ ...row, amount: null }])).rejects.toThrow();
    expect(await count("uploads")).toBe(before);
    expect(
      (await db.query("select upload_id from import_drafts where id=$1", [id]))
        .rows,
    ).toEqual([{ upload_id: null }]);
  });
  it("serializes account leases and supports expiry recovery", async () => {
    expect(
      (
        await db.query<{ claimed: boolean }>(
          "select claim_expense_lease($1,$2,$3) claimed",
          [owner, "write", run],
        )
      ).rows[0].claimed,
    ).toBe(true);
    expect(
      (
        await db.query<{ claimed: boolean }>(
          "select claim_expense_lease($1,$2,$3) claimed",
          [owner, "write", run],
        )
      ).rows[0].claimed,
    ).toBe(false);
    await db.exec(
      "update expense_leases set expires_at=now()-interval '1 second'",
    );
    expect(
      (
        await db.query<{ claimed: boolean }>(
          "select claim_expense_lease($1,$2,$3) claimed",
          [owner, "write", run],
        )
      ).rows[0].claimed,
    ).toBe(true);
  });
  it("records category correction, invalidates model results and rejects other owner", async () => {
    const id = await draft();
    const u = await append(id, 0, [row]);
    const item = (
      await db.query<{ id: string }>(
        "select id from line_items where upload_id=$1",
        [u],
      )
    ).rows[0].id;
    await expect(
      db.query("select correct_expense_category($1,$2,$3)", [
        other,
        item,
        "Utilities",
      ]),
    ).rejects.toThrow();
    await db.query("select correct_expense_category($1,$2,$3)", [
      owner,
      item,
      "Utilities",
    ]);
    expect(
      (
        await db.query(
          "select category,category_origin from line_items where id=$1",
          [item],
        )
      ).rows,
    ).toEqual([{ category: "Utilities", category_origin: "user" }]);
    expect(await count("category_corrections")).toBe(1);
    await db.query("select correct_expense_category($1,$2,$3)", [
      owner,
      item,
      "Utilities",
    ]);
    expect(await count("category_corrections")).toBe(1);
  });
  it("vendor snapshots are idempotent and report deletion updates totals atomically", async () => {
    const id = await draft(),
      u = await append(id, 0, [row]);
    await db.exec("update uploads set pass1_status='complete'");
    await db.query("select rebuild_expense_vendors($1,$2)", [owner, u]);
    const before = (
      await db.query(
        "select total_spend from vendors where user_id=$1 and vendor_name=$2",
        [owner, "Shop"],
      )
    ).rows;
    await db.query("select rebuild_expense_vendors($1,$2)", [owner, u]);
    expect(
      (
        await db.query(
          "select total_spend from vendors where user_id=$1 and vendor_name=$2",
          [owner, "Shop"],
        )
      ).rows,
    ).toEqual(before);
    expect(
      (
        await db.query("select delete_expense_report($1,$2) deleted", [
          other,
          u,
        ])
      ).rows,
    ).toEqual([{ deleted: false }]);
    expect(
      (
        await db.query("select delete_expense_report($1,$2) deleted", [
          owner,
          u,
        ])
      ).rows,
    ).toEqual([{ deleted: true }]);
    expect(
      (await db.query("select id from line_items where upload_id=$1", [u]))
        .rows,
    ).toHaveLength(0);
    expect(
      Number(
        (
          await db.query<{ total_spend: string }>(
            "select total_spend from vendors where user_id=$1",
            [owner],
          )
        ).rows[0].total_spend,
      ),
    ).toBe(Number((before[0] as { total_spend: string }).total_spend) - 12.5);
  });
  it("authenticated role sees only its own drafts and cannot execute service RPC", async () => {
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${other}'`,
    );
    expect(await count("import_drafts")).toBe(0);
    await expect(
      db.query("select append_import_chunk($1,$2,$3,0,$4)", [
        run,
        owner,
        run,
        "[]",
      ]),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query(
        "insert into import_drafts(user_id,fingerprint,review) values($1,$2,$3)",
        [other, "x", "{}"],
      ),
    ).rejects.toThrow("permission denied");
    await db.exec("reset role");
  });
});
