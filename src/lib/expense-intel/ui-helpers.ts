import type { FlagSeverity, AnomalySeverity } from './types';

export const CATEGORY_COLORS: Record<string, string> = {
  'Food/Dining':       '#2563EB',
  'Travel/Transport':  '#7C3AED',
  'Accommodation':     '#059669',
  'Software/SaaS':     '#0891B2',
  'Office/Supplies':   '#D97706',
  'Marketing/Ads':     '#DC2626',
  'Entertainment':     '#DB2777',
  'Utilities':         '#0D9488',
  'Misc':              '#6B7280',
};

export const SEVERITY_STYLES: Record<
  FlagSeverity,
  { bg: string; border: string; text: string; badge: string; dot: string; icon: string }
> = {
  success: {
    bg:     'bg-emerald-50',
    border: 'border-emerald-200',
    text:   'text-emerald-700',
    badge:  'bg-emerald-100 text-emerald-700',
    dot:    'bg-emerald-500',
    icon:   '✓',
  },
  info: {
    bg:     'bg-blue-50',
    border: 'border-blue-200',
    text:   'text-blue-700',
    badge:  'bg-blue-100 text-blue-700',
    dot:    'bg-blue-500',
    icon:   'ℹ',
  },
  warning: {
    bg:     'bg-amber-50',
    border: 'border-amber-200',
    text:   'text-amber-700',
    badge:  'bg-amber-100 text-amber-700',
    dot:    'bg-amber-500',
    icon:   '⚠',
  },
  critical: {
    bg:     'bg-red-50',
    border: 'border-red-200',
    text:   'text-red-700',
    badge:  'bg-red-100 text-red-700',
    dot:    'bg-red-500',
    icon:   '✕',
  },
};

export const ANOMALY_STYLES: Record<AnomalySeverity, { badge: string; label: string }> = {
  none:   { badge: 'bg-gray-100 text-gray-500',    label: 'Normal' },
  low:    { badge: 'bg-blue-100 text-blue-700',    label: 'Low' },
  medium: { badge: 'bg-amber-100 text-amber-700',  label: 'Medium' },
  high:   { badge: 'bg-red-100 text-red-700',      label: 'High' },
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
  return CATEGORY_COLORS[category] ?? '#6B7280';
}
