'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import UploadZone from '@/components/expense-intel/UploadZone';
import SummaryCards from '@/components/expense-intel/SummaryCards';
import CategoryDonut from '@/components/expense-intel/CategoryDonut';
import BarComparison from '@/components/expense-intel/BarComparison';
import AnomalyFeed from '@/components/expense-intel/AnomalyFeed';
import AIInsightsPanel from '@/components/expense-intel/AIInsightsPanel';
import VendorsTable from '@/components/expense-intel/VendorsTable';
import UploadHistory from '@/components/expense-intel/UploadHistory';
import AllTimeView from '@/components/expense-intel/AllTimeView';
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
  const [activeTab, setActiveTab] = useState<'upload' | 'alltime'>('upload');

  const fetchUploads = useCallback(async () => {
    const res = await fetch('/api/expense-intel/uploads');
    if (res.status === 401) { router.push('/login'); return; }
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

      const resolved: Record<string, 'expected' | 'investigate'> = {};
      for (const item of data.line_items) {
        if (item.user_resolution) resolved[item.id] = item.user_resolution;
      }
      setResolvedItems(resolved);
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

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
    setResolvedItems((prev) => {
      const next = { ...prev };
      if (resolution === null) delete next[lineItemId];
      else next[lineItemId] = resolution;
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

  const anomalyCount = dashboardData?.line_items.filter((i) => i.is_anomaly).length ?? 0;
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
                AI-powered expense categorization, anomaly detection, and financial insights.
              </p>
            </div>
            {dashboardData && activeTab === 'upload' && (
              <button
                onClick={exportCSV}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                Export CSV
              </button>
            )}
          </div>

          {/* Upload zone + history side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <UploadZone onUploadComplete={handleUploadComplete} />
            </div>
            <div>
              <UploadHistory
                uploads={uploads}
                activeUploadId={activeUploadId}
                onSelect={(id) => { setActiveTab('upload'); loadDashboard(id); }}
              />
            </div>
          </div>

          {/* Tab toggle — only when uploads exist */}
          {uploads.length > 0 && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
              <button
                onClick={() => setActiveTab('upload')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'upload'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Latest Upload
              </button>
              <button
                onClick={() => setActiveTab('alltime')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'alltime'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                All Time
              </button>
            </div>
          )}

          {/* All Time view */}
          {activeTab === 'alltime' && <AllTimeView />}

          {/* Latest Upload view */}
          {activeTab === 'upload' && loadingDashboard && (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
              Loading dashboard…
            </div>
          )}

          {activeTab === 'upload' && dashboardData && !loadingDashboard && (
            <>
              {activeUploadInfo && (
                <p className="text-sm text-gray-500">
                  Viewing:{' '}
                  <span className="font-medium text-gray-700">{activeUploadInfo.filename}</span>
                  <span className="text-gray-400 ml-2">
                    · {new Date(activeUploadInfo.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </p>
              )}

              {/* Section 2: Summary cards */}
              <SummaryCards
                upload={dashboardData.upload}
                categoryStats={dashboardData.category_stats}
                anomalyCount={anomalyCount}
              />

              {/* Section 3: AI Insights (above charts — insights drive decisions) */}
              <AIInsightsPanel
                pass2={dashboardData.pass2}
                pass2Status={dashboardData.upload.pass2_status}
                uploadId={dashboardData.upload.id}
                onPass2Complete={handlePass2Complete}
              />

              {/* Section 4 + 5: Donut + bar comparison side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CategoryDonut
                  stats={dashboardData.category_stats}
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                />
                <BarComparison
                  categoryStats={dashboardData.category_stats}
                  selectedCategory={selectedCategory}
                />
              </div>

              {/* Section 6: Anomaly feed */}
              <AnomalyFeed
                flags={dashboardData.flags}
                selectedCategory={selectedCategory}
                resolvedItems={resolvedItems}
                onResolve={handleResolve}
              />

              {/* Section 7: Vendor table */}
              <VendorsTable
                vendors={dashboardData.vendors}
                selectedCategory={selectedCategory}
              />

              {/* Section 8: Upload history (bottom, secondary) */}
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

          {/* Empty state — no uploads yet */}
          {activeTab === 'upload' && !dashboardData && !loadingDashboard && uploads.length === 0 && (
            <div className="text-center py-20">
              <div className="max-w-md mx-auto">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-800 mb-2">Ready to analyze your expenses</h2>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Drop a CSV or TXT expense report above. Expense Intelligence will automatically categorize every line item, detect anomalies using z-score analysis, and generate AI-powered insights with a financial health score.
                </p>
              </div>
            </div>
          )}

        </div>
      </main>
    </Layout>
  );
}
