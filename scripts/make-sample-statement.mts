// Builds the downloadable sample statement from the demo year.
//
//   npx tsx --tsconfig tsconfig.json scripts/make-sample-statement.mts
//
// Imports take at most 500 rows, and the demo year has about 620. Every row
// that tells a planted story (subscriptions, the price increase, the double
// charge, the unusual charges, rent and other negatives) is kept; everyday
// food and grocery purchases are thinned evenly across the year. The script then checks the
// leak engine finds the same leaks in the sample as in the full demo, and
// refuses to write the file if it does not.
import { writeFileSync } from "node:fs";
import { demoRows, DEMO_TODAY } from "@/lib/demo";
import { buildLeakReport } from "@/lib/expense-intel/leaks";
import { toTxn, type LeakReport, type Txn } from "@/lib/expense-intel/contracts";

const OUT = "public/sample/sample-card-statement-12-months.csv";
const TARGET_ROWS = 480;

const rows = demoRows().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
const planted = rows.filter((r) => r.tag !== null);
// Only everyday food and grocery purchases are thinned: they are plentiful, so
// every other merchant keeps its full history (and its own sense of "usual").
const thinnable = rows.filter((r) => r.tag === null && r.category === "Food/Dining");
const toDrop = Math.max(0, rows.length - TARGET_ROWS);
if (toDrop > thinnable.length) throw new Error("Not enough everyday purchases to thin.");
const step = thinnable.length / Math.max(toDrop, 1);
const dropped = new Set<string>();
for (let i = 0; i < toDrop; i++) dropped.add(thinnable[Math.floor(i * step)].id);
const sample = rows.filter((r) => !dropped.has(r.id));

function txns(list: typeof rows): Txn[] {
  return list
    .map((r) =>
      toTxn({ id: r.id, vendor: r.descriptor, amount: r.amount, transaction_date: r.date, category: r.category, upload_id: "sample" }),
    )
    .filter((t): t is Txn => t !== null);
}

function summary(report: LeakReport) {
  return {
    subscriptions: report.subscriptions.map((s) => `${s.vendor}:${s.status}`).sort(),
    priceChanges: report.priceChanges.map((p) => `${p.vendor}:${p.previousAmount}->${p.newAmount}`).sort(),
    duplicates: report.duplicates.map((d) => `${d.vendor}:${d.amount}`).sort(),
    unusual: report.unusual.map((u) => `${u.vendor}:${u.amount}`).sort(),
    foundAnnual: report.totals.foundAnnual,
  };
}

const full = summary(buildLeakReport(txns(rows), DEMO_TODAY));
const thin = summary(buildLeakReport(txns(sample), DEMO_TODAY));
console.log(`demo rows ${rows.length} (planted ${planted.length}); sample rows ${sample.length}`);
console.log("full  ", JSON.stringify(full));
console.log("sample", JSON.stringify(thin));
if (sample.length > 500) throw new Error(`Sample has ${sample.length} rows; imports take at most 500.`);
if (JSON.stringify(full) !== JSON.stringify(thin))
  throw new Error("The thinned sample does not reproduce the demo's leaks; not writing it.");

const csv = ["Date,Description,Amount", ...sample.map((r) => `${r.date},${JSON.stringify(r.descriptor)},${r.amount.toFixed(2)}`)];
writeFileSync(OUT, `${csv.join("\n")}\n`);
console.log(`wrote ${OUT}: ${sample.length} rows, ${sample[0].date} to ${sample[sample.length - 1].date}`);
