'use client';

import { useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { SEVERITY_STYLES } from '@/lib/expense-intel/ui-helpers';
import type { Pass2Result, UploadStatus } from '@/lib/expense-intel/types';

interface Props {
  pass2: Pass2Result | null;
  pass2Status: UploadStatus;
  uploadId: string;
  onPass2Complete: (result: Pass2Result) => void;
}

export default function AIInsightsPanel({ pass2, pass2Status, uploadId, onPass2Complete }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runPass2 = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/expense-intel/pass2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: uploadId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'AI analysis failed');
        return;
      }
      onPass2Complete(data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!pass2) {
    return (
      <div className="ei-card-section rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-6 h-6 text-blue-600" />
          <h3 className="text-2xl font-bold text-gray-900">AI Analysis</h3>
        </div>
        {loading ? (
          <div className="flex items-center gap-3 text-gray-500">
            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">GPT-4o is analyzing your spending patterns…</span>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              {pass2Status === 'error'
                ? 'AI analysis encountered an error. You can retry below.'
                : pass2Status === 'processing'
                  ? 'A previous analysis may be in progress or got stuck.'
                  : 'AI insights have not been generated yet.'}
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={runPass2}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                pass2Status === 'error'
                  ? 'border border-blue-600 text-blue-600 hover:bg-blue-50'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {(pass2Status === 'processing' || pass2Status === 'error') && (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {pass2Status === 'processing' || pass2Status === 'error'
                ? 'Retry AI Analysis'
                : 'Generate AI Insights'}
            </button>
          </div>
        )}
      </div>
    );
  }

  const scoreColor =
    pass2.health_score >= 8
      ? 'text-emerald-600'
      : pass2.health_score >= 5
        ? 'text-amber-600'
        : 'text-red-600';

  const scoreBg =
    pass2.health_score >= 8
      ? 'bg-emerald-50 border-emerald-200'
      : pass2.health_score >= 5
        ? 'bg-amber-50 border-amber-200'
        : 'bg-red-50 border-red-200';

  return (
    <div className="ei-card-section rounded-xl p-6 space-y-6">
      {/* Header row: title + health score */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-blue-600" />
          <h3 className="text-2xl font-bold text-gray-900">AI Analysis</h3>
        </div>
        <div className={`${scoreBg} border rounded-2xl px-6 py-5 text-right min-w-[160px]`}>
          <div className="flex items-center gap-0.5 justify-end">
            <span className={`text-5xl font-bold ${scoreColor}`}>{pass2.health_score}</span>
            <span className={`text-5xl font-bold ${scoreColor} opacity-40`}>/10</span>
          </div>
          <p className="text-sm text-gray-500 mt-1 font-medium">Spend Health Score</p>
          {pass2.health_justification && (
            <p className={`text-xs mt-2 max-w-[260px] ${scoreColor} font-medium leading-relaxed`}>
              {pass2.health_justification}
            </p>
          )}
        </div>
      </div>

      {/* Narrative summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Executive Summary</p>
        <p className="text-sm text-gray-700 leading-relaxed">{pass2.narrative_summary}</p>
      </div>

      {/* Key insights grid */}
      {pass2.insights.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">Key Findings</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pass2.insights.map((insight, i) => {
              const styles = SEVERITY_STYLES[insight.severity];
              return (
                <div
                  key={i}
                  className={`${styles.bg} border-l-4 ${styles.border} rounded-r-lg p-4`}
                >
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-sm font-semibold ${styles.text}`}>{insight.title}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles.badge}`}>
                      {insight.severity}
                    </span>
                    {insight.category && (
                      <span className="text-xs text-gray-500 bg-white/70 px-2 py-0.5 rounded-full border border-gray-200">
                        {insight.category}
                      </span>
                    )}
                  </div>
                  {insight.metric && (
                    <p className={`text-xs font-bold ${styles.text} mb-1`}>{insight.metric}</p>
                  )}
                  <p className="text-sm text-gray-700">{insight.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Anomaly explanations */}
      {pass2.anomaly_explanations.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">Anomaly Breakdown</p>
          <div className="space-y-2">
            {pass2.anomaly_explanations.map((ex, i) => {
              const styles = ex.severity === 'critical' ? SEVERITY_STYLES.critical : SEVERITY_STYLES.warning;
              return (
                <div key={i} className={`flex items-start gap-3 ${styles.bg} ${styles.border} border rounded-lg p-3`}>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles.badge} flex-shrink-0`}>
                    {ex.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-semibold ${styles.text}`}>{ex.vendor}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      ${Number(ex.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <p className="text-sm text-gray-600 mt-0.5">{ex.reason}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Savings opportunities */}
      {pass2.savings_opportunities.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">Savings Opportunities</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pass2.savings_opportunities.map((opp, i) => (
              <div key={i} className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-green-800">{opp.title}</span>
                  {opp.estimated_impact && (
                    <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">
                      {opp.estimated_impact}
                    </span>
                  )}
                </div>
                <p className="text-sm text-green-700">{opp.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
