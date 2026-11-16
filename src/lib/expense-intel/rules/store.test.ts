import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { testClient } from "@/lib/imports/test-db";
import { learnFromCorrection, loadKnownCategories, loadMerchantRules } from "./store";

const OWNER = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";

let pg: PGlite;
let db: SupabaseClient;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync("src/lib/imports/test-schema.sql", "utf8"));
  await pg.exec(readFileSync("supabase/migrations/20261024_import_review.sql", "utf8"));
  await pg.exec(readFileSync("supabase/migrations/20261116_leak_finder.sql", "utf8"));
  db = testClient(pg) as unknown as SupabaseClient;
}, 20000);
afterAll(async () => pg.close());

async function upload(owner: string, status: string, rows: [vendor: string, category: string, origin: string][]) {
  const { rows: created } = await pg.query<{ id: string }>(
    "insert into uploads(user_id,filename,pass1_status) values($1,'f.csv',$2) returning id",
    [owner, status],
  );
  for (const [vendor, category, origin] of rows)
    await pg.query(
      "insert into line_items(upload_id,vendor,amount,category,category_origin) values($1,$2,10,$3,$4)",
      [created[0].id, vendor, category, origin],
    );
}

describe("merchant rule store", () => {
  it("turns a correction into a rule keyed by vendor, and a later correction replaces it", async () => {
    await learnFromCorrection(db, OWNER, "SQ *BLUE BOTTLE 0423 OAKLAND CA", "Entertainment");
    await learnFromCorrection(db, OWNER, "BLUE BOTTLE SAN FRANCISCO CA", "Food/Dining");
    expect(await loadMerchantRules(db, OWNER)).toEqual([
      { vendorKey: "blue bottle", category: "Food/Dining" },
    ]);
    const { rows } = await pg.query(
      "select display_name,origin from merchant_rules where user_id=$1",
      [OWNER],
    );
    expect(rows).toEqual([{ display_name: "Blue Bottle", origin: "correction" }]);
    expect(await loadMerchantRules(db, OTHER)).toEqual([]);
  });

  it("builds history votes from completed uploads only, ignoring fallback rows and other users", async () => {
    await upload(OWNER, "complete", [
      ["UBER *TRIP", "Travel/Transport", "model"],
      ["UBER *TRIP HELP.UBER.COM CA", "Travel/Transport", "user"],
      ["MYSTERY SHOP", "Misc", "fallback"],
      ["MYSTERY SHOP", "Misc", "fallback"],
    ]);
    await upload(OWNER, "processing", [
      ["NOTION", "Software/SaaS", "model"],
      ["NOTION", "Software/SaaS", "model"],
    ]);
    await upload(OTHER, "complete", [
      ["CHIPOTLE 1234", "Food/Dining", "model"],
      ["CHIPOTLE 5678", "Food/Dining", "model"],
    ]);
    const known = await loadKnownCategories(db, OWNER);
    expect(Object.fromEntries(known.votes)).toEqual({ uber: "Travel/Transport" });
    expect(known.rules).toEqual([{ vendorKey: "blue bottle", category: "Food/Dining" }]);
  });

  it("rejects an unknown category origin", async () => {
    await expect(
      upload(OWNER, "complete", [["X", "Misc", "guess"]]),
    ).rejects.toThrow();
  });
});
