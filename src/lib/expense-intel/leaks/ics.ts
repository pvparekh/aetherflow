// Bill calendar export (RFC 5545): one all-day event per expected charge of
// each active recurring stream over the 12 months from the report date.
// UIDs come from the stream key and date, so re-importing an updated file
// updates events instead of duplicating them.
import type { LeakReport, RecurringStream } from "../contracts";
import { advance, cadenceSpec } from "./cadence";
import { addDays, addMonths, dayOfMonth } from "./dates";
import { formatUsd, roundCents } from "./money";

const CRLF = "\r\n";
const MAX_LINE_OCTETS = 75;

export function toIcs(report: LeakReport, appName: string): string {
  const from = report.generatedAt;
  const until = addMonths(from, 12);
  const stamp = `${compactDate(from)}T000000Z`;
  const domain = slug(appName) || "calendar";

  const events = report.subscriptions
    .filter((s) => s.status === "active")
    .flatMap((stream) =>
      dueDates(stream, from, until).map((date) => eventLines(stream, date, stamp, domain, appName)),
    );

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${escapeText(appName)}//Bill calendar//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`${appName} bills`)}`,
    ...events.flat(),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** Expected charge dates in [from, until), stepping from the stream's next expected date. */
export function dueDates(stream: RecurringStream, from: string, until: string): string[] {
  const spec = cadenceSpec(stream.cadence);
  const billingDay = dayOfMonth(stream.nextExpectedDate);
  const dates: string[] = [];
  for (let cycles = 0; ; cycles++) {
    const date = advance(stream.nextExpectedDate, spec, cycles, billingDay);
    if (date >= until) break;
    if (date >= from) dates.push(date);
  }
  return dates;
}

function eventLines(
  stream: RecurringStream,
  date: string,
  stamp: string,
  domain: string,
  appName: string,
): string[] {
  // The current price: annualCost already reflects a confirmed price change.
  const amount = roundCents(stream.annualCost / cadenceSpec(stream.cadence).perYear);
  const description =
    `Expected ${stream.cadence} charge of about ${formatUsd(amount)} ` +
    `(${formatUsd(stream.annualCost)} a year). Estimated by ${appName} from your statements.`;
  return [
    "BEGIN:VEVENT",
    `UID:${slug(stream.key)}-${compactDate(date)}@${domain}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compactDate(date)}`,
    `DTEND;VALUE=DATE:${compactDate(addDays(date, 1))}`,
    `SUMMARY:${escapeText(`${stream.vendor} ${formatUsd(amount)}`)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `CATEGORIES:${escapeText(stream.category)}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

function compactDate(iso: string): string {
  return iso.replace(/-/g, "");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma and newlines. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds a content line to at most 75 octets per physical line, continuing
 * with CRLF and one space, never splitting a multi-byte UTF-8 character.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const pieces: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward the limit.
    const limit = pieces.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (octets + size > limit) {
      pieces.push(current);
      current = "";
      octets = 0;
    }
    current += char;
    octets += size;
  }
  pieces.push(current);
  return pieces.join(`${CRLF} `);
}
