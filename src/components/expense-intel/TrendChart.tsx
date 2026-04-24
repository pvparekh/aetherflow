'use client';

import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import { getCategoryColor, formatCurrency } from '@/lib/expense-intel/ui-helpers';

interface CategoryHistoryPoint {
  uploaded_at: string;
  total: number;
}

interface CategoryHistory {
  category: string;
  points: CategoryHistoryPoint[];
}

interface CategoryBand {
  category: string;
  rolling_avg_5: number;
  std_dev: number;
}

interface Props {
  categoryHistory: CategoryHistory[];
  categoryBands?: CategoryBand[];
}

function formatAxisDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TrendChart({ categoryHistory, categoryBands = [] }: Props) {
  const categories = useMemo(
    () => categoryHistory.map((h) => h.category),
    [categoryHistory]
  );
  const [visible, setVisible] = useState<Set<string>>(new Set(categories));

  const toggleCategory = (cat: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const chartData = useMemo(() => {
    const periodSet = new Set<string>();
    for (const h of categoryHistory) {
      for (const p of h.points) periodSet.add(p.uploaded_at);
    }
    const periods = Array.from(periodSet).sort();

    return periods.map((period) => {
      const point: Record<string, string | number> = {
        period: formatAxisDate(period),
        _raw: period,
      };
      for (const h of categoryHistory) {
        const hp = h.points.find((p) => p.uploaded_at === period);
        point[h.category] = hp?.total ?? 0;
      }
      return point;
    });
  }, [categoryHistory]);

  const bands = useMemo(() => {
    return categoryBands
      .filter((b) => visible.has(b.category) && b.rolling_avg_5 > 0)
      .map((b) => ({
        category: b.category,
        y1: Math.max(0, b.rolling_avg_5 - b.std_dev),
        y2: b.rolling_avg_5 + b.std_dev,
      }));
  }, [categoryBands, visible]);

  if (chartData.length < 2) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="font-semibold text-gray-800 mb-2">Spend Trend Over Time</h3>
        <p className="text-sm text-gray-400 text-center py-8">
          Upload more reports to see trends over time.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Spend Trend Over Time</h3>
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

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
          <XAxis dataKey="period" tick={{ fontSize: 11, fontFamily: 'var(--font-geist-mono), monospace', fill: '#9CA3AF' }} interval="preserveStartEnd" />
          <YAxis
            tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
            tick={{ fontSize: 11, fontFamily: 'var(--font-geist-mono), monospace', fill: '#9CA3AF' }}
          />
          <Tooltip
            formatter={(v, name) => [formatCurrency(Number(v ?? 0)), String(name)]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              backgroundColor: '#fff',
              border: '1px solid #E5E7EB',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)',
              fontFamily: 'var(--font-geist-mono), monospace',
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(v) => <span className="text-xs text-gray-600">{v}</span>}
          />

          {bands.map((b) => (
            <ReferenceArea
              key={`band-${b.category}`}
              y1={b.y1}
              y2={b.y2}
              fill={getCategoryColor(b.category)}
              fillOpacity={0.08}
            />
          ))}

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
                connectNulls={false}
              />
            ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
