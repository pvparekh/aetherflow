'use client';

import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import { getCategoryColor, formatCurrency } from '@/lib/expense-intel/ui-helpers';
import type { CategoryStats } from '@/lib/expense-intel/types';

interface HistoryPoint {
  uploaded_at: string;
  total: number;
}

interface CategoryHistory {
  category: string;
  points: HistoryPoint[];
}

interface Props {
  categoryStats: CategoryStats[];
  categoryHistory: CategoryHistory[];
}

export default function RollingAvgChart({ categoryStats, categoryHistory }: Props) {
  const categories = useMemo(() => categoryStats.map((s) => s.category), [categoryStats]);
  const [visible, setVisible] = useState<Set<string>>(new Set(categories));

  const toggleCategory = (cat: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  // Build time-series data: merge historical points + current period
  const currentStatMap = useMemo(() => {
    const m = new Map<string, CategoryStats>();
    for (const s of categoryStats) m.set(s.category, s);
    return m;
  }, [categoryStats]);

  const chartData = useMemo(() => {
    // Collect all historical periods (sorted ascending)
    const periodSet = new Set<string>();
    for (const h of categoryHistory) {
      for (const p of h.points) periodSet.add(p.uploaded_at);
    }
    const periods = Array.from(periodSet).sort();
    periods.push('Current');

    return periods.map((period) => {
      const point: Record<string, string | number> = { period: formatPeriod(period) };
      for (const cat of categories) {
        if (period === 'Current') {
          point[cat] = Number(currentStatMap.get(cat)?.total_spend_period ?? 0);
        } else {
          const hist = categoryHistory.find((h) => h.category === cat);
          const hp = hist?.points.find((p) => p.uploaded_at === period);
          point[cat] = hp?.total ?? 0;
        }
      }
      return point;
    });
  }, [categoryHistory, categories, currentStatMap]);

  // ±1σ bands per category based on rolling stats
  const bands = useMemo(() => {
    return categoryStats
      .filter((s) => visible.has(s.category))
      .map((s) => ({
        category: s.category,
        y1: Math.max(0, Number(s.rolling_avg_5 ?? 0) - Number(s.std_dev ?? 0)),
        y2: Number(s.rolling_avg_5 ?? 0) + Number(s.std_dev ?? 0),
      }));
  }, [categoryStats, visible]);

  if (chartData.length < 2) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 h-full flex flex-col">
        <h3 className="font-semibold text-gray-800 mb-2">Rolling Average Trend</h3>
        <p className="text-sm text-gray-400 mt-auto mb-auto text-center">
          Upload more reports to see trends over time.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Rolling Average Trend</h3>
        <span className="text-xs text-gray-400">Shaded band = rolling avg ±1σ</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => toggleCategory(cat)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              visible.has(cat)
                ? 'border-transparent text-white'
                : 'border-gray-300 text-gray-500 bg-white'
            }`}
            style={visible.has(cat) ? { backgroundColor: getCategoryColor(cat) } : {}}
          >
            {cat}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="period" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-gray-600">{v}</span>} />

          {/* ±1σ reference bands */}
          {bands.map((b) => (
            <ReferenceArea
              key={`band-${b.category}`}
              y1={b.y1}
              y2={b.y2}
              fill={getCategoryColor(b.category)}
              fillOpacity={0.08}
            />
          ))}

          {/* Lines per visible category */}
          {categories
            .filter((cat) => visible.has(cat))
            .map((cat) => (
              <Line
                key={cat}
                type="monotone"
                dataKey={cat}
                stroke={getCategoryColor(cat)}
                strokeWidth={2}
                dot={{ r: 3, fill: getCategoryColor(cat) }}
                activeDot={{ r: 5 }}
              />
            ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatPeriod(dateStr: string): string {
  if (dateStr === 'Current') return 'Current';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
