'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { getCategoryColor, formatCurrency } from '@/lib/expense-intel/ui-helpers';
import type { CategoryStats } from '@/lib/expense-intel/types';

interface Props {
  categoryStats: CategoryStats[];
  selectedCategory: string | null;
}

export default function BarComparison({ categoryStats, selectedCategory }: Props) {
  const data = useMemo(() => {
    const filtered = selectedCategory
      ? categoryStats.filter((s) => s.category === selectedCategory)
      : categoryStats;

    return filtered
      .filter((s) => Number(s.total_spend_period ?? 0) > 0)
      .map((s) => ({
        category: s.category,
        'This Period': Number(s.total_spend_period ?? 0),
        'Category Average': Number(s.rolling_avg_5 ?? 0),
        isAnomalous:
          s.trend_direction === 'up' &&
          Number(s.total_spend_period) > Number(s.rolling_avg_5 ?? 0) * 1.25,
      }))
      .sort((a, b) => b['This Period'] - a['This Period']);
  }, [categoryStats, selectedCategory]);

  if (data.length === 0) {
    return null;
  }

  return (
    <div className="ei-card-section rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">
          Current vs Rolling Average{selectedCategory ? `: ${selectedCategory}` : ''}
        </h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} barGap={4} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
          <XAxis
            dataKey="category"
            tick={{ fontSize: 11, fontFamily: 'var(--font-geist-mono), monospace', fill: '#9CA3AF' }}
            interval={0}
            angle={-15}
            textAnchor="end"
            height={50}
          />
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
            iconType="square"
            iconSize={10}
            formatter={(v) => (
              <span className={`text-xs ${v === 'Category Average' ? 'text-gray-700 font-medium' : 'text-gray-600'}`}>
                {v}
              </span>
            )}
          />

          <Bar dataKey="This Period" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.category}
                fill={entry.isAnomalous ? '#ef4444' : getCategoryColor(entry.category)}
              />
            ))}
          </Bar>
          <Bar dataKey="Category Average" fill="#94A3B8" radius={[4, 4, 0, 0]} stroke="#64748B" strokeWidth={1} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
