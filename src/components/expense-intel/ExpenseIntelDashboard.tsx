'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
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

const ease = [0.22, 1, 0.36, 1] as const;

const stagger = (i: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay: i * 0.07, ease },
});

export default function ExpenseIntelDashboard() {
  const router = useRouter();
  const [uploads, setUploads] = useState<UploadListItem[]>([]);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [resolvedItems, setResolvedItems] = useState<Record<string, 'expected' | 'investigate'>>({});
  const [activeTab, setActiveTab] = useState<'upload' | 'alltime'>('upload');

  const fetchUploads = useCallback(async () => {
    try {
      const res = await fetch('/api/expense-intel/uploads');
      if (res.status === 401) { router.push('/login'); return; }
      if (!res.ok) return;
      const data = await res.json();
      setUploads(data.uploads ?? []);
    } finally {
      setLoadingInitial(false);
    }
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

  useEffect(() => { fetchUploads(); }, [fetchUploads]);

  useEffect(() => {
    if (uploads.length > 0 && !activeUploadId) {
      loadDashboard(uploads[0].id);
    }
  }, [uploads, activeUploadId, loadDashboard]);

  const handleUploadComplete = async (uploadId: string) => {
    await fetchUploads();
    await loadDashboard(uploadId);
  };

  const handleDelete = async (uploadId: string) => {
    const res = await fetch(`/api/expense-intel/uploads/${uploadId}`, { method: 'DELETE' });
    if (!res.ok) {
      console.error('[delete] failed:', await res.text());
      return;
    }
    const listRes = await fetch('/api/expense-intel/uploads');
    const fresh = listRes.ok ? ((await listRes.json()).uploads ?? []) : uploads.filter((u) => u.id !== uploadId);
    setUploads(fresh);
    if (activeUploadId === uploadId) {
      // Deleted the currently-viewed upload — switch to the next one
      setDashboardData(null);
      setActiveUploadId(null);
      if (fresh.length > 0) await loadDashboard(fresh[0].id);
    } else if (activeUploadId) {
      // Deleted a different upload — reload current dashboard so vendor stats reflect the recalculation
      await loadDashboard(activeUploadId);
    }
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
      <section
        className="w-full px-4 py-12 text-white"
        style={{
          backgroundImage: "url('/images/gradient.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-white">
              <motion.span
                initial={{ opacity: 0, y: -40, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                style={{ display: 'inline-block' }}
              >
                Expense
              </motion.span>
              {' '}
              <motion.span
                initial={{ opacity: 0, y: -40, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                style={{ display: 'inline-block' }}
                className="text-blue-400"
              >
                Intelligence
              </motion.span>
            </h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="text-sm mt-1 text-white/70"
            >
              AI-powered expense analysis for business reports
            </motion.p>
          </div>
          {dashboardData && activeTab === 'upload' && (
            <motion.button
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease }}
              onClick={exportCSV}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-white/50 text-white hover:bg-white/10 transition-colors"
            >
              Export CSV
            </motion.button>
          )}
        </div>
      </section>

      <main className="min-h-screen py-8 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto space-y-6">

          <motion.div {...stagger(1)}>
            <UploadZone onUploadComplete={handleUploadComplete} />
            <p className="text-xs text-gray-400 text-center mt-3">
              Don&apos;t have an expense file ready? Try these:{' '}
              <a
                href="/sample/Q2_Expense_Report.csv"
                download
                className="text-blue-600 hover:text-blue-800 underline underline-offset-2 font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                Q2 Sample
              </a>
              {' · '}
              <a
                href="/sample/Q3_Expense_Report.csv"
                download
                className="text-blue-600 hover:text-blue-800 underline underline-offset-2 font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                Q3 Sample
              </a>
            </p>
          </motion.div>

          {uploads.length > 0 && (
            <motion.div {...stagger(2)} className="flex gap-1 p-1 rounded-full bg-gray-100 w-fit">
              {(['upload', 'alltime'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeTab === tab ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  style={{ zIndex: 1 }}
                >
                  {activeTab === tab && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-white shadow-sm rounded-full"
                      style={{ zIndex: -1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    />
                  )}
                  {tab === 'upload' ? 'Latest Upload' : 'All Time'}
                </button>
              ))}
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {activeTab === 'alltime' && (
              <motion.div
                key="alltime"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <AllTimeView />
              </motion.div>
            )}
          </AnimatePresence>

          {activeTab === 'upload' && loadingInitial && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center py-20 text-gray-500">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mr-3" />
              Loading…
            </motion.div>
          )}

          {activeTab === 'upload' && !loadingInitial && loadingDashboard && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center py-20 text-gray-500">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mr-3" />
              Loading dashboard…
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {activeTab === 'upload' && !loadingInitial && dashboardData && !loadingDashboard && (
              <motion.div
                key="upload-data"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                {activeUploadInfo && (
                  <p className="text-sm text-gray-500">
                    Viewing:{' '}
                    <span className="text-gray-700 font-medium">{activeUploadInfo.filename}</span>
                    <span className="ml-2 text-gray-400">
                      ·{' '}
                      {new Date(activeUploadInfo.uploaded_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  </p>
                )}

                <SummaryCards
                  upload={dashboardData.upload}
                  categoryStats={dashboardData.category_stats}
                  anomalyCount={anomalyCount}
                />

                <AIInsightsPanel
                  pass2={dashboardData.pass2}
                  pass2Status={dashboardData.upload.pass2_status}
                  uploadId={dashboardData.upload.id}
                  onPass2Complete={handlePass2Complete}
                />

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

                <AnomalyFeed
                  flags={dashboardData.flags}
                  selectedCategory={selectedCategory}
                  resolvedItems={resolvedItems}
                  onResolve={handleResolve}
                />

                <VendorsTable
                  vendors={dashboardData.vendors}
                  selectedCategory={selectedCategory}
                />

                <UploadHistory
                  uploads={uploads}
                  activeUploadId={activeUploadId}
                  onSelect={(id) => { setActiveTab('upload'); loadDashboard(id); }}
                  onDelete={handleDelete}
                />

                <div className="flex justify-end pb-4">
                  <button
                    onClick={exportCSV}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium transition-colors bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Export Line Items as CSV
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {activeTab === 'upload' && !loadingInitial && !dashboardData && !loadingDashboard && uploads.length === 0 && (
            <motion.div {...stagger(3)} className="text-center py-20">
              <div className="max-w-md mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Track your first expenses</h2>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Upload any CSV, TXT, or PDF of your business expenses. We&apos;ll categorize everything, spot patterns, and flag anything unusual.
                </p>
              </div>
            </motion.div>
          )}

        </div>
      </main>
    </Layout>
  );
}
