"use client";
// Subscriptions: every recurring charge, what it costs a year, the charges
// coming up, a calendar export and cancellation or negotiation drafts.
//
// Demo: drafts come from the template functions and the calendar from toIcs,
// all in the browser with no model and no network. Signed in: the draft and
// calendar API routes build them from the user's full history.
import { CalendarPlus, Check, Copy, ExternalLink, FileText, PhoneCall, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Cadence, Draft, DraftKind, LeakReport, PriceChange, RecurringStream } from "@/lib/expense-intel/contracts";
import { formatUsd } from "@/lib/expense-intel/ai/format";
import { findGuideEntry } from "@/lib/expense-intel/actions/cancel-guide";
import { templateCancellation, templateNegotiation } from "@/lib/expense-intel/actions/templates";
import { toIcs } from "@/lib/expense-intel/leaks";
import { cadenceSpec } from "@/lib/expense-intel/leaks/cadence";
import { addDays } from "@/lib/expense-intel/leaks/dates";
import { dueDates } from "@/lib/expense-intel/leaks/ics";
import { api } from "@/lib/imports/http";
import { shortDate } from "./LeaksView";
import styles from "./leaks.module.css";
import type { ViewProps } from "./types";

const APP_NAME = "Aether Flow";
const CALENDAR_URL = "/api/expense-intel/calendar";
const DRAFTS_URL = "/api/expense-intel/drafts";
const UPCOMING_DAYS = 60;

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  quarterly: "Every three months",
  annual: "Yearly",
};
const PER: Record<Cadence, string> = {
  weekly: "/ week",
  biweekly: "/ 2 weeks",
  monthly: "/ month",
  quarterly: "/ quarter",
  annual: "/ year",
};

type SortKey = "cost-desc" | "cost-asc" | "next" | "name";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "cost-desc", label: "Yearly cost, highest first" },
  { key: "cost-asc", label: "Yearly cost, lowest first" },
  { key: "next", label: "Next charge" },
  { key: "name", label: "Name" },
];

interface UpcomingCharge {
  date: string;
  stream: RecurringStream;
  amount: number;
}
interface Week {
  start: string;
  charges: UpcomingCharge[];
  total: number;
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The current price per charge; annualCost already reflects a price change. */
function perCharge(stream: RecurringStream): number {
  return roundCents(stream.annualCost / cadenceSpec(stream.cadence).perYear);
}

function weekday(iso: string, style: "short" | "long" = "short"): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: style });
}

function monthDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

/** Monday of the week containing the date. */
function weekStart(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, -((dow + 6) % 7));
}

export function upcomingWeeks(report: LeakReport, today: string, days = UPCOMING_DAYS): Week[] {
  const until = addDays(today, days);
  const charges: UpcomingCharge[] = report.subscriptions
    .filter((s) => s.status === "active")
    .flatMap((stream) => dueDates(stream, today, until).map((date) => ({ date, stream, amount: perCharge(stream) })))
    .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount || a.stream.key.localeCompare(b.stream.key));
  const weeks = new Map<string, Week>();
  for (const charge of charges) {
    const start = weekStart(charge.date);
    const week = weeks.get(start) ?? { start, charges: [], total: 0 };
    week.charges.push(charge);
    week.total = roundCents(week.total + charge.amount);
    weeks.set(start, week);
  }
  return [...weeks.values()];
}

function sortStreams(streams: RecurringStream[], sort: SortKey): RecurringStream[] {
  const compare: Record<SortKey, (a: RecurringStream, b: RecurringStream) => number> = {
    "cost-desc": (a, b) => b.annualCost - a.annualCost,
    "cost-asc": (a, b) => a.annualCost - b.annualCost,
    next: (a, b) => a.nextExpectedDate.localeCompare(b.nextExpectedDate),
    name: (a, b) => a.vendor.localeCompare(b.vendor),
  };
  // Possibly cancelled streams are not in the total, so they always come last.
  return [...streams].sort(
    (a, b) =>
      Number(a.status !== "active") - Number(b.status !== "active") ||
      compare[sort](a, b) ||
      a.key.localeCompare(b.key),
  );
}

function downloadIcs(report: LeakReport) {
  const blob = new Blob([toIcs(report, APP_NAME)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "aether-flow-bills.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

interface OpenDraft {
  kind: DraftKind;
  stream: RecurringStream;
  priceChange: PriceChange | null;
}

export default function SubscriptionsView({ demo, report, today }: ViewProps) {
  const [sort, setSort] = useState<SortKey>("cost-desc");
  const [open, setOpen] = useState<OpenDraft | null>(null);
  const sortId = useId();

  const changes = useMemo(() => new Map(report.priceChanges.map((p) => [p.streamKey, p])), [report.priceChanges]);
  const streams = useMemo(() => sortStreams(report.subscriptions, sort), [report.subscriptions, sort]);
  const weeks = useMemo(() => upcomingWeeks(report, today), [report, today]);
  const upcomingTotal = roundCents(weeks.reduce((total, w) => total + w.total, 0));
  const upcomingCount = weeks.reduce((n, w) => n + w.charges.length, 0);
  const activeCount = report.subscriptions.filter((s) => s.status === "active").length;
  const annual = report.totals.subscriptionsAnnual;
  const close = useCallback(() => setOpen(null), []);

  if (report.subscriptions.length === 0) {
    return (
      <section className={`${styles.panel} ${styles.emptyState}`} aria-labelledby="subs-empty">
        <h2 id="subs-empty">No subscriptions found yet</h2>
        <p>
          {report.coverageNote ??
            "Subscriptions appear here once the same charge repeats on a regular schedule in your statements."}
        </p>
      </section>
    );
  }

  return (
    <div className={styles.view}>
      <section aria-labelledby="subs-summary">
        <h2 id="subs-summary" className={styles.srOnly}>
          Subscription spending
        </h2>
        <div className={styles.summaryStrip}>
          <div>
            <span className={styles.cardLabel}>Yearly subscription spend</span>
            <strong className={styles.cardValue} style={{ display: "block", margin: "8px 0 4px" }}>
              {formatUsd(annual)}
            </strong>
            <span className={styles.cardDetail}>Across {activeCount} active subscriptions</span>
          </div>
          <div>
            <span className={styles.cardLabel}>Per month</span>
            <strong className={styles.cardValue} style={{ display: "block", margin: "8px 0 4px" }}>
              {formatUsd(report.totals.subscriptionsMonthly)}
            </strong>
            <span className={styles.cardDetail}>The yearly total spread over 12 months</span>
          </div>
          <div>
            <span className={styles.cardLabel}>Due in the next {UPCOMING_DAYS} days</span>
            <strong className={styles.cardValue} style={{ display: "block", margin: "8px 0 4px" }}>
              {formatUsd(upcomingTotal)}
            </strong>
            <span className={styles.cardDetail}>{upcomingCount} expected charges</span>
          </div>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="subs-list">
        <div className={styles.panelHeading}>
          <div>
            <h2 id="subs-list">Your subscriptions</h2>
            <p>Charges that repeat on a regular schedule. Possibly cancelled ones are listed last and not counted.</p>
          </div>
          <div className={styles.toolbar}>
            <label className={styles.sortLabel} htmlFor={sortId}>
              Sort by
              <select id={sortId} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <ul className={styles.list} aria-label="Subscriptions">
          {streams.map((stream) => {
            const change = changes.get(stream.key) ?? null;
            return (
              <SubscriptionRow
                key={stream.key}
                stream={stream}
                change={change}
                share={annual > 0 && stream.status === "active" ? stream.annualCost / annual : 0}
                onDraft={(kind) => setOpen({ kind, stream, priceChange: change })}
              />
            );
          })}
        </ul>
      </section>

      <section className={styles.panel} aria-labelledby="subs-upcoming">
        <div className={styles.panelHeading}>
          <div>
            <h2 id="subs-upcoming">Upcoming charges</h2>
            <p>
              Expected in the next {UPCOMING_DAYS} days, from {shortDate(today)}. Amounts are estimated from your past
              charges.
            </p>
          </div>
          {demo ? (
            <button type="button" className={styles.primaryBtn} onClick={() => downloadIcs(report)}>
              <CalendarPlus size={14} aria-hidden /> Add to calendar (.ics)
            </button>
          ) : (
            <a className={styles.primaryBtn} href={CALENDAR_URL} download>
              <CalendarPlus size={14} aria-hidden /> Add to calendar (.ics)
            </a>
          )}
        </div>
        {weeks.length === 0 ? (
          <p className={styles.empty}>No charges expected in the next {UPCOMING_DAYS} days.</p>
        ) : (
          <div className={styles.weeks}>
            {weeks.map((week) => {
              const heading =
                week.start === weekStart(today) ? "This week" : `Week of ${monthDay(week.start)}`;
              return (
                <section key={week.start} className={styles.week} aria-label={`${heading}, ${formatUsd(week.total)}`}>
                  <div className={styles.weekHead}>
                    <h3>{heading}</h3>
                    <span>{formatUsd(week.total)}</span>
                  </div>
                  <ul className={styles.list}>
                    {week.charges.map((c) => (
                      <li key={`${c.stream.key}-${c.date}`} className={styles.charge}>
                        <span className={c.date === today ? styles.today : styles.day} aria-hidden>
                          <small>{weekday(c.date)}</small>
                          <b>{Number(c.date.slice(8, 10))}</b>
                        </span>
                        <span className={styles.chargeName}>
                          <span className={styles.srOnly}>
                            {weekday(c.date, "long")} {monthDay(c.date)}:{" "}
                          </span>
                          {c.stream.vendor}
                        </span>
                        <span className={styles.chargeAmount}>{formatUsd(c.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </section>

      {open && <DraftDialog demo={demo} draftFor={open} onClose={close} />}
    </div>
  );
}

function StatusBadge({ stream, change }: { stream: RecurringStream; change: PriceChange | null }) {
  if (stream.status === "possibly_cancelled") return <span className={styles.badgeIdle}>Possibly cancelled</span>;
  if (change && change.newAmount > change.previousAmount) return <span className={styles.badgeUp}>Price went up</span>;
  if (change) return <span className={styles.badge}>Price went down</span>;
  return <span className={styles.badgeMuted}>Active</span>;
}

function SubscriptionRow({
  stream,
  change,
  share,
  onDraft,
}: {
  stream: RecurringStream;
  change: PriceChange | null;
  share: number;
  onDraft: (kind: DraftKind) => void;
}) {
  const active = stream.status === "active";
  return (
    <li className={styles.subRow}>
      <div className={styles.subName}>
        <strong>{stream.vendor}</strong>
        <span className={styles.toolbar}>
          <StatusBadge stream={stream} change={change} />
          <span className={styles.cardDetail}>
            {CADENCE_LABEL[stream.cadence]} · {stream.category} · {stream.occurrences} charges
          </span>
        </span>
      </div>
      <div className={styles.subFigures}>
        <b>
          {formatUsd(stream.lastAmount)} <span className={styles.cardDetail}>{PER[stream.cadence]}</span>
        </b>
        <span>{active ? `Next: ${shortDate(stream.nextExpectedDate)}` : `Last: ${shortDate(stream.lastDate)}`}</span>
      </div>
      <div className={styles.subFigures}>
        <b>{formatUsd(stream.annualCost)}</b>
        <span>{active ? "a year" : `a year, was due ${shortDate(stream.nextExpectedDate)}`}</span>
        {active && (
          <span
            className={styles.share}
            role="img"
            aria-label={`${Math.round(share * 100)}% of your subscription spending`}
          >
            <span className={styles.barFill} style={{ width: `${Math.max(2, share * 100)}%` }} />
          </span>
        )}
      </div>
      <div className={styles.actions}>
        {change && change.newAmount > change.previousAmount && (
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => onDraft("negotiate")}
            aria-label={`Draft negotiation for ${stream.vendor}`}
          >
            <PhoneCall size={14} aria-hidden /> Draft negotiation
          </button>
        )}
        <button
          type="button"
          className={styles.smallBtn}
          onClick={() => onDraft("cancel")}
          aria-label={`Draft cancellation for ${stream.vendor}`}
        >
          <FileText size={14} aria-hidden /> Draft cancellation
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Draft dialog
// ---------------------------------------------------------------------------

function demoDraft({ kind, stream, priceChange }: OpenDraft): Draft {
  const guide = findGuideEntry(stream.vendorKey);
  return kind === "cancel" ? templateCancellation(stream, guide) : templateNegotiation(stream, priceChange, guide);
}

const CHANNEL_NOTE: Record<Draft["channel"], string> = {
  email: "A message to send to their support team yourself.",
  web_form: "Cancel in your account settings. The message is there if you need their support team.",
  phone_script: "A script to read when you call or chat with them.",
};

type DraftState = { status: "loading" } | { status: "ready"; draft: Draft } | { status: "error"; message: string };

function DraftDialog({ demo, draftFor, onClose }: { demo: boolean; draftFor: OpenDraft; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descId = useId();
  const [remote, setRemote] = useState<DraftState>({ status: "loading" });
  const [copied, setCopied] = useState<"" | "message" | "failed">("");
  const local = useMemo(() => (demo ? demoDraft(draftFor) : null), [demo, draftFor]);
  const state: DraftState = local ? { status: "ready", draft: local } : remote;
  const { kind, stream } = draftFor;

  // Open as a modal (the browser traps focus) and give focus back on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    headingRef.current?.focus();
    return () => {
      if (dialog?.open && typeof dialog.close === "function") dialog.close();
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (demo) return;
    let live = true;
    api<Draft>(DRAFTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, streamKey: stream.key }),
    })
      .then((draft) => live && setRemote({ status: "ready", draft }))
      .catch((e: unknown) =>
        live &&
        setRemote({
          status: "error",
          message: e instanceof Error ? e.message : "The draft could not be written. Please try again.",
        }),
      );
    return () => {
      live = false;
    };
  }, [demo, kind, stream.key]);

  async function copy(draft: Draft) {
    const text = draft.subject ? `Subject: ${draft.subject}\n\n${draft.body}` : draft.body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied("message");
    } catch {
      setCopied("failed");
    }
  }

  const title = kind === "cancel" ? `Cancel ${stream.vendor}` : `Ask ${stream.vendor} for a better price`;

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className={styles.dialogInner}>
        <div className={styles.dialogHead}>
          <div>
            <p className={styles.eyebrow}>{kind === "cancel" ? "Cancellation draft" : "Negotiation script"}</p>
            <h2 id={titleId} ref={headingRef} tabIndex={-1}>
              {title}
            </h2>
            <p id={descId}>
              {state.status === "ready"
                ? CHANNEL_NOTE[state.draft.channel]
                : "Every figure comes from your own statements."}
            </p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close draft">
            <X size={16} aria-hidden />
          </button>
        </div>

        {state.status === "loading" && (
          <p className={styles.loading} role="status">
            Writing your draft…
          </p>
        )}
        {state.status === "error" && (
          <p className={styles.error} role="alert">
            {state.message}
          </p>
        )}
        {state.status === "ready" && (
          <>
            <section className={styles.section} aria-label="Message">
              <h3>{state.draft.channel === "phone_script" ? "What to say" : "Message"}</h3>
              <div className={styles.message}>
                {state.draft.subject && <div className={styles.subject}>Subject: {state.draft.subject}</div>}
                <p className={styles.body}>{state.draft.body}</p>
              </div>
            </section>

            {state.draft.steps.length > 0 && (
              <section className={styles.section} aria-label="Steps">
                <h3>{kind === "cancel" ? "How to cancel" : "Before you call"}</h3>
                <ol className={styles.steps}>
                  {state.draft.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>
            )}

            {state.draft.cancelUrl && (
              <a className={styles.link} href={state.draft.cancelUrl} target="_blank" rel="noopener noreferrer">
                {kind === "cancel" ? "Official cancellation page" : "Official account page"}
                <ExternalLink size={13} aria-hidden />
                <span className={styles.srOnly}>(opens in a new tab)</span>
              </a>
            )}

            <section className={styles.section} aria-label="Facts used">
              <h3>Facts from your statements</h3>
              <dl className={styles.facts}>
                {state.draft.facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className={styles.dialogFoot}>
              <span className={styles.source}>
                {state.draft.source === "model"
                  ? "Worded by AI. Every figure is checked against your statements."
                  : "Written from a template using your own figures."}
              </span>
              <div className={styles.actions}>
                <span aria-live="polite" className={styles.source}>
                  {copied === "message" ? "Copied" : copied === "failed" ? "Copy failed. Select the text instead." : ""}
                </span>
                <button type="button" className={styles.primaryBtn} onClick={() => copy(state.draft)}>
                  {copied === "message" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                  Copy {state.draft.channel === "phone_script" ? "script" : "message"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
