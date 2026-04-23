'use client';

import { useState, useMemo } from 'react';
import { SEVERITY_STYLES, formatCurrency } from '@/lib/expense-intel/ui-helpers';
import type { Flag, FlagType } from '@/lib/expense-intel/types';

type FeedFilter = 'all' | 'critical' | 'warning' | 'duplicate' | 'first_time';

interface Props {
  flags: Flag[];
  selectedCategory: string | null;
  resolvedItems: Record<string, 'expected' | 'investigate'>;
  onResolve: (lineItemId: string, resolution: 'expected' | 'investigate' | null) => void;
}

const FILTER_LABELS: Record<FeedFilter, string> = {
  all: 'All',
  critical: 'Critical',
  warning: 'Warning',
  duplicate: 'Duplicates',
  first_time: 'First-Time Vendors',
};

export default function AnomalyFeed({ flags, selectedCategory, resolvedItems, onResolve }: Props) {
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const categoryFiltered = useMemo(() => {
    if (!selectedCategory) return flags;
    return flags.filter((f) => f.category === selectedCategory);
  }, [flags, selectedCategory]);

  const filtered = useMemo(() => {
    if (feedFilter === 'all') return categoryFiltered;
    if (feedFilter === 'critical') return categoryFiltered.filter((f) => f.severity === 'critical');
    if (feedFilter === 'warning') return categoryFiltered.filter((f) => f.severity === 'warning');
    return categoryFiltered.filter((f) => (f.flag_type as FlagType) === feedFilter);
  }, [categoryFiltered, feedFilter]);

  const counts = useMemo(() => ({
    all: categoryFiltered.length,
    critical: categoryFiltered.filter((f) => f.severity === 'critical').length,
    warning: categoryFiltered.filter((f) => f.severity === 'warning').length,
    duplicate: categoryFiltered.filter((f) => f.flag_type === 'duplicate').length,
    first_time: categoryFiltered.filter((f) => f.flag_type === 'first_time').length,
  }), [categoryFiltered]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-semibold text-gray-800">
          Anomaly Feed{selectedCategory ? ` — ${selectedCategory}` : ''}
        </h3>
        <span className="text-xs text-gray-400">{categoryFiltered.length} total flags</span>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {(Object.keys(FILTER_LABELS) as FeedFilter[]).map((f) => {
          const count = counts[f];
          if (f !== 'all' && count === 0) return null;
          return (
            <button
              key={f}
              onClick={() => setFeedFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                feedFilter === f
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {FILTER_LABELS[f]}
              {count > 0 && (
                <span className={`ml-1.5 ${feedFilter === f ? 'text-gray-300' : 'text-gray-400'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          {categoryFiltered.length === 0
            ? 'No anomalies detected — spending looks normal.'
            : `No ${FILTER_LABELS[feedFilter].toLowerCase()} flags.`}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((flag, idx) => {
            const styles = SEVERITY_STYLES[flag.severity];
            const itemId = flag.related_line_item_ids[0];
            const resolution = itemId ? resolvedItems[itemId] : undefined;
            const key = `${flag.flag_type}-${flag.vendor}-${idx}`;
            const isExpanded = expanded.has(key);
            const isResolved = resolution != null;

            return (
              <div
                key={key}
                className={`border rounded-lg p-4 transition-all ${
                  isResolved
                    ? 'border-gray-100 bg-gray-50 opacity-60'
                    : `${styles.bg} ${styles.border}`
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span
                      className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${styles.dot}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${isResolved ? 'text-gray-500' : styles.text}`}>
                          {flag.title}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles.badge}`}>
                          {flag.severity}
                        </span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {flag.category}
                        </span>
                        {resolution && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            resolution === 'expected'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}>
                            {resolution}
                          </span>
                        )}
                      </div>

                      {/* Vendor + amount row */}
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-sm font-medium text-gray-700">{flag.vendor}</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {formatCurrency(flag.amount)}
                        </span>
                        {flag.z_score != null && Math.abs(flag.z_score) > 0.01 && (
                          <span className="text-xs text-gray-500">z={flag.z_score.toFixed(2)}</span>
                        )}
                      </div>

                      <p className="text-xs text-gray-500 mt-0.5 font-medium">{flag.metric}</p>

                      {isExpanded && (
                        <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{flag.description}</p>
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
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
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
      )}
    </div>
  );
}
