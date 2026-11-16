// Display formatting shared by the narrative template and the drafts.
// Isomorphic. The faithfulness checker reads these formats back, so a value
// rendered here always traces to the number it came from.

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "23%" for whole numbers, "23.4%" otherwise. */
export function formatPct(pct: number): string {
  const rounded = Math.round(Math.abs(pct) * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

/** ISO YYYY-MM-DD to "October 3, 2026", read as a calendar date (no time zone shift). */
export function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
