"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import ConfirmDialog from "@/components/workspace/ConfirmDialog";
import { createClient } from "../../../utils/supabase/client";
import { api } from "@/lib/imports/http";
export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [stats, setStats] = useState<{
    totalUploads: number;
    totalTransactions: number;
    firstUploadDate: string | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"uploads" | "account" | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const {
        data: { user },
        error,
      } = await createClient().auth.getUser();
      if (error || !user) {
        router.push("/login");
        return;
      }
      setEmail(user.email ?? "");
      setStats(await api("/api/account/stats"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [router]);
  useEffect(() => {
    void load();
  }, [load]);
  async function exportData() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/export");
      if (!response.ok)
        throw new Error("Export could not be prepared. Retry shortly.");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "aetherflow-data.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Layout>
      <main className="workspace-content">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">YOUR WORKSPACE / ACCOUNT</p>
            <h1>
              Your data. <em>Your control.</em>
            </h1>
            <p>Manage your account and the reports you’ve saved.</p>
          </div>
        </div>
        {error && (
          <div className="notice error" role="alert">
            {error}{" "}
            <button className="text-link" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Profile</h2>
              <p>{email || "Loading account…"}</p>
            </div>
            <button
              className="btn subtle"
              onClick={async () => {
                const { error } = await createClient().auth.signOut();
                if (error) setError("Sign-out failed. Please retry.");
                else {
                  router.push("/");
                  router.refresh();
                }
              }}
            >
              Sign out
            </button>
          </div>
          <div className="stat-grid">
            <div>
              <span className="stat-label">Saved reports</span>
              <strong className="stat-value">
                {stats?.totalUploads ?? "—"}
              </strong>
            </div>
            <div>
              <span className="stat-label">Transactions</span>
              <strong className="stat-value">
                {stats?.totalTransactions ?? "—"}
              </strong>
            </div>
            <div>
              <span className="stat-label">First report</span>
              <strong className="stat-value" style={{ fontSize: 18 }}>
                {stats?.firstUploadDate
                  ? new Date(stats.firstUploadDate).toLocaleDateString(
                      "en-US",
                      { timeZone: "UTC" },
                    )
                  : "—"}
              </strong>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Your expense data</h2>
              <p>
                Exports contain saved records and analysis. Original uploaded
                documents are not retained.
              </p>
            </div>
          </div>
          <div className="history-row">
            <div style={{ flex: 1 }}>
              <strong>Export all data</strong>
              <p className="micro">
                Download your saved expense reports and analysis in a ZIP file.
              </p>
            </div>
            <button
              className="btn subtle"
              disabled={busy}
              onClick={() => void exportData()}
            >
              {busy ? "Preparing export…" : "Export data ↗"}
            </button>
          </div>
          <div className="history-row">
            <div style={{ flex: 1 }}>
              <strong>Delete all expense data</strong>
              <p className="micro">
                Remove reports, analysis and unfinished import reviews. Your
                account stays open.
              </p>
            </div>
            <button className="danger-link" onClick={() => setModal("uploads")}>
              Delete expense data
            </button>
          </div>
          <div className="history-row">
            <div style={{ flex: 1 }}>
              <strong>Delete your account</strong>
              <p className="micro">
                Permanently remove your account and its associated records.
              </p>
            </div>
            <button className="danger-link" onClick={() => setModal("account")}>
              Delete account
            </button>
          </div>
        </section>
        <a className="text-link" href="/data-guide">
          Supported formats, processing and limitations ↗
        </a>
      </main>
      {modal && (
        <ConfirmDialog
          title={modal === "uploads" ? "Delete expense data" : "Delete account"}
          description="This permanently removes the selected data and cannot be undone. Export a copy first if you need one."
          phrase={modal === "uploads" ? "DELETE" : "DELETE MY ACCOUNT"}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await api(
              modal === "uploads" ? "/api/account/uploads" : "/api/account",
              {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  confirmation:
                    modal === "uploads" ? "DELETE" : "DELETE MY ACCOUNT",
                }),
              },
            );
            if (modal === "account") {
              await createClient().auth.signOut();
              router.push("/");
            } else await load();
          }}
        />
      )}
    </Layout>
  );
}
