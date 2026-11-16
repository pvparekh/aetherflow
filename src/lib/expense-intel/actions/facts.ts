// Facts a draft relies on, computed from the leak report by code. Isomorphic.
// Each sheet holds the display facts shown beside the draft and the raw
// values the faithfulness check accepts in the wording.
import type { Cadence, DraftFact, PriceChange, RecurringStream } from "../contracts";
import { formatDate, formatPct, formatUsd } from "../ai/format";
import type { FaithfulnessFacts } from "../ai/faithfulness";
import { GUIDE_VENDOR_NAMES } from "./cancel-guide";

export interface FactSheet {
  facts: DraftFact[];
  check: FaithfulnessFacts;
}

const CADENCE_WORDS: Record<Cadence, string> = {
  weekly: "every week",
  biweekly: "every two weeks",
  monthly: "every month",
  quarterly: "every three months",
  annual: "every year",
};

export function cadenceWords(cadence: Cadence): string {
  return CADENCE_WORDS[cadence];
}

// Store names a draft may legitimately mention when explaining where to cancel.
const PLATFORM_NAMES = ["Apple App Store", "App Store", "Google Play"];

function streamFacts(stream: RecurringStream): DraftFact[] {
  const facts: DraftFact[] = [
    { label: "Vendor", value: stream.vendor },
    { label: "Amount per charge", value: formatUsd(stream.lastAmount) },
    { label: "Billed", value: cadenceWords(stream.cadence) },
    { label: "Last charge", value: formatDate(stream.lastDate) },
    { label: "Cost per year", value: formatUsd(stream.annualCost) },
    { label: "Charges found", value: String(stream.occurrences) },
  ];
  if (stream.status === "active") {
    facts.splice(4, 0, { label: "Next expected charge", value: formatDate(stream.nextExpectedDate) });
  }
  return facts;
}

function streamCheck(stream: RecurringStream, extraNames: string[]): FaithfulnessFacts {
  return {
    amounts: [stream.lastAmount, stream.typicalAmount, stream.annualCost],
    percents: [],
    counts: [stream.occurrences],
    dates: [stream.lastDate, stream.nextExpectedDate],
    names: [stream.vendor, ...extraNames, ...PLATFORM_NAMES],
    knownNames: GUIDE_VENDOR_NAMES,
  };
}

export function cancellationFactSheet(stream: RecurringStream, guideName?: string): FactSheet {
  return {
    facts: streamFacts(stream),
    check: streamCheck(stream, guideName ? [guideName] : []),
  };
}

export function negotiationFactSheet(
  stream: RecurringStream,
  change: PriceChange | null,
  guideName?: string,
): FactSheet {
  const check = streamCheck(stream, guideName ? [guideName] : []);
  if (!change) return { facts: streamFacts(stream), check };

  const perCharge = Math.round((change.newAmount - change.previousAmount) * 100) / 100;
  return {
    facts: [
      ...streamFacts(stream),
      { label: "Previous price", value: formatUsd(change.previousAmount) },
      { label: "New price", value: formatUsd(change.newAmount) },
      { label: "Price changed on", value: formatDate(change.changedOn) },
      { label: "Increase per charge", value: `${formatUsd(Math.abs(perCharge))} (${formatPct(change.pct)})` },
      { label: "Extra cost per year", value: formatUsd(change.annualImpact) },
    ],
    check: {
      ...check,
      amounts: [...check.amounts, change.previousAmount, change.newAmount, perCharge, change.annualImpact],
      percents: [change.pct],
      dates: [...(check.dates ?? []), change.changedOn],
    },
  };
}
