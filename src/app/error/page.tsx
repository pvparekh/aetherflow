import Layout from "@/components/Layout";
import Link from "next/link";
export default function ErrorPage() {
  return (
    <Layout>
      <main className="af-width reading">
        <p className="eyebrow">LET’S GET YOU BACK</p>
        <h1>
          Something needs
          <br />
          <em>another try.</em>
        </h1>
        <p>
          Sign in again if your session expired. Your saved reports and import
          checkpoints stay in your account.
        </p>
        <div className="button-row">
          <Link className="btn primary" href="/login">
            Sign in
          </Link>
          <Link className="btn subtle" href="/expense-intel">
            Return to workspace
          </Link>
        </div>
      </main>
    </Layout>
  );
}
