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

  const scoreBorderColor =
    upload.health_score == null
      ? '#D1D5DB'
      : upload.health_score >= 8
        ? '#10B981'
        : upload.health_score >= 5
          ? '#F59E0B'
          : '#EF4444';

  const scoreValueClass =
    upload.health_score == null
      ? 'text-gray-400'
      : upload.health_score >= 8
        ? 'text-emerald-600'
        : upload.health_score >= 5
          ? 'text-amber-600'
          : 'text-red-600';

  const anomalyBorderColor = anomalyCount === 0 ? '#10B981' : '#EF4444';
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
        <Card label="Total Spend" value={formatCurrency(Number(upload.total_amount ?? 0))} leftBorderColor="#3B82F6" />
      </motion.div>
      <motion.div variants={item}>
        <Card label="Line Items" value={String(upload.line_item_count ?? 0)} leftBorderColor="#A855F7" />
      </motion.div>
      <motion.div variants={item}>
        <Card
          label="Health Score"
          value={upload.health_score != null ? `${upload.health_score}/10` : '-'}
          sub={
            upload.health_score == null
              ? 'Generate AI Insights'
              : upload.health_score >= 8
                ? 'Excellent spend discipline'
                : upload.health_score >= 5
                  ? 'Needs attention'
                  : 'Critical issues detected'
          }
          leftBorderColor={scoreBorderColor}
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
          leftBorderColor={anomalyBorderColor}
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
  leftBorderColor,
  valueClass = 'text-gray-900',
}: {
  label: string;
  value: string;
  sub?: string;
  leftBorderColor: string;
  valueClass?: string;
}) {
  return (
    <div
      className="ei-card-warm rounded-xl p-5"
      style={{ borderLeftColor: leftBorderColor }}
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
