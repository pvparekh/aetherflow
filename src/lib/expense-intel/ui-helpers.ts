import type { FlagSeverity, AnomalySeverity } from './types';

export const CATEGORY_COLORS: Record<string, string> = {
  'Food/Dining': '#f97316',
  'Travel/Transport': '#3b82f6',
  Accommodation: '#8b5cf6',
  'Software/SaaS': '#06b6d4',
  'Office/Supplies': '#84cc16',
  'Marketing/Ads': '#ec4899',
  Entertainment: '#f59e0b',
  Utilities: '#6b7280',
  Misc: '#a1a1aa',
};

export const SEVERITY_STYLES: Record<
  FlagSeverity,
  { bg: string; border: string; text: string; badge: string; dot: string; icon: string }
> = {
  success: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    badge: 'bg-green-100 text-green-700 border border-green-200',
    dot: 'bg-green-500',
    icon: '✓',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    badge: 'bg-blue-100 text-blue-700 border border-blue-200',
    dot: 'bg-blue-500',
    icon: 'ℹ',
  },
  warning: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    badge: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
    dot: 'bg-yellow-500',
    icon: '⚠',
  },
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    badge: 'bg-red-100 text-red-700 border border-red-200',
    dot: 'bg-red-500',
    icon: '✕',
  },
};

export const ANOMALY_STYLES: Record<AnomalySeverity, { badge: string; label: string }> = {
  none: { badge: 'bg-gray-100 text-gray-600', label: 'Normal' },
  low: { badge: 'bg-blue-100 text-blue-700', label: 'Low' },
  medium: { badge: 'bg-yellow-100 text-yellow-700', label: 'Medium' },
  high: { badge: 'bg-red-100 text-red-700', label: 'High' },
};

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? '#a1a1aa';
}
