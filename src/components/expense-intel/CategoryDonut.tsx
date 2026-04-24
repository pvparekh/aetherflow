'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, Sector } from 'recharts';
import { getCategoryColor, formatCurrency } from '@/lib/expense-intel/ui-helpers';
import type { CategoryStats } from '@/lib/expense-intel/types';

interface Props {
  stats: CategoryStats[];
  selectedCategory: string | null;
  onSelectCategory: (cat: string | null) => void;
}

interface DataPoint {
  name: string;
  value: number;
  pct: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DataPoint }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const { name, value, pct } = payload[0].payload;
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-md" style={{ padding: 12 }}>
      <p className="font-medium text-gray-800 text-sm mb-1">{name}</p>
      <p
        className="text-gray-900 font-bold text-lg"
        style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
      >
        {formatCurrency(value)}
      </p>
      <p className="font-bold text-lg" style={{ color: getCategoryColor(name) }}>
        {pct.toFixed(1)}%
      </p>
    </div>
  );
}

function ActiveShape(props: {
  cx: number; cy: number; innerRadius: number; outerRadius: number;
  startAngle: number; endAngle: number; fill: string; opacity?: number;
}) {
  return (
    <Sector
      cx={props.cx}
      cy={props.cy}
      innerRadius={props.innerRadius}
      outerRadius={props.outerRadius + 6}
      startAngle={props.startAngle}
      endAngle={props.endAngle}
      fill={props.fill}
      opacity={props.opacity}
    />
  );
}

export default function CategoryDonut({ stats, selectedCategory, onSelectCategory }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const data: DataPoint[] = [...stats]
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
    <div className="ei-card-section rounded-xl p-6 h-full">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-800">Spend by Category</h3>
        <p className="text-xs text-gray-400 mt-0.5">Click a slice to filter the dashboard by category</p>
      </div>
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                {...({ activeIndex, activeShape: (p: any) => <ActiveShape {...p} /> } as any)}
                onMouseEnter={(_: unknown, index: number) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(undefined)}
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
              <Tooltip content={(props: unknown) => {
                const p = props as TooltipProps;
                return <CustomTooltip active={p.active} payload={p.payload} />;
              }} />
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
