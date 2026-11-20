import Papa from "papaparse";
import type { Candidate, ImportOptions, Review } from "./contract";
import { MAX_ROWS, parseMoney, parseDate } from "./contract";

export function parseTextReview(
  content: string,
  filename: string,
  options: ImportOptions,
): Review {
  const warnings: string[] = [
    "Review all included rows. Only USD expenses are supported; credits and transfers must be excluded.",
  ];
  const rows: Candidate[] = [];
  const add = (
    vendor: string,
    rawAmount: string,
    rawDate: string,
    source: string,
    line: number,
    debit = false,
  ) => {
    const amount = parseMoney(rawAmount);
    const date = rawDate ? parseDate(rawDate, options.dateOrder) : null;
    const issues: string[] = [];
    if (amount === null) issues.push("Amount could not be read");
    if (rawDate && !date) issues.push("Date is invalid or unsupported");
    if (!rawDate) issues.push("No transaction date");
    let kind: Candidate["kind"] = "unknown";
    if (amount !== null)
      kind =
        debit || options.amountMode === "expenses"
          ? "expense"
          : amount < 0 === (options.amountMode === "negative-outflow")
            ? "expense"
            : "credit";
    if (options.amountMode === "expenses" && amount !== null && amount < 0) {
      kind = "unknown";
      issues.push("Negative amount: confirm direction before including");
    }
    if (!vendor.trim()) issues.push("Missing description");
    rows.push({
      id: String(line),
      vendor: vendor.trim().slice(0, 300),
      amount: Math.abs(amount ?? 0),
      date,
      kind,
      included:
        kind === "expense" &&
        amount !== null &&
        amount !== 0 &&
        !!vendor.trim() &&
        (!rawDate || !!date),
      source: source.slice(0, 4000),
      page: null,
      warnings: issues,
    });
  };
  if (filename.toLowerCase().endsWith(".txt")) {
    content.split(/\r?\n/).forEach((s, i) => {
      if (!s.trim()) return;
      const m = /^(.+?)\s+([$\d(),.+-]+)\s*$/.exec(s);
      add(m?.[1] ?? s, m?.[2] ?? "", "", s, i + 1);
    });
  } else {
    const result = Papa.parse<string[]>(content.replace(/^\uFEFF/, ""), {
      skipEmptyLines: "greedy",
    });
    if (result.errors.some((e) => e.code !== "UndetectableDelimiter"))
      throw new Error(
        "CSV structure is inconsistent. Check quoted fields and delimiters.",
      );
    const vendorAliases = [
      "vendor",
      "description",
      "merchant",
      "payee",
      "memo",
      "name",
    ];
    const amountAliases = [
      "amount",
      "total",
      "price",
      "cost",
      "value",
      "debit",
      "withdrawal",
      "amount debit",
      "debit amount",
      "credit",
      "deposit",
      "credit amount",
    ];
    const headerIndex = result.data
      .slice(0, 20)
      .findIndex(
        (r) =>
          r.some(
            (h) =>
              vendorAliases.includes(h.trim().toLowerCase()) ||
              h.trim() === options.columns?.vendor,
          ) &&
          r.some(
            (h) =>
              amountAliases.includes(h.trim().toLowerCase()) ||
              h.trim() === options.columns?.amount,
          ),
      );
    if (headerIndex < 0)
      throw new Error(
        "No supported CSV header found in the first 20 records. Map description, amount and date columns before choosing this file.",
      );
    const headers = result.data[headerIndex].map((h) => h.trim());
    if (new Set(headers).size !== headers.length)
      throw new Error(
        "CSV headers must be unique. Rename repeated or empty columns.",
      );
    if (headerIndex > 0)
      warnings.push(
        `Skipped ${headerIndex} preamble records before the CSV header.`,
      );
    const find = (aliases: string[]) =>
      headers.find((h) => aliases.includes(h.toLowerCase()));
    const vendor = options.columns?.vendor || find(vendorAliases);
    const date =
      options.columns?.date ||
      find(["date", "transaction date", "posted date", "trans date"]);
    const debit = options.columns?.amount
      ? undefined
      : find(["debit", "withdrawal", "amount debit", "debit amount"]);
    const credit = options.columns?.amount
      ? undefined
      : find(["credit", "deposit", "credit amount"]);
    const amount =
      options.columns?.amount ||
      find(["amount", "total", "price", "cost", "value"]);
    const currency = find(["currency", "currency code"]);
    if (
      !vendor ||
      (!amount && !debit && !credit) ||
      [vendor, date, amount].some((h) => h && !headers.includes(h))
    )
      throw new Error(
        "Mapped columns were not found. Use exact CSV header names.",
      );
    const records = result.data.slice(headerIndex + 1);
    if (records.length > MAX_ROWS)
      throw new Error(
        `Split this file into at most ${MAX_ROWS} transactions. Nothing was imported.`,
      );
    records.forEach((values, i) => {
      if (values.length !== headers.length)
        throw new Error(
          `CSV record ${headerIndex + i + 2} has a different column count. Check quoted fields.`,
        );
      const r = Object.fromEntries(headers.map((h, j) => [h, values[j]]));
      const debitPresent =
        !!debit && !!r[debit]?.trim() && parseMoney(r[debit]) !== 0;
      const creditPresent =
        !!credit && !!r[credit]?.trim() && parseMoney(r[credit]) !== 0;
      const isCredit = creditPresent && !debitPresent;
      add(
        r[vendor] ?? "",
        isCredit
          ? (r[credit!] ?? "")
          : debitPresent
            ? (r[debit!] ?? "")
            : amount
              ? (r[amount] ?? "")
              : "0",
        date ? (r[date] ?? "") : "",
        values.join(" | "),
        headerIndex + i + 2,
        debitPresent && !creditPresent,
      );
      const row = rows[rows.length - 1];
      if (isCredit) {
        row.kind = "credit";
        row.included = false;
        row.warnings.push("Credit excluded from expense analytics");
      }
      if (debitPresent && creditPresent) {
        row.kind = "unknown";
        row.included = false;
        row.warnings.push(
          "Both debit and credit are populated. Confirm the expense amount.",
        );
      }
      if (currency) row.currency = r[currency].trim().toUpperCase() || null;
      if (currency && row.currency !== "USD") {
        row.kind = "unknown";
        row.included = false;
        row.warnings.push(
          "Currency is not confirmed USD. Currency conversion is unsupported.",
        );
      }
    });
  }
  if (rows.length > MAX_ROWS)
    throw new Error(
      `Split this file into at most ${MAX_ROWS} transactions. Nothing has been imported.`,
    );
  if (!rows.length) throw new Error("No transaction candidates found");
  return {
    version: 1,
    filename,
    currency: "USD",
    rows,
    warnings,
    pages: null,
    method: filename.endsWith(".txt") ? "text patterns" : "CSV columns",
    completeness: "review-required",
    options,
  };
}
