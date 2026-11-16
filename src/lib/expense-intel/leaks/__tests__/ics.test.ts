import { describe, expect, it } from "vitest";
import type { LeakReport, RecurringStream } from "../../contracts";
import { buildLeakReport } from "../report";
import { escapeText, foldLine, toIcs } from "../ics";
import { monthly, periodMarkers } from "./fixtures";

function stream(overrides: Partial<RecurringStream>): RecurringStream {
  return {
    key: "netflix:monthly",
    vendor: "Netflix",
    vendorKey: "netflix",
    category: "Entertainment",
    cadence: "monthly",
    typicalAmount: 15.49,
    lastAmount: 15.49,
    lastDate: "2026-10-07",
    nextExpectedDate: "2026-12-07",
    annualCost: 185.88,
    occurrences: 6,
    confidence: "high",
    status: "active",
    transactionIds: [],
    ...overrides,
  };
}

function reportWith(subscriptions: RecurringStream[]): LeakReport {
  return {
    ...buildLeakReport([], "2026-11-15"),
    subscriptions,
  };
}

/** Undo line folding (RFC 5545 section 3.1). */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
}

function events(ics: string): string[][] {
  const lines = unfold(ics);
  const result: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT") {
      result.push(current!);
      current = null;
    } else current?.push(line);
  }
  return result;
}

const prop = (event: string[], name: string) => event.find((l) => l.startsWith(name))?.slice(name.length);

describe("toIcs", () => {
  const ics = toIcs(reportWith([stream({})]), "Aether Flow");

  it("is a VCALENDAR with CRLF line endings throughout", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Aether Flow//Bill calendar//EN\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("creates one all-day event per expected charge over the next 12 months", () => {
    const list = events(ics);
    expect(list).toHaveLength(12);
    expect(prop(list[0], "DTSTART;VALUE=DATE:")).toBe("20261207");
    expect(prop(list[0], "DTEND;VALUE=DATE:")).toBe("20261208");
    expect(prop(list[11], "DTSTART;VALUE=DATE:")).toBe("20271107");
    expect(prop(list[0], "SUMMARY:")).toBe("Netflix $15.49");
    expect(prop(list[0], "DTSTAMP:")).toBe("20261115T000000Z");
  });

  it("derives stable, unique UIDs from the stream key and date", () => {
    const uids = events(ics).map((e) => prop(e, "UID:"));
    expect(uids[0]).toBe("netflix-monthly-20261207@aether-flow");
    expect(new Set(uids).size).toBe(uids.length);
    expect(toIcs(reportWith([stream({})]), "Aether Flow")).toBe(ics);
  });

  it("leaves out possibly cancelled subscriptions", () => {
    const out = toIcs(reportWith([stream({ status: "possibly_cancelled" })]), "Aether Flow");
    expect(events(out)).toEqual([]);
  });

  it("schedules weekly and annual charges by their own cadence", () => {
    const out = toIcs(
      reportWith([
        stream({ key: "hellofresh:weekly", vendor: "HelloFresh", cadence: "weekly", nextExpectedDate: "2026-11-16", annualCost: 3639.48 }),
        stream({ key: "1password:annual", vendor: "1Password", cadence: "annual", nextExpectedDate: "2027-03-12", annualCost: 35.88 }),
      ]),
      "Aether Flow",
    );
    const summaries = events(out).map((e) => prop(e, "SUMMARY:"));
    expect(summaries.filter((s) => s?.startsWith("HelloFresh $69.99"))).toHaveLength(52);
    expect(summaries.filter((s) => s === "1Password $35.88")).toHaveLength(1);
  });

  it("escapes text and folds long lines at 75 octets without splitting characters", () => {
    const vendor = "Café Société; Bakers, Brewers & Co \\ Ltd — Ünïcödé Deluxe Membership Plan";
    const out = toIcs(reportWith([stream({ vendor, key: "cafe:monthly" })]), "Aether Flow");
    for (const line of out.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const summary = prop(events(out)[0], "SUMMARY:");
    expect(summary).toBe(`${escapeText(vendor)} $15.49`);
    expect(summary).toContain("Société\\; Bakers\\, Brewers & Co \\\\ Ltd");
  });

  it("builds a calendar from a real report", () => {
    const report = buildLeakReport(
      [...monthly("Netflix", 15.49, "2026-05-07", 6, "Entertainment"), ...periodMarkers("2026-05-01", "2026-10-31")],
      "2026-11-15",
    );
    expect(events(toIcs(report, "Aether Flow"))).toHaveLength(12);
  });
});

describe("escapeText and foldLine", () => {
  it("escapes backslashes, semicolons, commas and newlines", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("leaves short lines alone and folds long ones with CRLF and a space", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
    const long = `DESCRIPTION:${"x".repeat(200)}`;
    const folded = foldLine(long);
    expect(folded.split("\r\n ").join("")).toBe(long);
    expect(folded.split("\r\n")[0]).toHaveLength(75);
    expect(folded.split("\r\n")[1]).toHaveLength(75); // space + 74
  });

  it("never splits a multi-byte character across lines", () => {
    const folded = foldLine(`SUMMARY:${"é".repeat(60)}`);
    for (const line of folded.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      expect(line).not.toContain("�");
    }
    expect(folded.split("\r\n ").join("")).toBe(`SUMMARY:${"é".repeat(60)}`);
  });
});
