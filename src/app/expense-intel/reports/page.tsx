import ExpenseIntelDashboard from '@/components/expense-intel/ExpenseIntelDashboard';
import type { DashboardConfig } from '@/components/expense-intel/ExpenseIntelDashboard';

const config: DashboardConfig = {
  titleWord1: 'Expense',
  titleWord2: 'Reports',
  subtitle: 'AI-powered analysis for business expenses and reimbursements',
  uploadLabel: 'Drop an expense report (.csv, .txt, or .pdf)',
  emptyStateHeading: 'Analyze your first expense report',
  emptyStateBody:
    'Drop a CSV or TXT expense report above. Expense Intelligence will automatically categorize every line item, detect anomalies using z-score analysis, and generate AI-powered insights with a financial health score.',
};

export default function ExpenseReportsPage() {
  return <ExpenseIntelDashboard config={config} />;
}
