// Answer text for an executed query. Isomorphic.
//
// The answer is a template over the computed rows, so every figure in it is
// copied from `AskResult`. If model phrasing is added later, it must receive
// these rows as its only facts and pass the narrative faithfulness check
// (workstream C's `checkFaithfulness`), falling back to `templateAnswer`.
import type { Txn } from "../contracts";
import { describeRange, formatDate } from "./dates";
import type { AskAnswer, AskQuery, AskResult, AskRow, DeclineReason } from "./types";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const money = (n: number) => usd.format(n);

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Names the matched vendor when the search hit exactly one, else quotes the search. */
function vendorPhrase(vendorText: string, txns: Txn[]): string {
  const names = new Set(txns.map((t) => t.vendor));
  return names.size === 1 ? `at ${[...names][0]}` : `at vendors matching "${vendorText}"`;
}

function amountPhrase(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `between ${money(min)} and ${money(max)}`;
  if (min !== null) return `of ${money(min)} or more`;
  if (max !== null) return `of ${money(max)} or less`;
  return "";
}

/** "on recurring Software/SaaS expenses at Figma in October 2026". */
function scopePhrase(result: AskResult): string {
  const { filters } = result.query;
  const kind = [
    filters.recurringOnly ? "recurring" : "",
    joinList(filters.categories),
    "expenses",
  ].filter(Boolean).join(" ");
  return [
    kind,
    amountPhrase(filters.minAmount, filters.maxAmount),
    filters.vendorText ? vendorPhrase(filters.vendorText, result.transactions) : "",
    describeRange(result.range),
  ].filter(Boolean).join(" ");
}

/** " (Food/Dining expenses in October 2026)", or nothing when no filter applies. */
function paren(scope: string): string {
  return scope === "expenses" ? "" : ` (${scope})`;
}

function rowFigure(metric: AskQuery["metric"], row: AskRow): string {
  return metric === "count" ? plural(row.value, "expense") : money(row.value);
}

const METRIC_NOUN: Record<AskQuery["metric"], string> = {
  sum: "total",
  count: "count",
  average: "average expense",
  max: "largest expense",
  list: "total",
};

function ungroupedAnswer(result: AskResult, scope: string): string {
  const { overall } = result;
  const count = plural(overall.count, "expense");
  switch (result.query.metric) {
    case "sum":
      return `You spent ${money(overall.total)} across ${count}${paren(scope)}.`;
    case "count":
      return `You had ${count}${paren(scope)}, totalling ${money(overall.total)}.`;
    case "average":
      return `Your average was ${money(overall.average)} per expense across ${count}${paren(scope)}.`;
    case "max": {
      const t = overall.largest;
      if (!t) return emptyAnswer(result, scope);
      return `Your largest was ${money(t.amount)} at ${t.vendor} on ${formatDate(t.date)}${paren(scope)}.`;
    }
    case "list": {
      const shown = result.rows.length;
      const more = shown < overall.count ? ` Showing ${shown}.` : "";
      return `Found ${count} totalling ${money(overall.total)}${paren(scope)}.${more}`;
    }
  }
}

function monthlyAnswer(result: AskResult, scope: string): string {
  const { rows, query } = result;
  const months = plural(result.totalRows, "month");
  const top = [...rows].sort((a, b) => b.value - a.value)[0];
  const highest = `The highest was ${top.label} at ${rowFigure(query.metric, top)}.`;
  if (query.metric === "sum") {
    // Months with no spending are zero-filled rows, so this is a true monthly average.
    const perMonth = money(result.overall.total / result.totalRows);
    return `Across ${months} you spent ${money(result.overall.total)}, about ${perMonth} a month${paren(scope)}. ${highest}`;
  }
  return `Here is the ${METRIC_NOUN[query.metric]} for each of ${months}${paren(scope)}. ${highest}`;
}

function groupedAnswer(result: AskResult, scope: string): string {
  const { rows, query } = result;
  const noun = query.groupBy === "category" ? "category" : "vendor";
  const ranked = rows.slice(0, 3).map((r) => `${r.label} (${rowFigure(query.metric, r)})`);
  const groups = plural(result.totalRows, noun, noun === "category" ? "categories" : "vendors");
  const order = query.sort === "value_asc" ? "Lowest" : query.sort === "value_desc" ? "Highest" : "First";
  return `${order} by ${METRIC_NOUN[query.metric]}: ${joinList(ranked)}. ${groups} in all, ${money(result.overall.total)} total${paren(scope)}.`;
}

function emptyAnswer(result: AskResult, scope: string): string {
  const span = result.dataSpan;
  if (!span) return "You have no expenses uploaded yet.";
  return `No ${scope} matched. Your data covers ${formatDate(span.from)} to ${formatDate(span.to)}.`;
}

function recurringNote(result: AskResult): string {
  return result.recurringSource === "repeat_months"
    ? " Recurring here means charged in 3 or more different months."
    : "";
}

/** Answer text built only from computed values. */
export function templateAnswer(result: AskResult): AskAnswer {
  const scope = scopePhrase(result);
  let text: string;
  if (result.overall.count === 0) text = emptyAnswer(result, scope);
  else if (result.query.metric === "list" || result.query.groupBy === "none")
    text = ungroupedAnswer(result, scope);
  else if (result.query.groupBy === "month") text = monthlyAnswer(result, scope);
  else text = groupedAnswer(result, scope);
  return { text: text + recurringNote(result), source: "template" };
}

const EXAMPLE = `For example: "How much did I spend on software last month?"`;

export const DECLINE_MESSAGES: Record<DeclineReason, string> = {
  advice:
    "I can only report what's in your uploaded expenses, so I can't give tax, investment, legal or other financial advice. I can show you the numbers behind a decision, " +
    `like "How much do I spend on subscriptions each month?"`,
  other_people:
    "I can only see your own uploaded expenses, so I can't answer questions about other people. " +
    EXAMPLE,
  unrelated: `I can only answer questions about your uploaded expenses. ${EXAMPLE}`,
  unclear: `I couldn't turn that into a question about your expenses. Try rephrasing it. ${EXAMPLE}`,
  no_data: "Upload a statement first, then ask about your spending.",
};
