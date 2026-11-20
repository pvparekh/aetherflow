// Deterministic narrative used when the model is unavailable or its output
// fails the faithfulness check. Isomorphic. Every sentence is built from
// context values, so its own output always passes `checkFaithfulness`.
import type { InsightCard, Pass2Result, SavingsOpportunity } from "../types";
import { formatPct, formatUsd, plural } from "./format";
import type { CategoryLine, NarrativeContext } from "./narrative-context";

const MAX_HIGH_CATEGORY_INSIGHTS = 3;
const CRITICAL_INCREASE_PCT = 50;
const MANY_FLAGGED = 3;

export function templateNarrative(ctx: NarrativeContext): Pass2Result {
  return {
    health_score: templateHealthScore(ctx),
    health_justification: healthJustification(ctx),
    narrative_summary: summary(ctx),
    insights: insights(ctx),
    savings_opportunities: savings(ctx),
    anomaly_explanations: [],
  };
}

function runningHigh(ctx: NarrativeContext): CategoryLine[] {
  return ctx.categories
    .filter((c) => ctx.categoriesRunningHigh.includes(c.category))
    .sort((a, b) => (b.vsRecentPct ?? 0) - (a.vsRecentPct ?? 0));
}

/** A simple, explainable heuristic: start healthy and subtract for each concern. */
export function templateHealthScore(ctx: NarrativeContext): number {
  let score = 9;
  score -= Math.min(3, ctx.categoriesRunningHigh.length);
  if (ctx.flags.possibleDuplicates > 0) score -= 1;
  if (ctx.flags.totalFlagged > MANY_FLAGGED) score -= 1;
  return Math.max(1, Math.min(10, score));
}

function healthJustification(ctx: NarrativeContext): string {
  const high = ctx.categoriesRunningHigh.length;
  if (high > 0) {
    return `${plural(high, "category is", "categories are")} running well above ${high === 1 ? "its" : "their"} recent average.`;
  }
  if (ctx.flags.possibleDuplicates > 0) {
    return `No category is running high, but ${plural(ctx.flags.possibleDuplicates, "possible duplicate charge")} should be checked.`;
  }
  if (!ctx.hasPreviousHistory) return "This is your first report, so there is no history to compare against yet.";
  return "Spending looks steady against your recent history.";
}

function summary(ctx: NarrativeContext): string {
  const sentences = [`You spent ${formatUsd(ctx.totalSpent)} across ${plural(ctx.transactionCount, "transaction")}.`];
  const top = ctx.categories[0];
  if (top) {
    sentences.push(
      `${top.category} was the largest category at ${formatUsd(top.spent)} (${formatPct(top.sharePct)} of the total).`,
    );
  }
  const highest = runningHigh(ctx)[0];
  if (highest && highest.recentAverage !== null && highest.vsRecentPct !== null) {
    sentences.push(
      `${highest.category} is ${formatPct(highest.vsRecentPct)} above its recent average of ${formatUsd(highest.recentAverage)}.`,
    );
  } else if (ctx.hasPreviousHistory) {
    sentences.push("No category is running well above its recent average.");
  }
  return sentences.join(" ");
}

function insights(ctx: NarrativeContext): InsightCard[] {
  const cards: InsightCard[] = runningHigh(ctx)
    .slice(0, MAX_HIGH_CATEGORY_INSIGHTS)
    .flatMap((c) => (c.recentAverage === null || c.vsRecentPct === null ? [] : [highCategoryInsight(c, c.recentAverage, c.vsRecentPct)]));

  if (ctx.flags.possibleDuplicates > 0) {
    cards.push({
      title: "Possible duplicate charges",
      description: `${plural(ctx.flags.possibleDuplicates, "charge")} ${ctx.flags.possibleDuplicates === 1 ? "looks" : "look"} like a possible duplicate. Check against your receipts.`,
      severity: "warning",
      category: null,
      metric: `${ctx.flags.possibleDuplicates} to check`,
    });
  }
  if (ctx.flags.totalFlagged > 0) {
    cards.push({
      title: "Charges worth a second look",
      description: `${plural(ctx.flags.totalFlagged, "charge")} stood out as unusually large for their category.`,
      severity: "info",
      category: null,
      metric: `${ctx.flags.totalFlagged} flagged`,
    });
  }
  const topVendor = ctx.topVendors[0];
  if (topVendor) {
    cards.push({
      title: `${topVendor.vendor} is your biggest vendor`,
      description: `${formatUsd(topVendor.totalSpend)} in total across ${plural(topVendor.occurrences, "charge")}.`,
      severity: "info",
      category: null,
      metric: `${formatUsd(topVendor.totalSpend)} total`,
    });
  }
  if (!cards.some((c) => c.severity === "warning" || c.severity === "critical")) {
    cards.unshift({
      title: "Nothing unusual this period",
      description: "No category is running well above its recent average and no duplicates were found.",
      severity: "success",
      category: null,
      metric: `${formatUsd(ctx.totalSpent)} spent`,
    });
  }
  return cards;
}

function highCategoryInsight(c: CategoryLine, recentAverage: number, vsRecentPct: number): InsightCard {
  return {
    title: `${c.category} is running high`,
    description: `You spent ${formatUsd(c.spent)} on ${c.category} this period, ${formatPct(vsRecentPct)} more than your recent average of ${formatUsd(recentAverage)}.`,
    severity: vsRecentPct >= CRITICAL_INCREASE_PCT ? "critical" : "warning",
    category: c.category,
    metric: `${formatUsd(c.spent)} vs ${formatUsd(recentAverage)} average`,
  };
}

function savings(ctx: NarrativeContext): SavingsOpportunity[] {
  const items: SavingsOpportunity[] = [];
  if (ctx.flags.possibleDuplicates > 0) {
    items.push({
      title: "Confirm possible duplicates",
      description: "If the vendor or your bank confirms a charge was duplicated, ask for the extra charge to be refunded.",
      estimated_impact: "Depends on what is confirmed",
    });
  }
  for (const crowded of ctx.crowdedCategories.slice(0, 2)) {
    items.push({
      title: `Review overlapping vendors in ${crowded.category}`,
      description: `You used ${crowded.vendorCount} different vendors in ${crowded.category}. Check whether any of them do the same job.`,
      estimated_impact: "Depends on what you consolidate",
    });
  }
  return items;
}
