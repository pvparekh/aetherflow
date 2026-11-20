"use client";
// Leak summary: the default landing view. Every figure comes from the leak
// report, which code computes; this view only arranges and words it.
import {
  ArrowRight,
  CircleAlert,
  CopyX,
  Repeat,
  SearchCheck,
  TrendingUp,
  Hourglass,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Cadence, LeakReport, PriceChange, RecurringStream } from "@/lib/expense-intel/contracts";
import { formatPct, formatUsd } from "@/lib/expense-intel/ai/format";
import styles from "./leaks.module.css";
import type { ViewProps } from "./types";

const PER_CHARGE: Record<Cadence, string> = {
  weekly: "a week",
  biweekly: "every two weeks",
  monthly: "a month",
  quarterly: "a quarter",
  annual: "a year",
};

/** "Jun 14, 2026", read as a calendar date with no time zone shift. */
export function shortDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function count(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

function joinDates(dates: string[]): string {
  const labels = dates.map(shortDate);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function hasFindings(report: LeakReport): boolean {
  return (
    report.subscriptions.length > 0 ||
    report.priceChanges.length > 0 ||
    report.duplicates.length > 0 ||
    report.unusual.length > 0
  );
}

/** One short line saying what the headline amount is made of. */
function breakdownSentence(report: LeakReport): ReactNode {
  const { priceIncreasesAnnual, duplicatesTotal } = report.totals;
  const increases = report.priceChanges.filter((p) => p.annualImpact > 0).length;
  const parts: ReactNode[] = [];
  if (priceIncreasesAnnual > 0)
    parts.push(
      <span key="p">
        <strong>{formatUsd(priceIncreasesAnnual)}</strong> a year from {count(increases, "price increase")}
      </span>,
    );
  if (duplicatesTotal > 0)
    parts.push(
      <span key="d">
        <strong>{formatUsd(duplicatesTotal)}</strong> from{" "}
        {count(report.duplicates.length, "charge")} billed twice
      </span>,
    );
  if (parts.length === 0) return "No price increases or double charges in your statements.";
  return (
    <>
      That is {parts.length === 2 ? <>{parts[0]}, plus {parts[1]}</> : parts[0]}. Only money already
      charged or locked in is counted, never a guess at savings.
    </>
  );
}

export default function LeaksView({ report, navigate }: ViewProps) {
  if (!hasFindings(report)) return <EmptyLeaks report={report} />;

  const { totals } = report;
  const active = report.subscriptions.filter((s) => s.status === "active");
  const stopped = report.subscriptions.filter((s) => s.status === "possibly_cancelled");
  const increases = report.priceChanges.filter((p) => p.annualImpact > 0);
  const streams = new Map(report.subscriptions.map((s) => [s.key, s]));
  const toSubscriptions = () => navigate?.("subscriptions");
  const biggest = Math.max(totals.priceIncreasesAnnual, totals.duplicatesTotal, 1);

  return (
    <div className={styles.view}>
      <section className={styles.hero} aria-labelledby="leaks-headline">
        <div>
          <p className={styles.eyebrow}>
            <SearchCheck size={14} aria-hidden /> Leak finder
          </p>
          <h2 id="leaks-headline" className={styles.headline}>
            {totals.foundAnnual > 0 ? (
              <>
                We found <em>{formatUsd(totals.foundAnnual)}</em> a year
              </>
            ) : (
              <>Nothing is leaking right now</>
            )}
          </h2>
          <p className={styles.lead}>{breakdownSentence(report)}</p>
          {report.periodStart && report.periodEnd && (
            <p className={styles.period}>
              Based on {count(report.transactionCount, "expense")} from {shortDate(report.periodStart)} to{" "}
              {shortDate(report.periodEnd)}.
            </p>
          )}
        </div>
        <div className={styles.breakdown} aria-label="What makes up the total">
          <BreakdownBar
            label="Price increases, per year"
            value={totals.priceIncreasesAnnual}
            max={biggest}
          />
          <BreakdownBar label="Charged twice" value={totals.duplicatesTotal} max={biggest} warm />
          {report.coverageNote && <p className={styles.note}>{report.coverageNote}</p>}
        </div>
      </section>

      <section aria-labelledby="leaks-summary-title">
        <h2 id="leaks-summary-title" className={styles.srOnly}>
          Summary
        </h2>
        <div className={styles.cards}>
          <SummaryCard
            icon={<Repeat size={16} aria-hidden />}
            label="Subscriptions"
            value={String(active.length)}
            detail={`${formatUsd(totals.subscriptionsAnnual)} a year, about ${formatUsd(totals.subscriptionsMonthly)} a month`}
            more="See all"
            onClick={toSubscriptions}
          />
          <SummaryCard
            icon={<TrendingUp size={16} aria-hidden />}
            tone="alert"
            label="Price increases"
            value={String(increases.length)}
            detail={
              increases.length
                ? `+${formatUsd(totals.priceIncreasesAnnual)} a year since prices went up`
                : "No subscription has raised its price"
            }
            more="Review"
            onClick={toSubscriptions}
          />
          <SummaryCard
            icon={<CopyX size={16} aria-hidden />}
            tone="alert"
            label="Duplicate charges"
            value={String(report.duplicates.length)}
            detail={
              report.duplicates.length
                ? `${formatUsd(totals.duplicatesTotal)} charged more than once`
                : "No double charges found"
            }
            href="#leaks-duplicates"
            more="Details"
          />
          <SummaryCard
            icon={<CircleAlert size={16} aria-hidden />}
            tone="warm"
            label="Unusual charges"
            value={String(report.unusual.length)}
            detail={
              report.unusual.length
                ? "Much bigger than you normally spend there"
                : "Nothing out of the ordinary"
            }
            href="#leaks-unusual"
            more="Details"
          />
          <SummaryCard
            icon={<Hourglass size={16} aria-hidden />}
            tone="warm"
            label="Possibly cancelled"
            value={String(stopped.length)}
            detail={
              stopped.length
                ? `${stopped.map((s) => s.vendor).join(", ")}: expected charge is overdue. Check it really stopped.`
                : "Every subscription is charging on schedule"
            }
            more="Check"
            onClick={toSubscriptions}
          />
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="leaks-increases">
        <div className={styles.panelHeading}>
          <div>
            <h2 id="leaks-increases">Price increases</h2>
            <p>Subscriptions that now charge more than they used to.</p>
          </div>
          {navigate && report.priceChanges.length > 0 && (
            <button type="button" className={styles.smallBtn} onClick={toSubscriptions}>
              Draft a negotiation <ArrowRight size={14} aria-hidden />
            </button>
          )}
        </div>
        {report.priceChanges.length === 0 ? (
          <p className={styles.empty}>No subscription has changed its price.</p>
        ) : (
          <ul className={styles.list}>
            {report.priceChanges.map((change) => (
              <PriceChangeItem key={change.streamKey} change={change} stream={streams.get(change.streamKey)} />
            ))}
          </ul>
        )}
      </section>

      <div className={styles.grid2}>
        <section className={styles.panel} aria-labelledby="leaks-duplicates">
          <div className={styles.panelHeading}>
            <div>
              <h2 id="leaks-duplicates" tabIndex={-1}>
                Duplicate charges
              </h2>
              <p>The same amount from the same place, charged again within a few days.</p>
            </div>
          </div>
          {report.duplicates.length === 0 ? (
            <p className={styles.empty}>No double charges found.</p>
          ) : (
            <ul className={styles.list}>
              {report.duplicates.map((d) => (
                <li key={d.transactionIds.join("-")} className={styles.item}>
                  <div>
                    <div className={styles.itemTitle}>{d.vendor}</div>
                    <p className={styles.itemMeta}>
                      {formatUsd(d.amount)} charged {d.dates.length} times: {joinDates(d.dates)}
                    </p>
                  </div>
                  <div className={styles.itemAmount}>
                    {formatUsd(d.extraCost)}
                    <span className={styles.itemAmountSub}>extra</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="leaks-unusual">
          <div className={styles.panelHeading}>
            <div>
              <h2 id="leaks-unusual" tabIndex={-1}>
                Unusual charges
              </h2>
              <p>Not necessarily wrong, but worth a second look.</p>
            </div>
          </div>
          {report.unusual.length === 0 ? (
            <p className={styles.empty}>Nothing out of the ordinary.</p>
          ) : (
            <ul className={styles.list}>
              {report.unusual.map((u) => (
                <li key={u.transactionId} className={styles.item}>
                  <div>
                    <div className={styles.itemTitle}>
                      {u.vendor}
                      <span className={u.severity === "critical" ? styles.badgeUp : styles.badgeIdle}>
                        {u.severity === "critical" ? "Very unusual" : "Unusual"}
                      </span>
                    </div>
                    <p className={styles.itemMeta}>
                      {shortDate(u.date)} · {u.category}
                    </p>
                    <p className={styles.itemMeta}>{u.reason}</p>
                  </div>
                  <div className={styles.itemAmount}>{formatUsd(u.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function BreakdownBar({ label, value, max, warm }: { label: string; value: number; max: number; warm?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={styles.breakdownRow}>
      <div className={styles.breakdownLabel}>
        <span>{label}</span>
        <span>{formatUsd(value)}</span>
      </div>
      <div className={styles.bar} aria-hidden>
        <span className={warm ? styles.barFillWarm : styles.barFill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
  more,
  tone,
  onClick,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  more: string;
  tone?: "alert" | "warm";
  onClick?: () => void;
  href?: string;
}) {
  const iconClass = tone === "alert" ? styles.cardIconAlert : tone === "warm" ? styles.cardIconWarm : styles.cardIcon;
  const content = (
    <>
      <span className={iconClass}>{icon}</span>
      <span className={styles.cardLabel}>{label}</span>
      <span className={styles.cardValue}>{value}</span>
      <span className={styles.cardDetail}>{detail}</span>
      <span className={styles.cardMore} aria-hidden>
        {more} <ArrowRight size={12} />
      </span>
    </>
  );
  const accessibleName = `${label}: ${value}. ${detail}`;
  if (href) {
    return (
      <a
        className={styles.card}
        href={href}
        aria-label={accessibleName}
        onClick={(e) => {
          const target = document.getElementById(href.slice(1));
          if (!target) return;
          e.preventDefault();
          target.scrollIntoView?.({ behavior: "smooth", block: "start" });
          target.focus({ preventScroll: true });
        }}
      >
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={styles.card} onClick={onClick} disabled={!onClick} aria-label={accessibleName}>
      {content}
    </button>
  );
}

function PriceChangeItem({ change, stream }: { change: PriceChange; stream: RecurringStream | undefined }) {
  const per = stream ? PER_CHARGE[stream.cadence] : "a charge";
  const up = change.newAmount > change.previousAmount;
  return (
    <li className={styles.item}>
      <div>
        <div className={styles.itemTitle}>
          {change.vendor}
          <span className={up ? styles.badgeUp : styles.badge}>
            {up ? "+" : "-"}
            {formatPct(change.pct)}
          </span>
        </div>
        <p className={styles.itemMeta}>
          <span className={styles.priceStep}>
            <span className={styles.old}>{formatUsd(change.previousAmount)}</span>
            <ArrowRight size={12} aria-label="to" />
            <span>
              {formatUsd(change.newAmount)} {per}
            </span>
          </span>{" "}
          · since {shortDate(change.changedOn)}
        </p>
      </div>
      <div className={`${styles.itemAmount} ${up ? styles.up : styles.down}`}>
        {up ? "+" : "-"}
        {formatUsd(Math.abs(change.annualImpact))}
        <span className={styles.itemAmountSub}>a year</span>
      </div>
    </li>
  );
}

function EmptyLeaks({ report }: { report: LeakReport }) {
  return (
    <section className={`${styles.panel} ${styles.emptyState}`} aria-labelledby="leaks-empty">
      <span className={styles.cardIcon}>
        <SearchCheck size={16} aria-hidden />
      </span>
      <h2 id="leaks-empty">No leaks found yet</h2>
      <p>
        {report.coverageNote ??
          "We did not find any subscriptions, price increases, double charges or unusual spending in your statements."}
      </p>
    </section>
  );
}
