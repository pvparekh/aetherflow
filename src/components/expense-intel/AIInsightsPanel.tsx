'use client';

import { useState } from 'react';
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
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  if (!pass2) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="font-semibold text-gray-800 mb-3">AI Insights</h3>
        {pass2Status === 'processing' || loading ? (
          <div className="flex items-center gap-3 text-gray-500">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">GPT-4o is analyzing your spending patterns…</span>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              {pass2Status === 'error'
                ? 'AI analysis encountered an error.'
                : 'AI insights have not been generated yet.'}
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={runPass2}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Generate AI Insights
            </button>
          </div>
        )}
      </div>
    );
  }

  const scoreColor =
    pass2.health_score >= 80
      ? 'text-green-600'
      : pass2.health_score >= 60
        ? 'text-yellow-600'
        : 'text-red-600';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h3 className="font-semibold text-gray-800">AI Insights</h3>
        <div className="text-right">
          <span className={`text-3xl font-bold ${scoreColor}`}>{pass2.health_score}</span>
          <span className="text-gray-400 text-lg">/100</span>
          <p className="text-xs text-gray-500 mt-0.5">Spend Health Score</p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm font-medium text-gray-700 mb-1">Executive Summary</p>
        <p className="text-sm text-gray-600 leading-relaxed">{pass2.narrative_summary}</p>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Key Findings</p>
        <div className="space-y-3">
          {pass2.insights.map((insight, i) => {
            const styles = SEVERITY_STYLES[insight.severity];
            return (
              <div key={i} className={`${styles.bg} ${styles.border} border rounded-lg p-4`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-sm font-semibold ${styles.text}`}>{insight.title}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles.badge}`}>
                    {insight.severity}
                  </span>
                  {insight.category && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {insight.category}
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium text-gray-500 mb-1">{insight.metric}</p>
                <p className="text-sm text-gray-700">{insight.description}</p>
                {insight.action && (
                  <p className="text-xs text-gray-500 mt-2 italic">→ {insight.action}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {pass2.savings_opportunities.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">Savings Opportunities</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pass2.savings_opportunities.map((opp, i) => (
              <div key={i} className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                  <span className="text-sm font-semibold text-green-800">{opp.title}</span>
                  <span className="text-sm font-bold text-green-700">{opp.estimated_savings}</span>
                </div>
                <p className="text-xs text-green-600 mb-1">{opp.category}</p>
                <p className="text-sm text-green-700">{opp.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
