import { describe, expect, it } from "vitest";
import { checkFaithfulness, type FaithfulnessFacts } from "./faithfulness";

const facts: FaithfulnessFacts = {
  amounts: [1234.56, 459, 280.25],
  percents: [23.4, -18, 64],
  counts: [42, 3],
  dates: ["2026-10-03"],
  names: ["Software/SaaS", "Figma", "Microsoft 365"],
  knownNames: ["Food/Dining", "Software/SaaS", "Netflix", "Figma", "Calm"],
};

const ok = (text: string) => checkFaithfulness(text, facts);

describe("checkFaithfulness: true cases", () => {
  it.each([
    ["exact money", "You spent $1,234.56 on Software/SaaS."],
    ["money rounded to whole dollars", "About $1,235 went to Figma."],
    ["money in thousands", "Roughly $1.2k overall."],
    ["money without cents", "$459 vs $280 average"],
    ["percent rounded to whole percent", "Software/SaaS was 23% of the total."],
    ["exact one-decimal percent", "Software/SaaS was 23.4% of the total."],
    ["signed percent written as a decrease", "Spending was 18% lower than usual."],
    ["the word percent", "up 64 percent"],
    ["counts", "42 transactions, 3 flagged"],
    ["ordinal-free count with dollars word", "459 dollars"],
    ["allowed date in words", "Last charged on October 3, 2026."],
    ["allowed short date", "Charged Oct 3."],
    ["allowed ISO date", "Charged 2026-10-03."],
    ["digits inside an allowed vendor name", "Microsoft 365 renewed."],
    ["lowercase common word matching a known vendor", "Spending looks calm this month."],
    ["no figures at all", "Nothing unusual this period."],
  ])("accepts %s", (_, text) => {
    expect(ok(text)).toEqual({ ok: true, problems: [] });
  });
});

describe("checkFaithfulness: false cases", () => {
  it.each([
    ["invented amount", "You could save $500 a year.", "Amount $500"],
    ["truncated rather than rounded", "$1,234 on software", "Amount $1,234"],
    ["computed difference", "$178.75 more than usual", "Amount $178.75"],
    ["wrong percent", "Up 25% from last period.", "Percentage 25%"],
    ["invented count", "7 new vendors appeared.", "Number 7"],
    ["unlisted known vendor", "Consider dropping Netflix.", '"Netflix"'],
    ["category not in context", "Food/Dining is running high.", '"Food/Dining"'],
    ["invented category label", "Pets/Animals grew fast.", '"Pets/Animals"'],
    ["date not supplied", "Renews on November 3, 2026.", "Date"],
    ["wrong month and year", "Since September 2026.", "Date"],
  ])("rejects %s", (_, text, expected) => {
    const result = ok(text);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" | ")).toContain(expected);
  });

  it("lists each distinct problem once", () => {
    const result = ok("$500 and $500 and 99%");
    expect(result.problems).toEqual([
      "Amount $500 is not in the supplied data",
      "Percentage 99% is not in the supplied data",
    ]);
  });

  it("allows the year of a supplied date but not other years", () => {
    expect(ok("Since 2026.").ok).toBe(true);
    expect(ok("Since 2019.").ok).toBe(false);
  });
});
