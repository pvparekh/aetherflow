'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Trash2 } from 'lucide-react';
import { SEVERITY_STYLES, formatCurrency, formatDate } from '@/lib/expense-intel/ui-helpers';
import type { Flag, FlagType, DuplicateContext } from '@/lib/expense-intel/types';

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

const INITIAL_COUNT = 3;

export default function AnomalyFeed({ flags, selectedCategory, resolvedItems, onResolve }: Props) {
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [expandedDuplicates, setExpandedDuplicates] = useState<Set<string>>(new Set());
  const [deletedItems, setDeletedItems] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);

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

  useEffect(() => { setShowAll(false); }, [feedFilter, selectedCategory]);

  const counts = useMemo(() => ({
    all:        categoryFiltered.length,
    critical:   categoryFiltered.filter((f) => f.severity === 'critical').length,
    warning:    categoryFiltered.filter((f) => f.severity === 'warning').length,
    duplicate:  categoryFiltered.filter((f) => f.flag_type === 'duplicate').length,
    first_time: categoryFiltered.filter((f) => f.flag_type === 'first_time').length,
  }), [categoryFiltered]);

  const visibleFlags = showAll ? filtered : filtered.slice(0, INITIAL_COUNT);
  const hiddenCount  = Math.max(0, filtered.length - INITIAL_COUNT);

  const deletableCount = categoryFiltered.filter(
    (f) => f.related_line_item_ids[0] && !deletedItems.has(f.related_line_item_ids[0])
  ).length;

  const toggleExpand = (key: string) =>
    setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) { n.delete(key); } else { n.add(key); } return n; });

  const toggleDuplicate = (key: string) =>
    setExpandedDuplicates((prev) => { const n = new Set(prev); if (n.has(key)) { n.delete(key); } else { n.add(key); } return n; });

  const handleDelete = async (lineItemId: string) => {
    setDeletedItems((prev) => new Set(prev).add(lineItemId));
    try {
      const res = await fetch(`/api/expense-intel/anomaly/${lineItemId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('api');
    } catch {
      setDeletedItems((prev) => { const n = new Set(prev); n.delete(lineItemId); return n; });
      setDeleteError('Failed to delete anomaly. Please try again.');
      setTimeout(() => setDeleteError(null), 3000);
    }
  };

  const handleDeleteAll = async () => {
    setDeleteAllLoading(true);
    const toDelete = categoryFiltered
      .map((f) => f.related_line_item_ids[0])
      .filter((id): id is string => !!id && !deletedItems.has(id));

    setDeletedItems((prev) => {
      const n = new Set(prev);
      for (const id of toDelete) n.add(id);
      return n;
    });
    setShowDeleteAllModal(false);

    const results = await Promise.allSettled(
      toDelete.map((id) => fetch(`/api/expense-intel/anomaly/${id}`, { method: 'DELETE' }))
    );

    const failed = toDelete.filter((_, i) =>
      results[i].status === 'rejected' ||
      (results[i].status === 'fulfilled' && !(results[i] as PromiseFulfilledResult<Response>).value.ok)
    );
    if (failed.length > 0) {
      setDeletedItems((prev) => {
        const n = new Set(prev);
        for (const id of failed) n.delete(id);
        return n;
      });
      setDeleteError(`Failed to delete ${failed.length} anomal${failed.length === 1 ? 'y' : 'ies'}. Please try again.`);
      setTimeout(() => setDeleteError(null), 3000);
    }
    setDeleteAllLoading(false);
  };

  return (
    <div className="ei-card-section rounded-xl p-6">
      {/* Delete All confirmation modal */}
      <AnimatePresence>
        {showDeleteAllModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowDeleteAllModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Delete All Anomalies</h3>
                  <p className="text-xs text-gray-500">This cannot be undone</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-5">
                This will permanently remove{' '}
                <span className="font-semibold text-gray-900">
                  {deletableCount} anomal{deletableCount === 1 ? 'y' : 'ies'}
                </span>
                {selectedCategory ? ` in ${selectedCategory}` : ''} from your dashboard.
                The underlying transactions will remain unchanged.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteAllModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAll}
                  disabled={deleteAllLoading}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {deleteAllLoading ? 'Deleting…' : 'Delete All'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2"
          >
            {deleteError}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-semibold text-gray-800">
          Anomaly Feed{selectedCategory ? `: ${selectedCategory}` : ''}
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{categoryFiltered.length} total flags</span>
          {deletableCount > 0 && (
            <button
              onClick={() => setShowDeleteAllModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Delete All
            </button>
          )}
        </div>
      </div>

      {/* Filter pills */}
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
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-gray-100 text-gray-600 border-gray-100 hover:border-gray-300'
              }`}
            >
              {FILTER_LABELS[f]}
              {count > 0 && (
                <span className={`ml-1.5 ${feedFilter === f ? 'text-blue-200' : 'text-gray-400'}`}>
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
            ? 'No anomalies detected. Spending looks normal.'
            : `No ${FILTER_LABELS[feedFilter].toLowerCase()} flags.`}
        </p>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {visibleFlags.map((flag, idx) => {
              const styles     = SEVERITY_STYLES[flag.severity];
              const itemId     = flag.related_line_item_ids[0];
              const resolution = itemId ? resolvedItems[itemId] : undefined;
              const key        = `${flag.flag_type}-${flag.vendor}-${idx}`;
              const isExpanded = expanded.has(key);
              const isResolved = resolution != null;
              const isDupExp   = expandedDuplicates.has(key);
              const isDeleted  = itemId ? deletedItems.has(itemId) : false;

              if (isDeleted) return null;

              return (
                <motion.div
                  key={key}
                  layout
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div
                    className={`border rounded-lg p-4 transition-all ${
                      isResolved
                        ? 'border-gray-100 bg-gray-50'
                        : `${styles.bg} ${styles.border}`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: content — dimmed when resolved */}
                      <div className={`flex items-start gap-3 flex-1 min-w-0 transition-opacity ${isResolved ? 'opacity-40' : ''}`}>
                        <span className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${styles.dot}`} />
                        <div className="flex-1 min-w-0">
                          {/* Title row */}
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
                            <span
                              className="text-sm font-semibold text-gray-900"
                              style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                            >
                              {formatCurrency(flag.amount)}
                            </span>
                            {flag.z_score != null && Math.abs(flag.z_score) > 0.01 && (
                              <span
                                className="text-xs text-gray-400"
                                style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                              >
                                z={flag.z_score.toFixed(2)}
                              </span>
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

                          {/* Duplicate detail expand */}
                          {flag.flag_type === 'duplicate' && (
                            <div className="mt-2">
                              <button
                                onClick={() => toggleDuplicate(key)}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                              >
                                <span>View duplicate</span>
                                <motion.div
                                  animate={{ rotate: isDupExp ? 180 : 0 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </motion.div>
                              </button>

                              <AnimatePresence>
                                {isDupExp && (
                                  <motion.div
                                    key="dup-panel"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.25, ease: 'easeOut' }}
                                    className="overflow-hidden"
                                  >
                                    {flag.duplicate_context ? (
                                      <DuplicateTable context={flag.duplicate_context} />
                                    ) : (
                                      <p className="text-xs text-gray-400 mt-2">
                                        Duplicate data not available for this entry.
                                      </p>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: action buttons — always full opacity */}
                      {itemId && (
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          {resolution === 'expected' ? (
                            <button
                              onClick={() => handleDelete(itemId)}
                              title="Remove this anomaly permanently"
                              className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-all flex items-center gap-1 bg-white text-red-500 border-red-300 hover:bg-red-50"
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </button>
                          ) : (
                            <button
                              onClick={() => onResolve(itemId, 'expected')}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-all bg-white text-gray-600 border-gray-300 hover:border-green-300 hover:text-green-700"
                            >
                              Mark Expected
                            </button>
                          )}
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
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Show more / show less */}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <span>
                {showAll
                  ? 'Show less'
                  : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'anomaly' : 'anomalies'}`}
              </span>
              <motion.div animate={{ rotate: showAll ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown className="w-4 h-4" />
              </motion.div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DuplicateTable({ context }: { context: DuplicateContext }) {
  return (
    <div className="mt-3 bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">File</th>
            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">Date</th>
            <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-blue-50">
            <td className="px-3 py-2 text-gray-700 font-medium max-w-[140px] truncate">{context.this_entry.filename}</td>
            <td className="px-3 py-2 text-gray-600" style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
              {context.this_entry.transaction_date ? formatDate(context.this_entry.transaction_date) : '-'}
            </td>
            <td className="px-3 py-2 text-right text-gray-900 font-medium" style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
              {formatCurrency(context.this_entry.amount)}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 text-gray-700 font-medium max-w-[140px] truncate">{context.match.filename}</td>
            <td className="px-3 py-2 text-gray-600" style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
              {context.match.transaction_date ? formatDate(context.match.transaction_date) : '-'}
            </td>
            <td className="px-3 py-2 text-right text-gray-900 font-medium" style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
              {formatCurrency(context.match.amount)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
