'use client';

import { motion } from 'framer-motion';
import { formatCurrency } from '@/lib/expense-intel/ui-helpers';
import type { Upload, CategoryStats } from '@/lib/expense-intel/types';

interface Props {
  upload: Upload;
  categoryStats: CategoryStats[];
  anomalyCount: number;
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

export default function SummaryCards({ upload, categoryStats, anomalyCount }: Props) {
  void categoryStats;

  const scoreBorderClass =
    upload.health_score == null
      ? 'border-l-gray-300'
      : upload.health_score >= 8
        ? 'border-l-emerald-500'
        : upload.health_score >= 5
          ? 'border-l-amber-500'
          : 'border-l-red-500';

  const scoreValueClass =
    upload.health_score == null
      ? 'text-gray-400'
      : upload.health_score >= 8
        ? 'text-emerald-600'
        : upload.health_score >= 5
          ? 'text-amber-600'
          : 'text-red-600';

  const anomalyBorderClass = anomalyCount === 0 ? 'border-l-emerald-500' : 'border-l-red-500';
  const anomalyValueClass =
    anomalyCount === 0
      ? 'text-emerald-600'
      : anomalyCount <= 3
        ? 'text-amber-600'
        : 'text-red-600';

  return (
    <motion.div
      className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item}>
        <Card
          label="Total Spend"
          value={formatCurrency(Number(upload.total_amount ?? 0))}
          leftBorderClass="border-l-blue-500"
        />
      </motion.div>
      <motion.div variants={item}>
        <Card
          label="Line Items"
          value={String(upload.line_item_count ?? 0)}
          leftBorderClass="border-l-purple-500"
        />
      </motion.div>
      <motion.div variants={item}>
        <Card
          label="Health Score"
          value={upload.health_score != null ? `${upload.health_score}/10` : '—'}
          sub={
            upload.health_score == null
              ? 'Generate AI Insights'
              : upload.health_score >= 8
                ? 'Excellent spend discipline'
                : upload.health_score >= 5
                  ? 'Needs attention'
                  : 'Critical issues detected'
          }
          leftBorderClass={scoreBorderClass}
          valueClass={scoreValueClass}
        />
      </motion.div>
      <motion.div variants={item}>
        <Card
          label="Anomalies Flagged"
          value={String(anomalyCount)}
          sub={
            anomalyCount === 0
              ? 'Clean report'
              : anomalyCount === 1
                ? '1 item to review'
                : `${anomalyCount} items to review`
          }
          leftBorderClass={anomalyBorderClass}
          valueClass={anomalyValueClass}
        />
      </motion.div>
    </motion.div>
  );
}

function Card({
  label,
  value,
  sub,
  leftBorderClass,
  valueClass = 'text-gray-900',
}: {
  label: string;
  value: string;
  sub?: string;
  leftBorderClass: string;
  valueClass?: string;
}) {
  return (
    <div
      className={`bg-white rounded-xl p-5 border border-gray-200 border-l-4 ${leftBorderClass} shadow-sm hover:shadow-md transition-shadow`}
    >
      <p className="text-xs font-medium uppercase tracking-widest text-gray-400">{label}</p>
      <p
        className={`text-3xl font-bold mt-2 truncate ${valueClass}`}
        style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
      >
        {value}
      </p>
      {sub && <p className="text-xs mt-1 truncate text-gray-500">{sub}</p>}
    </div>
  );
}
