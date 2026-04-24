'use client';

import { formatCurrency, formatDate } from '@/lib/expense-intel/ui-helpers';

interface UploadListItem {
  id: string;
  filename: string;
  uploaded_at: string;
  total_amount: number | null;
  line_item_count: number | null;
  pass1_status: string;
  pass2_status: string;
  health_score: number | null;
}

interface Props {
  uploads: UploadListItem[];
  activeUploadId: string | null;
  onSelect: (id: string) => void;
}

export default function UploadHistory({ uploads, activeUploadId, onSelect }: Props) {
  if (uploads.length === 0) {
    return (
      <div className="ei-card-section rounded-xl p-6">
        <h3 className="font-semibold text-gray-800 mb-3">Upload History</h3>
        <p className="text-sm text-gray-400">No uploads yet — drop a file to get started.</p>
      </div>
    );
  }

  return (
    <div className="ei-card-section rounded-xl p-6">
      <h3 className="font-semibold text-gray-800 mb-3">Upload History</h3>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {uploads.map((upload) => {
          const isActive = upload.id === activeUploadId;
          const scoreColor =
            upload.health_score == null
              ? 'text-gray-400'
              : upload.health_score >= 8
                ? 'text-emerald-600'
                : upload.health_score >= 5
                  ? 'text-amber-600'
                  : 'text-red-600';

          return (
            <button
              key={upload.id}
              onClick={() => onSelect(upload.id)}
              className={`w-full text-left px-3 py-3 rounded-lg border transition-all ${
                isActive
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-100 bg-gray-50 hover:border-blue-200 hover:bg-blue-50/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{upload.filename}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(upload.uploaded_at)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {upload.total_amount != null && (
                    <p className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
                      {formatCurrency(Number(upload.total_amount))}
                    </p>
                  )}
                  {upload.health_score != null && (
                    <p className={`text-xs font-medium ${scoreColor}`} style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>{upload.health_score}/10</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-1.5">
                <StatusBadge status={upload.pass1_status} label="P1" />
                <StatusBadge status={upload.pass2_status} label="AI" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const styles =
    status === 'complete'
      ? 'bg-green-100 text-green-700'
      : status === 'processing'
        ? 'bg-blue-100 text-blue-700'
        : status === 'error'
          ? 'bg-red-100 text-red-700'
          : 'bg-gray-100 text-gray-500';

  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${styles}`}>
      {label}: {status}
    </span>
  );
}
