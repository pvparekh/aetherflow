import ExpenseIntelDashboard from '@/components/expense-intel/ExpenseIntelDashboard';
import type { DashboardConfig } from '@/components/expense-intel/ExpenseIntelDashboard';

const config: DashboardConfig = {
  titleWord1: 'Bank',
  titleWord2: 'Statements',
  subtitle: 'Understand your income, spending, and cash flow',
  uploadLabel: 'Drop a bank statement (.csv, .txt, or .pdf)',
  emptyStateHeading: 'Analyze your first bank statement',
  emptyStateBody:
    'Drop a CSV or TXT bank statement export above. AetherFlow will categorize every transaction, separate debits from credits, and give you a clear picture of your cash flow.',
};

export default function BankStatementsPage() {
  return <ExpenseIntelDashboard config={config} />;
}
