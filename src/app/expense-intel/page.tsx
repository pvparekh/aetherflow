'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import UploadZone from '@/components/expense-intel/UploadZone';
import SummaryCards from '@/components/expense-intel/SummaryCards';
import CategoryDonut from '@/components/expense-intel/CategoryDonut';
import RollingAvgChart from '@/components/expense-intel/RollingAvgChart';
import BarComparison from '@/components/expense-intel/BarComparison';
import AnomalyFeed from '@/components/expense-intel/AnomalyFeed';
import AIInsightsPanel from '@/components/expense-intel/AIInsightsPanel';
import VendorsTable from '@/components/expense-intel/VendorsTable';
import UploadHistory from '@/components/expense-intel/UploadHistory';
import type { Upload, LineItem, CategoryStats, Vendor, Flag, Pass2Result } from '@/lib/expense-intel/types';

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

interface CategoryHistoryPoint {
  uploaded_at: string;
  total: number;
}

interface DashboardData {
  upload: Upload;
  line_items: LineItem[];
  category_stats: CategoryStats[];
  category_history: { category: string; points: CategoryHistoryPoint[] }[];
  vendors: Vendor[];
  flags: Flag[];
  pass2: Pass2Result | null;
}

export default function ExpenseIntelPage() {
  const router = useRouter();
  const [uploads, setUploads] = useState<UploadListItem[]>([]);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [resolvedItems, setResolvedItems] = useState<Record<string, 'expected' | 'investigate'>>({});

  const fetchUploads = useCallback(async () => {
    const res = await fetch('/api/expense-intel/uploads');
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setUploads(data.uploads ?? []);
  }, [router]);

  const loadDashboard = useCallback(async (uploadId: string) => {
    setLoadingDashboard(true);
    setSelectedCategory(null);
    try {
      const res = await fetch(`/api/expense-intel/dashboard/${uploadId}`);
      if (!res.ok) return;
      const data: DashboardData = await res.json();
      setDashboardData(data);
      setActiveUploadId(uploadId);

      // Pre-populate resolved items from existing user_resolution values
      const resolved: Record<string, 'expected' | 'investigate'> = {};
      for (const item of data.line_items) {
        if (item.user_resolution) {
          resolved[item.id] = item.user_resolution;
        }
      }
      setResolvedItems(resolved);
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    fetchUploads().then(() => {
      // Auto-load most recent upload if available
    });
  }, [fetchUploads]);

  // Auto-select most recent upload once list loads
  useEffect(() => {
    if (uploads.length > 0 && !activeUploadId) {
      loadDashboard(uploads[0].id);
    }
  }, [uploads, activeUploadId, loadDashboard]);

  const handleUploadComplete = async (uploadId: string) => {
    await fetchUploads();
    await loadDashboard(uploadId);
  };

  const handleResolve = async (lineItemId: string, resolution: 'expected' | 'investigate' | null) => {
    // Optimistic update
    setResolvedItems((prev) => {
      const next = { ...prev };
      if (resolution === null) {
        delete next[lineItemId];
      } else {
        next[lineItemId] = resolution;
      }
      return next;
    });

    await fetch('/api/expense-intel/resolve', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line_item_id: lineItemId, resolution }),
    });
  };

  const handlePass2Complete = (result: Pass2Result) => {
    setDashboardData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pass2: result,
        upload: { ...prev.upload, health_score: result.health_score, pass2_status: 'complete' },
      };
    });
    // Update upload list health score
    setUploads((prev) =>
      prev.map((u) =>
        u.id === activeUploadId
          ? { ...u, health_score: result.health_score, pass2_status: 'complete' }
          : u
      )
    );
  };

  const exportCSV = () => {
    if (!dashboardData) return;
    const header =
      'Vendor,Amount,Date,Category,Subcategory,Z-Score,Anomaly Severity,Is Duplicate,Is Round Number,Is First-Time,Resolution\n';
    const rows = dashboardData.line_items
      .map(
        (i) =>
          `"${i.vendor ?? ''}",${i.amount ?? 0},"${i.transaction_date ?? ''}","${i.category ?? ''}","${i.subcategory ?? ''}",${i.z_score ?? ''},${i.anomaly_severity},${i.is_possible_duplicate},${i.is_round_number},${i.is_first_time_vendor},"${i.user_resolution ?? ''}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense-intel-${dashboardData.upload.filename.replace(/\.[^/.]+$/, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const criticalFlags = dashboardData?.flags.filter((f) => f.severity === 'critical').length ?? 0;
  const activeUploadInfo = uploads.find((u) => u.id === activeUploadId);

  return (
    <Layout>
      <main className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Expense Intelligence</h1>
              <p className="text-gray-500 text-sm mt-1">
                Upload expense reports for AI-powered categorization, anomaly detection, and insights.
              </p>
            </div>
            {dashboardData && (
              <button
                onClick={exportCSV}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                Export CSV
              </button>
            )}
          </div>

          {/* Upload zone + history */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <UploadZone onUploadComplete={handleUploadComplete} />
            </div>
            <div>
              <UploadHistory
                uploads={uploads}
                activeUploadId={activeUploadId}
                onSelect={loadDashboard}
              />
            </div>
          </div>

          {/* Dashboard panels */}
          {loadingDashboard && (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
              Loading dashboard…
            </div>
          )}

          {dashboardData && !loadingDashboard && (
            <>
              {/* Upload label */}
              {activeUploadInfo && (
                <p className="text-sm text-gray-500">
                  Showing:{' '}
                  <span className="font-medium text-gray-700">{activeUploadInfo.filename}</span>
                </p>
              )}

              {/* Summary cards */}
              <SummaryCards
                upload={dashboardData.upload}
                categoryStats={dashboardData.category_stats}
                criticalFlags={criticalFlags}
              />

              {/* Donut + rolling avg */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CategoryDonut
                  stats={dashboardData.category_stats}
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                />
                <RollingAvgChart
                  categoryStats={dashboardData.category_stats}
                  categoryHistory={dashboardData.category_history}
                />
              </div>

              {/* Bar comparison */}
              <BarComparison
                categoryStats={dashboardData.category_stats}
                selectedCategory={selectedCategory}
              />

              {/* Anomaly feed */}
              <AnomalyFeed
                flags={dashboardData.flags}
                selectedCategory={selectedCategory}
                resolvedItems={resolvedItems}
                onResolve={handleResolve}
              />

              {/* AI insights */}
              <AIInsightsPanel
                pass2={dashboardData.pass2}
                pass2Status={dashboardData.upload.pass2_status}
                uploadId={dashboardData.upload.id}
                onPass2Complete={handlePass2Complete}
              />

              {/* Vendors table */}
              <VendorsTable
                vendors={dashboardData.vendors}
                selectedCategory={selectedCategory}
              />

              {/* Export button (bottom) */}
              <div className="flex justify-end pb-4">
                <button
                  onClick={exportCSV}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Export Line Items as CSV
                </button>
              </div>
            </>
          )}

          {!dashboardData && !loadingDashboard && uploads.length === 0 && (
            <div className="text-center py-20 text-gray-400">
              <p className="text-lg font-medium">No expense reports yet</p>
              <p className="text-sm mt-1">Upload a .csv or .txt file above to get started.</p>
            </div>
          )}
        </div>
      </main>
    </Layout>
  );
}
