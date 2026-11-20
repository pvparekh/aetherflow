import { computeTrendDirection } from "./stats/trends";
export interface HistoryRow {
  category: string;
  upload_id: string;
  total_spend_period: number | null;
}
export function summarizeHistory(rows: HistoryRow[], orderedIds: string[]) {
  const cats = [...new Set(rows.map((r) => r.category))];
  return cats
    .map((category) => {
      const sorted = rows
        .filter((r) => r.category === category)
        .sort(
          (a, b) =>
            orderedIds.indexOf(b.upload_id) - orderedIds.indexOf(a.upload_id),
        );
      const totals = sorted.map((r) => Number(r.total_spend_period ?? 0));
      const recent = totals.slice(0, 5);
      return {
        category,
        total_spend_alltime:
          Math.round(totals.reduce((s, v) => s + v, 0) * 100) / 100,
        rolling_avg_5: recent.length
          ? recent.reduce((s, v) => s + v, 0) / recent.length
          : 0,
        trend_direction: computeTrendDirection(
          totals.slice(0, 3),
          totals.slice(3, 6),
        ),
        std_dev: null,
      };
    })
    .sort((a, b) => b.total_spend_alltime - a.total_spend_alltime);
}
