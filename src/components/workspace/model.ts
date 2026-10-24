import type {
  Upload,
  LineItem,
  CategoryStats,
  Vendor,
  Flag,
  Pass2Result,
} from "@/lib/expense-intel/types";
export interface UploadList {
  id: string;
  filename: string;
  uploaded_at: string;
  total_amount: number | null;
  line_item_count: number | null;
  pass1_status: string;
  pass2_status: string;
  health_score: number | null;
}
export interface DashboardData {
  upload: Upload;
  line_items: LineItem[];
  category_stats: CategoryStats[];
  category_history: {
    category: string;
    points: { uploaded_at: string; total: number }[];
  }[];
  vendors: Vendor[];
  flags: Flag[];
  pass2: Pass2Result | null;
}
export const money = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(n ?? 0),
  );
export function sampleData(): DashboardData {
  const entries: [string, number, string, string][] = [
    ["Figma", 45, "Software/SaaS", "2026-09-03"],
    ["Adobe", 59.99, "Software/SaaS", "2026-09-04"],
    ["Hudson Office Supply", 186.42, "Office/Supplies", "2026-09-07"],
    ["NJ Transit", 32.5, "Travel/Transport", "2026-09-09"],
    ["Verizon", 120, "Utilities", "2026-09-10"],
    ["Google Cloud", 420, "Software/SaaS", "2026-09-12"],
    ["Blue Bottle", 28.75, "Food/Dining", "2026-09-14"],
    ["Studio North", 1250, "Marketing/Ads", "2026-09-16"],
    ["Google Cloud", 420, "Software/SaaS", "2026-09-12"],
    ["Delta", 348.22, "Travel/Transport", "2026-09-19"],
    ["The Westin", 560, "Accommodation", "2026-09-20"],
    ["Hudson Office Supply", 94.25, "Office/Supplies", "2026-09-23"],
  ];
  const line_items: LineItem[] = entries.map(
    ([vendor, amount, category, date], i) => ({
      id: `sample-${i}`,
      upload_id: "sample",
      raw_text: `${date},${vendor},${amount.toFixed(2)}`,
      vendor,
      amount,
      category,
      transaction_date: date,
      subcategory: null,
      confidence: 0.95,
      z_score: i === 7 ? 2.8 : 0,
      is_anomaly: i === 7 || i === 8,
      anomaly_severity: i === 7 ? "high" : "none",
      is_first_time_vendor: i === 7,
      is_round_number: amount % 100 === 0,
      is_possible_duplicate: i === 8,
      user_resolution: null,
    }),
  );
  const total = line_items.reduce((s, r) => s + Number(r.amount), 0);
  const category_stats: CategoryStats[] = [
    ...new Set(entries.map((r) => r[2])),
  ].map((category, i) => {
    const rows = line_items.filter((r) => r.category === category);
    const sum = rows.reduce((s, r) => s + Number(r.amount), 0);
    return {
      id: `cat-${i}`,
      category,
      upload_id: "sample",
      computed_at: "2026-09-30",
      total_spend_period: sum,
      total_spend_alltime: sum,
      mean_amount: sum / rows.length,
      median_amount: null,
      std_dev: null,
      rolling_avg_5: sum,
      rolling_avg_alltime: sum,
      pct_of_total_spend: (sum / total) * 100,
      trend_direction: "stable",
    };
  });
  const vendors: Vendor[] = [...new Set(entries.map((r) => r[0]))].map(
    (vendor_name, i) => {
      const rows = line_items.filter((r) => r.vendor === vendor_name);
      const sum = rows.reduce((s, r) => s + Number(r.amount), 0);
      return {
        id: `v-${i}`,
        user_id: "sample",
        vendor_name,
        first_seen_upload_id: "sample",
        last_seen_upload_id: "sample",
        total_occurrences: rows.length,
        total_spend: sum,
        avg_amount: sum / rows.length,
        recurrence_tier: rows.length > 1 ? "occasional" : "one_time",
        primary_category: rows[0].category,
      };
    },
  );
  const upload: Upload = {
    id: "sample",
    user_id: "sample",
    filename: "September-expenses.csv",
    uploaded_at: "2026-09-30T12:00:00Z",
    total_amount: total,
    line_item_count: entries.length,
    pass1_status: "complete",
    pass2_status: "pending",
    health_score: null,
    ai_analysis: null,
  };
  return {
    upload,
    line_items,
    category_stats,
    category_history: [],
    vendors,
    flags: [
      {
        severity: "warning",
        flag_type: "duplicate",
        title: "Possible repeated expense",
        description:
          "Two Google Cloud entries share the same amount and date. Check the original statement before deciding.",
        metric: "$420 × 2",
        vendor: "Google Cloud",
        amount: 420,
        z_score: null,
        category: "Software/SaaS",
        related_line_item_ids: ["sample-8"],
      },
      {
        severity: "warning",
        flag_type: "statistical",
        title: "A larger marketing expense",
        description:
          "Studio North is worth checking against the original invoice. An unusual amount is a review signal, not evidence of fraud.",
        metric: "$1,250",
        vendor: "Studio North",
        amount: 1250,
        z_score: 2.8,
        category: "Marketing/Ads",
        related_line_item_ids: ["sample-7"],
      },
    ],
    pass2: null,
  };
}

export function correctSample(
  data: DashboardData,
  id: string,
  category: string,
): DashboardData {
  const line_items = data.line_items.map((r) =>
    r.id === id
      ? { ...r, category, category_origin: "user", confidence: null }
      : r,
  );
  const total = line_items.reduce((s, r) => s + Number(r.amount), 0);
  const category_stats = [
    ...new Set(line_items.map((r) => r.category ?? "Misc")),
  ].map((name, i) => {
    const rows = line_items.filter((r) => r.category === name);
    const sum = rows.reduce((s, r) => s + Number(r.amount), 0);
    return {
      id: `sample-cat-${i}`,
      category: name,
      upload_id: "sample",
      computed_at: "2026-09-30",
      total_spend_period: sum,
      total_spend_alltime: sum,
      mean_amount: sum / rows.length,
      median_amount: null,
      std_dev: null,
      rolling_avg_5: sum,
      rolling_avg_alltime: sum,
      pct_of_total_spend: (sum / total) * 100,
      trend_direction: "stable" as const,
    };
  });
  return { ...data, line_items, category_stats };
}
