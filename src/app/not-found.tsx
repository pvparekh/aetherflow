import Layout from "@/components/Layout";
import Link from "next/link";
export default function NotFound() {
  return (
    <Layout>
      <main className="af-width reading">
        <p className="eyebrow">404 / PAGE NOT FOUND</p>
        <h1>
          A different <em>direction.</em>
        </h1>
        <p>
          This page is unavailable. Your workspace is a good place to start.
        </p>
        <Link
          className="btn primary"
          style={{ marginTop: 24 }}
          href="/expense-intel"
        >
          Return to workspace ↗
        </Link>
      </main>
    </Layout>
  );
}
