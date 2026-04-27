'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
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
  onDelete: (id: string) => Promise<void>;
}

export default function UploadHistory({ uploads, activeUploadId, onSelect, onDelete }: Props) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmingId(id);
  };

  const handleConfirm = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmingId(null);
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  };

  const handleCancelConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmingId(null);
  };

  if (uploads.length === 0) {
    return (
      <div className="ei-card-section rounded-xl p-6">
        <h3 className="font-semibold text-gray-800 mb-3">Upload History</h3>
        <p className="text-sm text-gray-400">No uploads yet. Drop a file to get started.</p>
      </div>
    );
  }

  return (
    <div className="ei-card-section rounded-xl p-6">
      <h3 className="font-semibold text-gray-800 mb-3">Upload History</h3>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {uploads.map((upload) => {
          const isActive = upload.id === activeUploadId;
          const isDeleting = deletingId === upload.id;
          const isConfirming = confirmingId === upload.id;
          const scoreColor =
            upload.health_score == null
              ? 'text-gray-400'
              : upload.health_score >= 8
                ? 'text-emerald-600'
                : upload.health_score >= 5
                  ? 'text-amber-600'
                  : 'text-red-600';

          return (
            <div
              key={upload.id}
              onClick={() => !isDeleting && onSelect(upload.id)}
              className={`group w-full text-left px-3 py-3 rounded-lg border transition-all cursor-pointer ${
                isDeleting
                  ? 'opacity-40 pointer-events-none border-gray-100 bg-gray-50'
                  : isActive
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-100 bg-gray-50 hover:border-blue-200 hover:bg-blue-50/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{upload.filename}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(upload.uploaded_at)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    {upload.total_amount != null && (
                      <p className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
                        {formatCurrency(Number(upload.total_amount))}
                      </p>
                    )}
                    {upload.health_score != null && (
                      <p className={`text-xs font-medium ${scoreColor}`} style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>{upload.health_score}/10</p>
                    )}
                  </div>

                  {/* Delete controls */}
                  {isConfirming ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleConfirm(e, upload.id)}
                        className="px-2 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={handleCancelConfirm}
                        className="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => handleDeleteClick(e, upload.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                      title="Delete upload"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-1.5">
                <StatusBadge status={upload.pass1_status} label="P1" />
                <StatusBadge status={upload.pass2_status} label="AI" />
              </div>
            </div>
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
