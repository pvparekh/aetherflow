"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import { createClient } from "../../../utils/supabase/client";
export default function AuthScreen({ signup = false }: { signup?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("auth") === "expired")
      setError(
        "That sign-in link expired or could not be verified. Please sign in again.",
      );
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const f = new FormData(e.currentTarget);
    try {
      const client = createClient();
      const credentials = {
        email: String(f.get("email")).trim(),
        password: String(f.get("password")),
      };
      if (signup) {
        const { data, error } = await client.auth.signUp({
          ...credentials,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { full_name: String(f.get("name")).trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage(
            "Check your email for a confirmation link. You can sign in after confirming.",
          );
          return;
        }
      } else {
        const { error } = await client.auth.signInWithPassword(credentials);
        if (error)
          throw new Error(
            "Sign-in failed. Check your email and password, or confirm your email first.",
          );
      }
      router.push("/expense-intel");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error || !data.url)
        throw new Error(
          "Google sign-in is unavailable. Use email to continue.",
        );
      window.location.assign(data.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Layout>
      <main className="auth-layout">
        <section>
          <p className="eyebrow">YOUR EXPENSES, EXPLAINED</p>
          <h1>
            {signup ? (
              <>
                A little clarity.
                <br />
                <em>A better starting point.</em>
              </>
            ) : (
              <>
                Welcome back.
                <br />
                <em>Let’s make sense of it.</em>
              </>
            )}
          </h1>
          <p>
            Bring your expenses together, review the important details and
            understand what changed.
          </p>
          <Link className="text-link" href="/demo">
            Explore the interactive demo first ↗
          </Link>
        </section>
        <section className="auth-card">
          <h2>
            {signup ? "Create your workspace" : "Sign in to your workspace"}
          </h2>
          <p>
            {signup
              ? "Start with an email and a secure password."
              : "Your saved reports and unfinished reviews are waiting."}
          </p>
          {error && (
            <div
              className="notice error"
              role="alert"
              style={{ marginTop: 18 }}
            >
              {error}
            </div>
          )}
          {message && (
            <div
              className="notice info"
              role="status"
              style={{ marginTop: 18 }}
            >
              {message}
            </div>
          )}
          <form onSubmit={(e) => void submit(e)}>
            {signup && (
              <label htmlFor="full-name">
                Full name
                <input
                  id="full-name"
                  name="name"
                  autoComplete="name"
                  maxLength={100}
                  required
                />
              </label>
            )}
            <label htmlFor="email">
              Email address
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
            <label htmlFor="password">
              Password
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                required
                minLength={signup ? 8 : 1}
                maxLength={200}
              />
            </label>
            {signup && (
              <p className="micro" style={{ margin: 0 }}>
                Use at least 8 characters. A unique password protects your
                reports.
              </p>
            )}
            <button className="btn primary" disabled={busy}>
              {busy ? "Please wait…" : signup ? "Create account" : "Sign in"} ↗
            </button>
          </form>
          <button
            className="btn subtle"
            style={{ marginTop: 12 }}
            disabled={busy}
            onClick={() => void google()}
          >
            Continue with Google
          </button>
          <p className="micro">
            {signup ? "Already have an account?" : "New to AetherFlow?"}{" "}
            <Link className="text-link" href={signup ? "/login" : "/signup"}>
              {signup ? "Sign in" : "Create an account"}
            </Link>
          </p>
          <Link className="text-link" href="/data-guide">
            How your expense data is handled ↗
          </Link>
        </section>
      </main>
    </Layout>
  );
}
