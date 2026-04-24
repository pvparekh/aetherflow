'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getCategoryColor, formatCurrency } from '@/lib/expense-intel/ui-helpers';
import type { CategoryStats } from '@/lib/expense-intel/types';

interface Props {
  stats: CategoryStats[];
  selectedCategory: string | null;
  onSelectCategory: (cat: string | null) => void;
}

export default function CategoryDonut({ stats, selectedCategory, onSelectCategory }: Props) {
  const data = [...stats]
    .filter((s) => Number(s.total_spend_period ?? 0) > 0)
    .map((s) => ({
      name: s.category,
      value: Number(s.total_spend_period),
      pct: Number(s.pct_of_total_spend ?? 0),
    }))
    .sort((a, b) => b.value - a.value);

  const handleClick = (entry: { name?: string }) => {
    if (!entry.name) return;
    onSelectCategory(selectedCategory === entry.name ? null : entry.name);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 h-full">
      <h3 className="font-semibold text-gray-800 mb-4">Spend by Category</h3>
      {data.length === 0 ? (
        <p className="text-gray-400 text-sm text-center mt-10">No category data</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={2}
                dataKey="value"
                onClick={handleClick}
                cursor="pointer"
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={getCategoryColor(entry.name)}
                    opacity={selectedCategory && selectedCategory !== entry.name ? 0.35 : 1}
                    stroke={selectedCategory === entry.name ? '#1e293b' : 'transparent'}
                    strokeWidth={selectedCategory === entry.name ? 2 : 0}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Spend']}
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
                formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
          {selectedCategory && (
            <button
              onClick={() => onSelectCategory(null)}
              className="block mx-auto mt-1 text-xs text-blue-600 hover:underline"
            >
              Clear filter: {selectedCategory}
            </button>
          )}
        </>
      )}
    </div>
  );
}
