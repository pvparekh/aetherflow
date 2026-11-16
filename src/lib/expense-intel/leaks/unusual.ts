// Unusually large charges, judged against the vendor's own history when it
// has at least 5 charges, else against the category.
//
// Spending is skewed (many small charges, a few large ones), so the score is a
// robust one on log amounts: 0.6745 * (ln x - median) / MAD. A plain z-score
// cannot exceed (n-1)/sqrt(n), so with a short history it never fires
// (docs/leak-finder/03-decisions.md). A charge must also be a clear multiple
// of the usual amount and at least $20 above it, so a small-ticket vendor
// never produces a flag over a few dollars.
import type { Txn, UnusualCharge } from "../contracts";
import { groupBy } from "./group";
import { formatUsd, median, roundCents } from "./money";
import { isNonMerchant } from "./payees";

const MIN_VENDOR_CHARGES = 5;
const MIN_CATEGORY_CHARGES = 10;
const MAD_TO_SIGMA = 0.6745;
/** Floor on the log-scale spread: a vendor that always charges the same price still needs a real jump. */
const MIN_LOG_SPREAD = 0.1;
const MIN_SCORE = 3.5;
const MIN_EXCESS_USD = 20;
const MIN_RATIO = { vendor: 2, category: 5 } as const;
const CRITICAL = { score: 6, ratio: 4 } as const;
const MAX_RESULTS = 25;

interface Baseline {
  kind: UnusualCharge["baseline"];
  typical: number;
  logMedian: number;
  logSpread: number;
}

interface Assessment {
  ratio: number;
  score: number;
  clear: boolean;
}

export function detectUnusual(txns: Txn[], excludedIds: ReadonlySet<string>): UnusualCharge[] {
  const candidates = txns.filter((t) => !excludedIds.has(t.id) && !isNonMerchant(t));
  const byVendor = groupBy(candidates, (t) => t.vendorKey);
  const byCategory = groupBy(candidates, (t) => t.category);
  const vendorBaselines = baselines(byVendor, "vendor", MIN_VENDOR_CHARGES);
  const categoryBaselines = baselines(byCategory, "category", MIN_CATEGORY_CHARGES);

  const flagged: { charge: UnusualCharge; ratio: number }[] = [];
  for (const txn of candidates) {
    const screen = vendorBaselines.get(txn.vendorKey) ?? categoryBaselines.get(txn.category);
    if (!screen || !assess(txn, screen).clear) continue;
    // Confirm against the other charges only, so "your usual" never includes
    // the charge being judged.
    const peers = (screen.kind === "vendor" ? byVendor.get(txn.vendorKey) : byCategory.get(txn.category))!;
    const baseline = summarize(peers.filter((p) => p.id !== txn.id).map((p) => p.amount), screen.kind);
    const { ratio, score, clear } = assess(txn, baseline);
    if (!clear) continue;
    const charge: UnusualCharge = {
      transactionId: txn.id,
      vendor: txn.vendor,
      category: txn.category,
      date: txn.date,
      amount: txn.amount,
      typicalAmount: baseline.typical,
      baseline: baseline.kind,
      reason: reasonFor(txn, baseline, ratio),
      severity: score >= CRITICAL.score && ratio >= CRITICAL.ratio ? "critical" : "warning",
    };
    flagged.push({ charge, ratio });
  }

  return flagged
    .sort(
      (a, b) =>
        Number(b.charge.severity === "critical") - Number(a.charge.severity === "critical") ||
        b.ratio - a.ratio ||
        b.charge.date.localeCompare(a.charge.date) ||
        a.charge.transactionId.localeCompare(b.charge.transactionId),
    )
    .slice(0, MAX_RESULTS)
    .map((f) => f.charge);
}

function assess(txn: Txn, baseline: Baseline): Assessment {
  const ratio = txn.amount / baseline.typical;
  const score = (MAD_TO_SIGMA * (Math.log(txn.amount) - baseline.logMedian)) / baseline.logSpread;
  const clear =
    score >= MIN_SCORE &&
    ratio >= MIN_RATIO[baseline.kind] &&
    txn.amount - baseline.typical >= MIN_EXCESS_USD;
  return { ratio, score, clear };
}

function baselines(groups: Map<string, Txn[]>, kind: Baseline["kind"], minCharges: number): Map<string, Baseline> {
  const result = new Map<string, Baseline>();
  for (const [key, group] of groups) {
    if (group.length >= minCharges) result.set(key, summarize(group.map((t) => t.amount), kind));
  }
  return result;
}

function summarize(amounts: number[], kind: Baseline["kind"]): Baseline {
  const logs = amounts.map(Math.log);
  const logMedian = median(logs);
  const mad = median(logs.map((v) => Math.abs(v - logMedian)));
  return {
    kind,
    typical: roundCents(median(amounts)),
    logMedian,
    logSpread: Math.max(mad, MIN_LOG_SPREAD),
  };
}

function reasonFor(txn: Txn, baseline: Baseline, ratio: number): string {
  const amount = formatUsd(txn.amount);
  const typical = formatUsd(baseline.typical);
  return baseline.kind === "vendor"
    ? `${amount} is ${timesText(ratio)} your usual ${typical} at ${txn.vendor}.`
    : `${amount} is ${timesText(ratio)} a typical ${txn.category} charge of ${typical}.`;
}

/** "about twice", "about 3.5 times", "about 12 times". */
export function timesText(ratio: number): string {
  const rounded = ratio < 10 ? Math.round(ratio * 2) / 2 : Math.round(ratio);
  return rounded === 2 ? "about twice" : `about ${rounded} times`;
}
