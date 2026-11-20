// The leak-finder migration must apply cleanly on top of the existing schema
// and enforce category and ownership constraints.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "10000000-0000-4000-8000-000000000001";

// Each test boots its own PGlite, which can exceed the 5s default under a
// parallel run; 20s matches the other PGlite suites.
const BOOT_TIMEOUT_MS = 20000;

async function database() {
  const db = new PGlite();
  await db.exec(readFileSync("src/lib/imports/test-schema.sql", "utf8"));
  await db.exec(
    readFileSync("supabase/migrations/20261024_import_review.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/20261116_leak_finder.sql", "utf8"),
  );
  return db;
}

/** The unused budgets table production already has (one row per category, globally). */
const LEGACY_BUDGETS = `
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  category text unique,
  monthly_target numeric,
  active boolean default true
);
alter table public.budgets enable row level security;`;

async function legacyDatabase(seed = false) {
  const db = new PGlite();
  await db.exec(readFileSync("src/lib/imports/test-schema.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261024_import_review.sql", "utf8"));
  await db.exec(LEGACY_BUDGETS);
  if (seed)
    await db.query("insert into budgets(user_id,category,monthly_target) values($1,'Misc',10)", [OWNER]);
  return db;
}
const LEAK_FINDER = () => readFileSync("supabase/migrations/20261116_leak_finder.sql", "utf8");

// PGlite start-up dominates; match the 20 s budget of the other database suites.
describe("leak-finder migration", { timeout: 20000 }, () => {
  it("replaces the empty legacy budgets table with the per-user one", async () => {
    const db = await legacyDatabase();
    await db.exec(LEAK_FINDER());
    const other = "10000000-0000-4000-8000-000000000002";
    await db.query("insert into auth.users(id) values($1) on conflict do nothing", [other]);
    // Two users may now budget the same category; one user may not twice.
    await db.query("insert into budgets(user_id,category,monthly_target) values($1,'Misc',10)", [OWNER]);
    await db.query("insert into budgets(user_id,category,monthly_target) values($1,'Misc',20)", [other]);
    await expect(
      db.query("insert into budgets(user_id,category,monthly_target) values($1,'Misc',30)", [OWNER]),
    ).rejects.toThrow();
    const cols = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name='budgets' and column_name in ('created_at','active') order by 1",
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual(["created_at"]);
  }, BOOT_TIMEOUT_MS);

  it("refuses to drop a legacy budgets table that holds rows", async () => {
    const db = await legacyDatabase(true);
    await expect(db.exec(LEAK_FINDER())).rejects.toThrow(/Legacy public.budgets has rows/);
    const rows = await db.query("select * from budgets");
    expect(rows.rows).toHaveLength(1);
    const tags = await db.query(
      "select 1 from information_schema.columns where table_name='line_items' and column_name='tags'",
    );
    expect(tags.rows).toHaveLength(0);
  }, BOOT_TIMEOUT_MS);

  it("adds tags, notes, budgets and merchant rules", async () => {
    const db = await database();
    await db.query(
      "insert into budgets(user_id,category,monthly_target) values($1,'Software/SaaS',200)",
      [OWNER],
    );
    await db.query(
      "insert into merchant_rules(user_id,vendor_key,category,origin) values($1,'figma','Software/SaaS','correction')",
      [OWNER],
    );
    const tags = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name='line_items' and column_name in ('tags','note') order by 1",
    );
    expect(tags.rows.map((r) => r.column_name)).toEqual(["note", "tags"]);
  }, BOOT_TIMEOUT_MS);

  it("rejects non-canonical categories and duplicate rules", async () => {
    const db = await database();
    await expect(
      db.query(
        "insert into budgets(user_id,category,monthly_target) values($1,'Groceries',50)",
        [OWNER],
      ),
    ).rejects.toThrow();
    await db.query(
      "insert into merchant_rules(user_id,vendor_key,category,origin) values($1,'figma','Software/SaaS','manual')",
      [OWNER],
    );
    await expect(
      db.query(
        "insert into merchant_rules(user_id,vendor_key,category,origin) values($1,'figma','Misc','manual')",
        [OWNER],
      ),
    ).rejects.toThrow();
  }, BOOT_TIMEOUT_MS);
});
