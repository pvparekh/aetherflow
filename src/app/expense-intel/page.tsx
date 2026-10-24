import { Suspense } from "react";
import ExpenseIntelDashboard from "@/components/expense-intel/ExpenseIntelDashboard";
export default function ExpenseIntelPage() {
  return (
    <Suspense
      fallback={
        <main className="af-width reading" role="status">
          Loading workspace…
        </main>
      }
    >
      <ExpenseIntelDashboard />
    </Suspense>
  );
}
