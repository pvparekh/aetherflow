"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import { createClient } from "../../../utils/supabase/client";

/** Reached from the reset email, which signs the person in first. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => setReady(Boolean(data.session)))
      .catch(() => setReady(false));
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    if (password !== String(f.get("confirm") ?? "")) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError("Your password could not be changed. Use at least 8 characters, or request a new link.");
      return;
    }
    router.replace("/expense-intel");
    router.refresh();
  }

  return (
    <Layout>
      <main className="auth-layout">
        <section>
          <p className="eyebrow">AETHER FLOW</p>
          <h1>
            Choose a new <em>password</em>
          </h1>
          <p>You&apos;ll go straight to your workspace once it&apos;s saved.</p>
        </section>
        <section className="auth-card">
          <h2>Set a new password</h2>
          {ready === false ? (
            <>
              <p>This reset link has expired or was already used.</p>
              <Link className="btn primary" href="/login">
                Request a new link
              </Link>
            </>
          ) : (
            <>
              <p>Use at least 8 characters.</p>
              {error && (
                <div className="notice error" role="alert" style={{ marginTop: 18 }}>
                  {error}
                </div>
              )}
              <form onSubmit={(e) => void submit(e)}>
                <label htmlFor="password">
                  New password
                  <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={200} required />
                </label>
                <label htmlFor="confirm">
                  Repeat new password
                  <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={200} required />
                </label>
                <button className="btn primary" disabled={busy || ready === null}>
                  {busy ? "Saving…" : "Save password"}
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </Layout>
  );
}
