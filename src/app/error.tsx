"use client";
import Link from "next/link";
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="af-width reading">
      <p className="eyebrow">SOMETHING INTERRUPTED THIS VIEW</p>
      <h1>
        Let’s <em>try again.</em>
      </h1>
      <p>
        The page couldn’t be displayed. Saved import checkpoints remain
        available.
      </p>
      <div className="button-row">
        <button className="btn primary" onClick={reset}>
          Retry view
        </button>
        <Link className="btn subtle" href="/expense-intel">
          Workspace
        </Link>
      </div>
    </main>
  );
}
