// Faithfulness check for model-written text. Isomorphic.
//
// Code computes every figure; the model only writes wording. This check
// enforces that split after generation: every money amount, percentage,
// count and date in the text must trace to a value code supplied, and every
// vendor or category name it mentions must be one the context allows.
//
// Known limits: numbers spelled as words ("two charges") are not checked, and
// an unfamiliar vendor name is only caught when it appears in `knownNames`.

export interface FaithfulnessFacts {
  /** Dollar values the text may state. */
  amounts: number[];
  /** Percentages the text may state (sign ignored: "12% lower" states 12). */
  percents: number[];
  /** Integer counts the text may state. */
  counts: number[];
  /** ISO dates (YYYY-MM-DD) the text may mention. Their years are also allowed as counts. */
  dates?: string[];
  /** Vendor and category names the text may mention. */
  names: string[];
  /** Names that are flagged if mentioned without being in `names` (other vendors, all categories). */
  knownNames?: string[];
}

export interface FaithfulnessResult {
  ok: boolean;
  problems: string[];
}

const NUMBER = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const NOT_WORD_BEFORE = String.raw`(?<![\p{L}\p{N}])`;
const NOT_WORD_AFTER = String.raw`(?![\p{L}\p{N}])`;

const MONEY = new RegExp(String.raw`\$\s?(${NUMBER})([km])?${NOT_WORD_AFTER}`, "giu");
const MONEY_WORDS = new RegExp(String.raw`${NOT_WORD_BEFORE}(${NUMBER})\s?(?:dollars|usd)${NOT_WORD_AFTER}`, "giu");
const PERCENT = new RegExp(String.raw`${NOT_WORD_BEFORE}(${NUMBER})\s?(?:%|percent${NOT_WORD_AFTER})`, "giu");
const BARE_NUMBER = new RegExp(String.raw`${NOT_WORD_BEFORE}(${NUMBER})(?:st|nd|rd|th)?${NOT_WORD_AFTER}`, "giu");

const MONTH_NAMES = [
  "jan(?:uary)?", "feb(?:ruary)?", "mar(?:ch)?", "apr(?:il)?", "may", "june?",
  "july?", "aug(?:ust)?", "sep(?:t(?:ember)?)?", "oct(?:ober)?", "nov(?:ember)?", "dec(?:ember)?",
];
const MONTH_DATE = new RegExp(
  String.raw`\b(${MONTH_NAMES.join("|")})\.?\s+(\d{1,4})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?${NOT_WORD_AFTER}`,
  "giu",
);
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const SLASH_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g;
// Looks like a category label ("Pets/Animals") but is not an allowed name.
const CATEGORY_LIKE = /\b[A-Z][a-z]+\/[A-Z][A-Za-z]+\b/g;

interface DatePart {
  year?: number;
  month: number;
  day?: number;
}

interface Extracted {
  raw: string;
  value: number;
  /** The rounding unit the text implies: "$12" is 1, "$12.50" is 0.01, "$1.2k" is 100. */
  step: number;
}

export function checkFaithfulness(text: string, facts: FaithfulnessFacts): FaithfulnessResult {
  const problems: string[] = [];
  let rest = maskAllowedNames(text, facts.names);
  rest = findUnknownNames(rest, facts, problems);
  rest = findUnsupportedDates(rest, facts.dates ?? [], problems);

  const yearsOfDates = (facts.dates ?? []).map((d) => Number(d.slice(0, 4)));
  const counts = [...facts.counts, ...yearsOfDates];

  rest = extract(rest, MONEY, (found) => {
    if (!supported(found, facts.amounts)) problems.push(`Amount ${found.raw} is not in the supplied data`);
  });
  rest = extract(rest, MONEY_WORDS, (found) => {
    if (!supported(found, facts.amounts)) problems.push(`Amount ${found.raw} is not in the supplied data`);
  });
  rest = extract(rest, PERCENT, (found) => {
    if (!supported(found, facts.percents)) problems.push(`Percentage ${found.raw} is not in the supplied data`);
  });
  extract(rest, BARE_NUMBER, (found) => {
    // A bare number may be a count or an amount written without "$".
    const pool = Number.isInteger(found.value) ? [...counts, ...facts.amounts] : facts.amounts;
    if (!supported(found, pool)) problems.push(`Number ${found.raw} is not in the supplied data`);
  });

  const unique = [...new Set(problems)];
  return { ok: unique.length === 0, problems: unique };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function wholeWord(name: string, flags: string): RegExp {
  return new RegExp(`${NOT_WORD_BEFORE}${escapeRegExp(name)}${NOT_WORD_AFTER}`, flags);
}

/** Blank out allowed names first so digits inside them ("Microsoft 365") are not read as figures. */
function maskAllowedNames(text: string, names: string[]): string {
  const longestFirst = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  return longestFirst.reduce((t, name) => t.replace(wholeWord(name, "giu"), " "), text);
}

function findUnknownNames(text: string, facts: FaithfulnessFacts, problems: string[]): string {
  const allowed = new Set(facts.names.map((n) => n.toLowerCase()));
  let rest = text;
  const known = [...new Set(facts.knownNames ?? [])].sort((a, b) => b.length - a.length);
  for (const name of known) {
    if (!name || allowed.has(name.toLowerCase())) continue;
    // Case-sensitive: a vendor called "Calm" should not match the word "calm".
    const pattern = wholeWord(name, "gu");
    if (pattern.test(rest)) {
      problems.push(`Mentions "${name}", which is not in the supplied data`);
      rest = rest.replace(pattern, " ");
    }
  }
  for (const match of rest.matchAll(CATEGORY_LIKE)) {
    problems.push(`Mentions "${match[0]}", which is not in the supplied data`);
  }
  return rest;
}

function findUnsupportedDates(text: string, allowedIso: string[], problems: string[]): string {
  const allowed = allowedIso.map(parseIso);
  const isSupported = (d: DatePart) =>
    allowed.some(
      (a) =>
        a.month === d.month &&
        (d.day === undefined || a.day === d.day) &&
        (d.year === undefined || a.year === d.year),
    );
  const check = (raw: string, date: DatePart | null) => {
    if (!date) return raw;
    if (!isSupported(date)) problems.push(`Date "${raw.trim()}" is not in the supplied data`);
    return " ";
  };

  return text
    .replace(ISO_DATE, (raw) => check(raw, parseIso(raw)))
    .replace(SLASH_DATE, (raw, m: string, d: string, y: string) =>
      check(raw, { month: Number(m), day: Number(d), year: y.length === 2 ? 2000 + Number(y) : Number(y) }),
    )
    .replace(MONTH_DATE, (raw, monthName: string, first: string, year?: string) => {
      const month = monthIndex(monthName);
      // "October 2026" names a month and year; "October 3" a day.
      if (first.length === 4) return check(raw, { month, year: Number(first) });
      const day = Number(first);
      if (day < 1 || day > 31) return raw;
      return check(raw, { month, day, year: year ? Number(year) : undefined });
    });
}

function parseIso(iso: string): DatePart {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)), day: Number(iso.slice(8, 10)) };
}

function monthIndex(name: string): number {
  const prefix = name.slice(0, 3).toLowerCase();
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(prefix) + 1;
}

function extract(text: string, pattern: RegExp, onMatch: (found: Extracted) => void): string {
  return text.replace(pattern, (raw: string, num: string, suffix?: string) => {
    onMatch(parseFigure(raw, num, typeof suffix === "string" ? suffix : undefined));
    return " ";
  });
}

function parseFigure(raw: string, num: string, suffix?: string): Extracted {
  const multiplier = suffix?.toLowerCase() === "k" ? 1_000 : suffix?.toLowerCase() === "m" ? 1_000_000 : 1;
  const decimals = num.includes(".") ? num.split(".")[1].length : 0;
  return {
    raw: raw.trim(),
    value: Number(num.replace(/,/g, "")) * multiplier,
    step: 10 ** -decimals * multiplier,
  };
}

function supported(found: Extracted, pool: number[]): boolean {
  const tolerance = found.step / 2 + 1e-9;
  return pool.some((fact) => Number.isFinite(fact) && Math.abs(Math.abs(fact) - found.value) <= tolerance);
}
