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

describe("leak-finder migration", () => {
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
