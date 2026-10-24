import { Suspense } from "react";
import Workspace from "@/components/workspace/Workspace";
export default function DemoPage() {
  return (
    <Suspense
      fallback={
        <main className="af-width reading" role="status">
          Loading sample…
        </main>
      }
    >
      <Workspace demo />
    </Suspense>
  );
}
