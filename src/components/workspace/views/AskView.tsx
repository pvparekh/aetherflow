"use client";
// "Ask your spending". The model only translates a question into a small,
// validated query; code runs the query and writes the answer from the computed
// rows. Demo: preset questions carry hand-written queries and run entirely in
// the browser (no model, no network). Signed in: POST /api/expense-intel/ask.
import { useId, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Cpu,
  Loader2,
  MessageCircleQuestion,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Txn } from "@/lib/expense-intel/contracts";
import {
  PRESET_QUESTIONS,
  money,
  runQuery,
  templateAnswer,
  type AskAnswer,
  type AskQuery,
  type AskRow,
  type DataSpan,
  type DateRange,
  type DeclineReason,
  type Metric,
  type Period,
  type PresetQuestion,
  type RecurringSource,
  type SortOrder,
  type GroupBy,
} from "@/lib/expense-intel/ask";
import { formatDate } from "@/lib/expense-intel/ask/dates";
import type { ViewProps } from "./types";
import styles from "./budgets-ask.module.css";

import { MAX_QUESTION_LENGTH } from "@/lib/expense-intel/ask/types";
export { MAX_QUESTION_LENGTH };
/** Matching expenses listed under an answer. */
const SHOWN_TRANSACTIONS = 15;
const ASK_URL = "/api/expense-intel/ask";

// --- Shapes ----------------------------------------------------------------

/** Answer body from the ask route (see its `serialise`). */
interface ApiAnswer {
  kind: "answer";
  answer: AskAnswer;
  query: AskQuery;
  range: DateRange | null;
  dataSpan: DataSpan | null;
  rows: AskRow[];
  totalRows: number;
  overall: { count: number; total: number; average: number; largestTransactionId: string | null };
  transactions: Txn[];
  recurringSource: RecurringSource | null;
}

interface ApiDeclined {
  kind: "declined";
  reason: DeclineReason;
  answer: AskAnswer;
}

interface ShownAnswer {
  kind: "answer";
  question: string;
  text: string;
  /** "preset": hand-written query, no model. "model": translated by the model. */
  origin: "preset" | "model";
  query: AskQuery;
  range: DateRange | null;
  dataSpan: DataSpan | null;
  rows: AskRow[];
  totalRows: number;
  count: number;
  total: number;
  transactions: Txn[];
  recurringSource: RecurringSource | null;
}

interface ShownDecline {
  kind: "declined";
  question: string;
  text: string;
}

type Shown = ShownAnswer | ShownDecline;

// --- Plain-English labels for the query --------------------------------------

const METRIC_LABEL: Record<Metric, string> = {
  sum: "Total spent",
  count: "Number of expenses",
  average: "Average per expense",
  max: "Largest single expense",
  list: "List of matching expenses",
};

const GROUP_LABEL: Record<GroupBy, string> = {
  none: "One overall figure",
  category: "By category",
  vendor: "By vendor",
  month: "By month",
};

const SORT_LABEL: Record<SortOrder, string> = {
  value_desc: "Largest first",
  value_asc: "Smallest first",
  newest: "Newest first",
  oldest: "Oldest first",
};

const PERIOD_LABEL: Record<Period, string> = {
  all_time: "All time",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  last_quarter: "Last quarter",
  this_year: "This year",
  last_year: "Last year",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  last_12_months: "Last 12 months",
  custom: "Custom dates",
};

const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(" ");

function rangeText(range: DateRange | null, span: DataSpan | null): string {
  if (!range) {
    return span
      ? `Everything (${formatDate(span.from)} to ${formatDate(span.to)})`
      : "Everything";
  }
  if (range.from && range.to) return `${formatDate(range.from)} to ${formatDate(range.to)}`;
  if (range.from) return `From ${formatDate(range.from)}`;
  if (range.to) return `Up to ${formatDate(range.to)}`;
  return "Everything";
}

function amountText(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return `Between ${money(min)} and ${money(max)}`;
  if (min !== null) return `${money(min)} or more`;
  if (max !== null) return `${money(max)} or less`;
  return null;
}

function rowFigure(metric: Metric, value: number): string {
  return metric === "count" ? `${value.toLocaleString("en-US")} ${value === 1 ? "expense" : "expenses"}` : money(value);
}

function errorFor(status: number, serverMessage: string | null): string {
  if (serverMessage) return serverMessage;
  switch (status) {
    case 400:
      return `Ask a question of 1 to ${MAX_QUESTION_LENGTH} characters.`;
    case 401:
      return "Sign in again to ask about your spending.";
    case 429:
      return "Too many questions. Wait a minute and try again.";
    case 503:
      return "The question service is unavailable right now. Try again later; your figures are unaffected.";
    default:
      return "Could not answer that question right now.";
  }
}

async function postQuestion(question: string): Promise<ApiAnswer | ApiDeclined> {
  let res: Response;
  try {
    res = await fetch(ASK_URL, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : null;
    throw new Error(errorFor(res.status, message));
  }
  if (typeof body !== "object" || body === null || !("kind" in body))
    throw new Error(errorFor(500, null));
  return body as ApiAnswer | ApiDeclined;
}

function fromApi(question: string, body: ApiAnswer | ApiDeclined): Shown {
  if (body.kind === "declined") return { kind: "declined", question, text: body.answer.text };
  return {
    kind: "answer",
    question,
    text: body.answer.text,
    origin: "model",
    query: body.query,
    range: body.range,
    dataSpan: body.dataSpan,
    rows: body.rows,
    totalRows: body.totalRows,
    count: body.overall.count,
    total: body.overall.total,
    transactions: body.transactions,
    recurringSource: body.recurringSource,
  };
}

// ---------------------------------------------------------------------------

export default function AskView({ demo, txns, today, report }: ViewProps) {
  const ids = useId();
  const local = demo && txns !== null;
  const [question, setQuestion] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const requestSeq = useRef(0);

  function runPresetLocally(preset: PresetQuestion) {
    if (!local) return;
    const result = runQuery(txns, preset.query, { today, report });
    setRequestError(null);
    setShown({
      kind: "answer",
      question: preset.question,
      text: templateAnswer(result).text,
      origin: "preset",
      query: result.query,
      range: result.range,
      dataSpan: result.dataSpan,
      rows: result.rows,
      totalRows: result.totalRows,
      count: result.overall.count,
      total: result.overall.total,
      transactions: result.transactions,
      recurringSource: result.recurringSource,
    });
  }

  async function ask(text: string) {
    const seq = ++requestSeq.current;
    setPending(text);
    setRequestError(null);
    try {
      const body = await postQuestion(text);
      if (seq !== requestSeq.current) return;
      setShown(fromApi(text, body));
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setRequestError(e instanceof Error ? e.message : errorFor(500, null));
    } finally {
      if (seq === requestSeq.current) setPending(null);
    }
  }

  function choosePreset(preset: PresetQuestion) {
    setActivePreset(preset.id);
    setInputError(null);
    if (local) runPresetLocally(preset);
    else void ask(preset.question);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (local) return;
    const trimmed = question.trim();
    if (!trimmed) {
      setInputError("Type a question first.");
      return;
    }
    if (trimmed.length > MAX_QUESTION_LENGTH) {
      setInputError(`Keep it under ${MAX_QUESTION_LENGTH} characters.`);
      return;
    }
    setActivePreset(null);
    setInputError(null);
    void ask(trimmed);
  }

  const describedBy = [
    `${ids}-hint`,
    inputError ? `${ids}-error` : null,
  ].filter(Boolean).join(" ");

  return (
    <section className={styles.view} aria-labelledby={`${ids}-title`}>
      <div className={styles.card}>
        <h2 id={`${ids}-title`} className={styles.title}>
          <MessageCircleQuestion size={20} className={styles.titleIcon} aria-hidden />
          Ask your spending
        </h2>
        <p className={styles.lead}>
          Ask a question in plain English. It is turned into a precise search of
          your expenses, and every figure in the answer is added up directly from
          your data.
        </p>

        <form className={styles.askForm} onSubmit={submit} noValidate>
          <label htmlFor={`${ids}-question`}>Your question</label>
          <div className={styles.askRow}>
            <input
              id={`${ids}-question`}
              type="text"
              value={question}
              maxLength={MAX_QUESTION_LENGTH}
              placeholder={
                local
                  ? "Pick a suggested question below"
                  : "e.g. How much did I spend on travel this quarter?"
              }
              onChange={(e) => {
                setQuestion(e.target.value);
                setInputError(null);
              }}
              disabled={local}
              aria-describedby={describedBy}
              aria-invalid={inputError ? true : undefined}
              autoComplete="off"
            />
            <button
              type="submit"
              className="btn primary"
              disabled={local || pending !== null}
            >
              <Search size={14} aria-hidden /> Ask
            </button>
          </div>
          <div className={styles.askMeta}>
            <p id={`${ids}-hint`} className={cx(styles.muted, styles.small)}>
              {local ? (
                <>
                  Free-form questions need an account and a language model, so
                  the demo answers the suggested questions only.{" "}
                  <a href="/signup" style={{ color: "var(--forest)", fontWeight: 600 }}>
                    Create an account
                  </a>
                </>
              ) : (
                "Questions about your own expenses only. No advice, no other people."
              )}
            </p>
            {!local ? (
              <span className={cx(styles.muted, styles.small, styles.num)} aria-hidden>
                {question.length}/{MAX_QUESTION_LENGTH}
              </span>
            ) : null}
          </div>
          {inputError ? (
            <p id={`${ids}-error`} className={styles.error} role="alert">
              <AlertTriangle size={14} aria-hidden /> {inputError}
            </p>
          ) : null}
        </form>

        <h3 id={`${ids}-presets`} className={styles.chipsLabel}>
          Try a question
        </h3>
        <ul className={styles.chips} aria-labelledby={`${ids}-presets`}>
          {PRESET_QUESTIONS.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                className={styles.chip}
                aria-pressed={activePreset === preset.id}
                onClick={() => choosePreset(preset)}
                disabled={pending !== null}
              >
                {preset.question}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div aria-live="polite" aria-busy={pending !== null} className={styles.view}>
        {pending !== null ? (
          <div className={styles.card}>
            <p className={styles.pending}>
              <Loader2 size={16} className={styles.spin} aria-hidden />
              Working out the answer to “{pending}”…
            </p>
          </div>
        ) : null}

        {requestError && pending === null ? (
          <div className={cx(styles.notice, styles.noticeError)} role="alert">
            <AlertTriangle size={16} aria-hidden />
            <p>{requestError}</p>
          </div>
        ) : null}

        {shown && pending === null ? (
          shown.kind === "declined" ? (
            <DeclinedCard shown={shown} />
          ) : (
            <AnswerCard shown={shown} />
          )
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function DeclinedCard({ shown }: { shown: ShownDecline }) {
  return (
    <div className={cx(styles.card, styles.declined)}>
      <ShieldCheck size={18} className={styles.titleIcon} aria-hidden />
      <div>
        <p className={styles.question}>You asked: “{shown.question}”</p>
        <p style={{ marginTop: 6 }}>{shown.text}</p>
      </div>
    </div>
  );
}

function AnswerCard({ shown }: { shown: ShownAnswer }) {
  const { query } = shown;
  const grouped = query.metric !== "list" && query.groupBy !== "none" && shown.rows.length > 0;
  const listed = shown.transactions.slice(0, SHOWN_TRANSACTIONS);
  const largestTxnId =
    query.metric === "max" ? (shown.rows[0]?.transactionId ?? null) : null;

  return (
    <article className={cx(styles.card, styles.answerCard)} aria-label="Answer">
      <p className={styles.question}>
        <MessageCircleQuestion size={14} aria-hidden /> “{shown.question}”
      </p>

      <p className={styles.answerText}>{shown.text}</p>

      <div className={styles.badges}>
        <span className={styles.badge}>
          <ShieldCheck size={12} aria-hidden />
          Computed from {shown.count.toLocaleString("en-US")}{" "}
          {shown.count === 1 ? "expense" : "expenses"}
        </span>
        {shown.origin === "preset" ? (
          <span className={cx(styles.badge, styles.badgeWarm)}>
            <Sparkles size={12} aria-hidden /> Suggested question, no model used
          </span>
        ) : null}
      </div>

      {grouped ? (
        <ResultBars shown={shown} />
      ) : null}

      {listed.length > 0 ? (
        <div>
          <h3 className={styles.sectionTitle}>
            {shown.count > listed.length
              ? `Matching expenses (newest ${listed.length} of ${shown.count.toLocaleString("en-US")})`
              : "Matching expenses"}
          </h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Vendor</th>
                  <th scope="col">Category</th>
                  <th scope="col" className={styles.right}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {listed.map((t) => (
                  <tr
                    key={t.id}
                    style={t.id === largestTxnId ? { background: "var(--soft)" } : undefined}
                  >
                    <td className={styles.num}>{formatDate(t.date)}</td>
                    <td className={styles.vendorCell} title={t.vendor}>
                      {t.vendor}
                    </td>
                    <td>{t.category}</td>
                    <td className={cx(styles.right, styles.num)}>{money(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <HowComputed shown={shown} />
    </article>
  );
}

function ResultBars({ shown }: { shown: ShownAnswer }) {
  const { query, rows } = shown;
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  const noun = query.groupBy === "month" ? "month" : query.groupBy;
  const heading =
    shown.totalRows > rows.length
      ? `${METRIC_LABEL[query.metric]} by ${noun} (top ${rows.length} of ${shown.totalRows})`
      : `${METRIC_LABEL[query.metric]} by ${noun}`;
  return (
    <div>
      <h3 className={styles.sectionTitle}>{heading}</h3>
      <ul className={styles.bars}>
        {rows.map((row) => (
          <li key={row.key} className={styles.barItem}>
            <span className={styles.barLabel} title={row.label}>
              {row.label}
              {query.metric !== "count" ? (
                <span className={cx(styles.muted, styles.small)}>
                  {" "}
                  · {row.count} {row.count === 1 ? "expense" : "expenses"}
                </span>
              ) : null}
            </span>
            <span className={styles.barValue}>{rowFigure(query.metric, row.value)}</span>
            <span className={styles.barTrack} aria-hidden>
              <span
                className={styles.barFill}
                style={{ width: `${Math.max(0, (row.value / max) * 100).toFixed(2)}%`, display: "block" }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HowComputed({ shown }: { shown: ShownAnswer }) {
  const { query } = shown;
  const { filters } = query;
  const amount = amountText(filters.minAmount, filters.maxAmount);
  const period =
    filters.period === "all_time"
      ? PERIOD_LABEL.all_time
      : `${PERIOD_LABEL[filters.period]}: ${rangeText(shown.range, shown.dataSpan)}`;

  return (
    <details className={styles.disclosure}>
      <summary>
        <ChevronRight size={14} className={styles.chevron} aria-hidden />
        How this was computed
      </summary>
      <p className={cx(styles.muted, styles.small)} style={{ marginTop: 10 }}>
        {shown.origin === "preset"
          ? "This suggested question comes with a ready-made search, so no language model was involved. "
          : "A language model translated your question into the search below. It did not see your figures or write any numbers. "}
        Code then filtered your expenses and added them up; every number above
        comes from that calculation.
      </p>
      <div className={styles.pipeline} aria-label="Steps">
        <span className={cx(styles.step, shown.origin === "model" && styles.stepModel)}>
          {shown.origin === "model" ? (
            <>
              <Cpu size={11} aria-hidden style={{ verticalAlign: "-1px" }} /> Model: question to search
            </>
          ) : (
            "Ready-made search"
          )}
        </span>
        <ChevronRight size={12} aria-hidden />
        {shown.origin === "model" ? (
          <>
            <span className={styles.step}>Code: check the search</span>
            <ChevronRight size={12} aria-hidden />
          </>
        ) : null}
        <span className={styles.step}>Code: filter and add up</span>
        <ChevronRight size={12} aria-hidden />
        <span className={styles.step}>Code: write the answer</span>
      </div>
      <dl className={styles.queryGrid}>
        <dt>Measure</dt>
        <dd>{METRIC_LABEL[query.metric]}</dd>
        <dt>Grouping</dt>
        <dd>{query.metric === "list" ? "Individual expenses" : GROUP_LABEL[query.groupBy]}</dd>
        <dt>Dates</dt>
        <dd>{period}</dd>
        <dt>Categories</dt>
        <dd>{filters.categories.length ? filters.categories.join(", ") : "All categories"}</dd>
        {filters.vendorText ? (
          <>
            <dt>Vendor name contains</dt>
            <dd>“{filters.vendorText}”</dd>
          </>
        ) : null}
        {amount ? (
          <>
            <dt>Amount per expense</dt>
            <dd>{amount}</dd>
          </>
        ) : null}
        {filters.recurringOnly ? (
          <>
            <dt>Recurring only</dt>
            <dd>
              {shown.recurringSource === "repeat_months"
                ? "Yes: vendors charged in 3 or more different months"
                : "Yes: charges identified as recurring in your subscriptions report"}
            </dd>
          </>
        ) : null}
        <dt>Order</dt>
        <dd>
          {SORT_LABEL[query.sort]}, up to {query.limit} {query.limit === 1 ? "row" : "rows"}
        </dd>
      </dl>
      <details style={{ marginTop: 12 }}>
        <summary className={cx(styles.small, styles.muted)}>Show the raw search</summary>
        <pre className={styles.json}>{JSON.stringify(query, null, 2)}</pre>
      </details>
    </details>
  );
}

export { AskView };
