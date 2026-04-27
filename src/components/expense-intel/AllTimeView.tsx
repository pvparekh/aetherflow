'use client';

import { useEffect, useState } from 'react';
import { formatCurrency, formatDate, getCategoryColor } from '@/lib/expense-intel/ui-helpers';
import TrendChart from './TrendChart';

interface CategoryTotal {
  category: string;
  total_spend_alltime: number;
  rolling_avg_5: number;
  std_dev: number;
  trend_direction: string;
}

interface TopVendor {
  id?: string;
  vendor_name: string;
  total_spend: number;
  total_occurrences: number;
  avg_amount: number | null;
  primary_category: string | null;
  recurrence_tier: string;
  last_seen_at?: string | null;
  first_seen_at?: string | null;
}

interface CategoryHistoryPoint {
  uploaded_at: string;
  total: number;
}

interface AggregateData {
  category_totals: CategoryTotal[];
  top_vendors: TopVendor[];
  category_history: { category: string; points: CategoryHistoryPoint[] }[];
  total_anomalies: number;
  avg_health_score: number | null;
  total_uploads: number;
}

const TIER_STYLES: Record<string, string> = {
  core: 'bg-green-100 text-green-700',
  regular: 'bg-blue-100 text-blue-700',
  occasional: 'bg-gray-100 text-gray-600',
  one_time: 'bg-orange-100 text-orange-700',
};

export default function AllTimeView() {
  const [data, setData] = useState<AggregateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/expense-intel/aggregate')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load aggregate data'); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
        Loading all-time data…
      </div>
    );
  }

  if (error) return <div className="text-center py-20 text-red-500">{error}</div>;

  if (!data || data.total_uploads === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-lg font-medium">No data yet</p>
        <p className="text-sm mt-1">Upload at least one expense file to see all-time stats.</p>
      </div>
    );
  }

  const totalSpend = data.category_totals.reduce(
    (sum, c) => sum + Number(c.total_spend_alltime ?? 0),
    0
  );

  const scoreColor =
    data.avg_health_score == null
      ? 'text-gray-400'
      : data.avg_health_score >= 8
        ? 'text-green-600'
        : data.avg_health_score >= 5
          ? 'text-yellow-600'
          : 'text-red-600';

  return (
    <div className="space-y-6">
      {/* Section 1: Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="All-Time Spend" value={formatCurrency(totalSpend)} />
        <SummaryCard label="Total Uploads" value={String(data.total_uploads)} />
        <SummaryCard
          label="Avg Health Score"
          value={data.avg_health_score != null ? `${data.avg_health_score}/10` : '—'}
          valueClass={scoreColor}
        />
        <SummaryCard label="Total Anomalies" value={String(data.total_anomalies)} />
      </div>

      {/* Section 2: Category totals */}
      {data.category_totals.length > 0 && (
        <div className="ei-card-section rounded-xl p-6">
          <h3 className="font-semibold text-gray-800 mb-5">All-Time Spend by Category</h3>
          <div className="space-y-4">
            {data.category_totals.map((cat) => {
              const pct = totalSpend > 0 ? (Number(cat.total_spend_alltime ?? 0) / totalSpend) * 100 : 0;
              return (
                <div key={cat.category}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getCategoryColor(cat.category) }}
                      />
                      <span className="text-sm font-medium text-gray-700">{cat.category}</span>
                      {cat.trend_direction === 'up' && (
                        <span className="text-xs text-red-500 font-semibold">↑ trending</span>
                      )}
                      {cat.trend_direction === 'down' && (
                        <span className="text-xs text-green-500 font-semibold">↓ trending</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{pct.toFixed(1)}%</span>
                      <span className="text-sm font-semibold text-gray-800 w-24 text-right">
                        {formatCurrency(Number(cat.total_spend_alltime ?? 0))}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: getCategoryColor(cat.category) }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Rolling avg/upload: {formatCurrency(Number(cat.rolling_avg_5 ?? 0))}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 3: Trend chart */}
      <TrendChart
        categoryHistory={data.category_history}
        categoryBands={data.category_totals.map((c) => ({
          category: c.category,
          rolling_avg_5: Number(c.rolling_avg_5 ?? 0),
          std_dev: Number(c.std_dev ?? 0),
        }))}
      />

      {/* Section 4: All-time top vendors table */}
      <div className="ei-card-section rounded-xl p-6">
        <h3 className="font-semibold text-gray-800 mb-4">
          All-Time Top Vendors
          <span className="text-xs font-normal text-gray-400 ml-2">by total spend</span>
        </h3>
        {data.top_vendors.length === 0 ? (
          <p className="text-sm text-gray-400">No vendor data yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">#</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Vendor</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Category</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Total Spend</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Occurrences</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Avg Amount</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">First Seen</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Last Seen</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.top_vendors.map((vendor, i) => (
                  <tr key={vendor.vendor_name} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 text-xs font-bold text-gray-300">{i + 1}</td>
                    <td className="py-3 font-medium text-gray-800">{vendor.vendor_name}</td>
                    <td className="py-3 text-gray-500">{vendor.primary_category ?? '—'}</td>
                    <td className="py-3 font-semibold text-gray-800">
                      {formatCurrency(Number(vendor.total_spend ?? 0))}
                    </td>
                    <td className="py-3 text-gray-600">{vendor.total_occurrences ?? 0}</td>
                    <td className="py-3 text-gray-600">
                      {vendor.avg_amount ? formatCurrency(Number(vendor.avg_amount)) : '—'}
                    </td>
                    <td className="py-3 text-gray-500 text-xs">
                      {vendor.first_seen_at ? formatDate(vendor.first_seen_at) : '—'}
                    </td>
                    <td className="py-3 text-gray-500 text-xs">
                      {vendor.last_seen_at ? formatDate(vendor.last_seen_at) : '—'}
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          TIER_STYLES[vendor.recurrence_tier] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {vendor.recurrence_tier.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  valueClass = 'text-gray-800',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="ei-card rounded-xl p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p
        className={`text-2xl font-bold mt-1 ${valueClass}`}
        style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
      >
        {value}
      </p>
    </div>
  );
}
