'use client';

import { useState, useMemo } from 'react';
import { SEVERITY_STYLES, formatCurrency } from '@/lib/expense-intel/ui-helpers';
import type { Flag } from '@/lib/expense-intel/types';

interface Props {
  flags: Flag[];
  selectedCategory: string | null;
  resolvedItems: Record<string, 'expected' | 'investigate'>;
  onResolve: (lineItemId: string, resolution: 'expected' | 'investigate' | null) => void;
}

export default function AnomalyFeed({ flags, selectedCategory, resolvedItems, onResolve }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!selectedCategory) return flags;
    return flags.filter((f) => f.category === selectedCategory);
  }, [flags, selectedCategory]);

  if (filtered.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="font-semibold text-gray-800 mb-2">Anomaly Feed</h3>
        <p className="text-sm text-gray-400">
          {selectedCategory ? `No flags in ${selectedCategory}.` : 'No anomalies detected — spending looks normal.'}
        </p>
      </div>
    );
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const counts = { critical: 0, warning: 0, info: 0, success: 0 };
  for (const f of filtered) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-semibold text-gray-800">
          Anomaly Feed{selectedCategory ? ` — ${selectedCategory}` : ''}
        </h3>
        <div className="flex gap-2">
          {counts.critical > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_STYLES.critical.badge}`}>
              {counts.critical} critical
            </span>
          )}
          {counts.warning > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_STYLES.warning.badge}`}>
              {counts.warning} warning
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((flag, idx) => {
          const styles = SEVERITY_STYLES[flag.severity];
          const itemId = flag.related_line_item_ids[0];
          const resolution = itemId ? resolvedItems[itemId] : undefined;
          const key = `${flag.title}-${idx}`;
          const isExpanded = expanded.has(key);

          return (
            <div
              key={key}
              className={`${styles.bg} ${styles.border} border rounded-lg p-4 transition-all`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className={`flex-shrink-0 w-5 h-5 rounded-full ${styles.dot} flex items-center justify-center text-white text-xs font-bold mt-0.5`}>
                    {styles.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${styles.text}`}>{flag.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles.badge}`}>
                        {flag.severity}
                      </span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {flag.category}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1 font-medium">{flag.metric}</p>
                    {isExpanded && (
                      <p className="text-sm text-gray-600 mt-1">{flag.description}</p>
                    )}
                    <button
                      onClick={() => toggleExpand(key)}
                      className="text-xs text-gray-400 hover:text-gray-600 mt-1"
                    >
                      {isExpanded ? 'Show less' : 'Show more'}
                    </button>
                  </div>
                </div>

                {itemId && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => onResolve(itemId, resolution === 'expected' ? null : 'expected')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        resolution === 'expected'
                          ? 'bg-green-100 text-green-700 border-green-200'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-green-300 hover:text-green-700'
                      }`}
                    >
                      Expected
                    </button>
                    <button
                      onClick={() => onResolve(itemId, resolution === 'investigate' ? null : 'investigate')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        resolution === 'investigate'
                          ? 'bg-orange-100 text-orange-700 border-orange-200'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-700'
                      }`}
                    >
                      Investigate
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
