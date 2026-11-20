import Layout from "@/components/Layout";
import Link from "next/link";
export default function LogoutPage() {
  return (
    <Layout>
      <main className="af-width reading">
        <p className="eyebrow">UNTIL NEXT TIME</p>
        <h1>
          You’re <em>signed out.</em>
        </h1>
        <p>Sign in when you’re ready to return to your reports.</p>
        <div className="button-row">
          <Link className="btn primary" href="/login">
            Sign in again
          </Link>
          <Link className="btn subtle" href="/">
            Back to AetherFlow
          </Link>
        </div>
      </main>
    </Layout>
  );
}
