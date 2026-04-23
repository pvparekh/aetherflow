'use client';

import { formatCurrency } from '@/lib/expense-intel/ui-helpers';
import type { Upload, CategoryStats } from '@/lib/expense-intel/types';

interface Props {
  upload: Upload;
  categoryStats: CategoryStats[];
  anomalyCount: number;
}

export default function SummaryCards({ upload, categoryStats, anomalyCount }: Props) {
  void categoryStats; // available for future expansion

  const scoreColor =
    upload.health_score == null
      ? 'from-gray-400 to-gray-500'
      : upload.health_score >= 8
        ? 'from-green-500 to-green-600'
        : upload.health_score >= 5
          ? 'from-yellow-500 to-yellow-600'
          : 'from-red-500 to-red-600';

  const anomalyGradient =
    anomalyCount === 0
      ? 'from-green-500 to-green-600'
      : anomalyCount <= 3
        ? 'from-yellow-500 to-yellow-600'
        : 'from-red-500 to-red-600';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        label="Total Spend"
        value={formatCurrency(Number(upload.total_amount ?? 0))}
        gradient="from-blue-500 to-blue-600"
      />
      <Card
        label="Line Items"
        value={String(upload.line_item_count ?? 0)}
        gradient="from-indigo-500 to-indigo-600"
      />
      <Card
        label="Health Score"
        value={upload.health_score != null ? `${upload.health_score}/10` : 'Pending'}
        sub={
          upload.health_score == null
            ? 'Click Generate AI Insights'
            : upload.health_score >= 8
              ? 'Excellent spend discipline'
              : upload.health_score >= 5
                ? 'Needs attention'
                : 'Critical issues detected'
        }
        gradient={scoreColor}
      />
      <Card
        label="Anomalies Flagged"
        value={String(anomalyCount)}
        sub={anomalyCount === 0 ? 'Clean report' : anomalyCount === 1 ? '1 item to review' : `${anomalyCount} items to review`}
        gradient={anomalyGradient}
      />
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  gradient,
}: {
  label: string;
  value: string;
  sub?: string;
  gradient: string;
}) {
  return (
    <div className={`bg-gradient-to-br ${gradient} text-white rounded-xl p-5 shadow`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1 truncate">{value}</p>
      {sub && <p className="text-xs opacity-80 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}
