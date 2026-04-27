'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '../../../utils/supabase/client';
import Layout from '@/components/Layout';
import type { User } from '@supabase/supabase-js';

interface AccountStats {
  totalUploads: number;
  totalTransactions: number;
  firstUploadDate: string | null;
  avgHealthScore: number | null;
}

interface ModalState {
  type: 'delete-uploads' | 'delete-account' | null;
  input: string;
  loading: boolean;
  error: string | null;
}

const ease = [0.22, 1, 0.36, 1] as const;

function stagger(i: number) {
  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay: i * 0.07, ease },
  };
}

function formatJoined(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function healthColor(score: number) {
  if (score > 7) return 'text-green-600';
  if (score >= 5) return 'text-yellow-600';
  return 'text-red-600';
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>({ type: null, input: '', loading: false, error: null });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/signup'); return; }
      setUser(user);
    });
  }, [router]);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch('/api/account/stats');
      if (res.status === 401) { router.push('/signup'); return; }
      if (res.ok) setStats(await res.json());
    } finally {
      setLoadingStats(false);
    }
  }, [router]);

  useEffect(() => { if (user) fetchStats(); }, [user, fetchStats]);

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const res = await fetch('/api/account/export');
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aetherflow_export_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  };

  const openModal = (type: ModalState['type']) => {
    setModal({ type, input: '', loading: false, error: null });
  };

  const closeModal = () => {
    if (!modal.loading) setModal({ type: null, input: '', loading: false, error: null });
  };

  const handleDeleteUploads = async () => {
    if (modal.input !== 'DELETE') return;
    setModal((m) => ({ ...m, loading: true, error: null }));
    const res = await fetch('/api/account/uploads', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Something went wrong' }));
      setModal((m) => ({ ...m, loading: false, error: err.error ?? 'Something went wrong' }));
      return;
    }
    setModal({ type: null, input: '', loading: false, error: null });
    await fetchStats();
    router.push('/expense-intel');
  };

  const handleDeleteAccount = async () => {
    if (modal.input !== 'DELETE MY ACCOUNT') return;
    setModal((m) => ({ ...m, loading: true, error: null }));
    const res = await fetch('/api/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Something went wrong' }));
      setModal((m) => ({ ...m, loading: false, error: err.error ?? 'Something went wrong' }));
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  const fullName = user?.user_metadata?.full_name as string | undefined;

  return (
    <Layout>
      <section
        className="py-10 px-6"
        style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 60%, #1d4ed8 100%)',
        }}
      >
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-white">Account</h1>
        </div>
      </section>

      <main className="min-h-screen py-8 px-4 bg-gray-50">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Profile */}
          <motion.div {...stagger(0)} className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Profile</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <p className="text-sm text-gray-500 mb-1">Full Name</p>
                <p className="font-medium text-gray-900">{fullName || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Email</p>
                <p className="font-medium text-gray-900">{user?.email || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Member Since</p>
                <p className="font-medium text-gray-900">
                  {user?.created_at ? formatJoined(user.created_at) : '-'}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Usage Stats */}
          <motion.div {...stagger(1)} className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Usage</h2>
            {loadingStats ? (
              <div className="flex items-center gap-3 text-gray-400 py-4">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Loading stats...
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  value={stats?.totalUploads ?? 0}
                  label="uploads"
                />
                <StatCard
                  value={stats?.totalTransactions ?? 0}
                  label="transactions"
                />
                <StatCard
                  value={stats?.firstUploadDate ? formatMonth(stats.firstUploadDate) : '-'}
                  label="tracking since"
                  small
                />
                <StatCard
                  value={
                    stats?.avgHealthScore != null
                      ? `${stats.avgHealthScore}/10`
                      : '-'
                  }
                  label="avg health score"
                  colorClass={
                    stats?.avgHealthScore != null
                      ? healthColor(stats.avgHealthScore)
                      : undefined
                  }
                />
              </div>
            )}
          </motion.div>

          {/* Data Management */}
          <motion.div {...stagger(2)} className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Data Management</h2>
            <div className="space-y-5">

              <ActionRow
                title="Export All Data"
                description="Download all your uploads and analysis as a ZIP file."
              >
                <button
                  onClick={handleExport}
                  disabled={exportLoading}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-blue-600 text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                >
                  {exportLoading ? 'Preparing...' : 'Export All Data'}
                </button>
              </ActionRow>

              <div className="border-t border-gray-100" />

              <ActionRow
                title="Delete All Uploads"
                description="Permanently delete all your expense files and analysis. This cannot be undone."
              >
                <button
                  onClick={() => openModal('delete-uploads')}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-red-500 text-red-600 hover:bg-red-50 transition-colors"
                >
                  Delete All Uploads
                </button>
              </ActionRow>

              <div className="border-t border-gray-100" />

              <ActionRow
                title="Delete Account"
                description="Permanently delete your account and all data. You will be logged out immediately."
              >
                <button
                  onClick={() => openModal('delete-account')}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Delete Account
                </button>
              </ActionRow>

            </div>
          </motion.div>

          {/* Preferences */}
          <motion.div {...stagger(3)} className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Preferences</h2>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-gray-900 text-sm">Email digest</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Receive a monthly summary of your spending
                  <span className="ml-1.5 inline-block text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-md align-middle">Coming soon</span>
                </p>
              </div>
              <button
                disabled
                className="relative shrink-0 w-10 h-6 rounded-full bg-gray-200 cursor-not-allowed"
                aria-label="Email digest toggle (coming soon)"
              >
                <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform" />
              </button>
            </div>
          </motion.div>

        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {modal.type === 'delete-uploads' && (
          <ConfirmModal
            title="Delete All Uploads"
            warning="This will permanently delete all your expense files, line items, categories, and analysis. This cannot be undone."
            confirmPhrase="DELETE"
            confirmLabel='Type DELETE to confirm'
            destructive
            input={modal.input}
            loading={modal.loading}
            error={modal.error}
            onInput={(v) => setModal((m) => ({ ...m, input: v }))}
            onConfirm={handleDeleteUploads}
            onClose={closeModal}
          />
        )}
        {modal.type === 'delete-account' && (
          <ConfirmModal
            title="Delete Account"
            warning="This will permanently delete your account and ALL data associated with it. You will be logged out immediately. This cannot be undone."
            confirmPhrase="DELETE MY ACCOUNT"
            confirmLabel='Type DELETE MY ACCOUNT to confirm'
            destructive
            filled
            input={modal.input}
            loading={modal.loading}
            error={modal.error}
            onInput={(v) => setModal((m) => ({ ...m, input: v }))}
            onConfirm={handleDeleteAccount}
            onClose={closeModal}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}

function StatCard({
  value,
  label,
  small,
  colorClass,
}: {
  value: string | number;
  label: string;
  small?: boolean;
  colorClass?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 text-center">
      <p className={`font-bold text-gray-900 ${small ? 'text-lg leading-tight' : 'text-3xl'} ${colorClass ?? ''}`}>
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function ActionRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <p className="font-medium text-gray-900 text-sm">{title}</p>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ConfirmModal({
  title,
  warning,
  confirmPhrase,
  confirmLabel,
  destructive,
  filled,
  input,
  loading,
  error,
  onInput,
  onConfirm,
  onClose,
}: {
  title: string;
  warning: string;
  confirmPhrase: string;
  confirmLabel: string;
  destructive?: boolean;
  filled?: boolean;
  input: string;
  loading: boolean;
  error: string | null;
  onInput: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ready = input === confirmPhrase;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">{warning}</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-gray-500 mb-1.5">{confirmLabel}</label>
          <input
            type="text"
            value={input}
            onChange={(e) => onInput(e.target.value)}
            placeholder={confirmPhrase}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 font-mono"
            disabled={loading}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 mb-3">{error}</p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!ready || loading}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
              filled
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'border border-red-500 text-red-600 hover:bg-red-50'
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Deleting...
              </span>
            ) : destructive ? `Yes, ${title}` : 'Confirm'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
