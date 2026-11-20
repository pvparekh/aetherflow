"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import { createClient } from "../../../utils/supabase/client";

type Mode = "signin" | "signup" | "forgot";

/** Only same-site paths, so a crafted link can't send people elsewhere. */
export function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/expense-intel";
}

/** Plain-language messages for the errors people actually hit. */
export function authMessage(error: { message?: string; status?: number; code?: string }): string {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (error.status === 429 || text.includes("rate limit"))
    return "Too many emails were requested. Wait a few minutes, then try again.";
  if (text.includes("email_not_confirmed") || text.includes("not confirmed"))
    return "Confirm your email first. Use the link we sent, or send a new one below.";
  if (text.includes("invalid_credentials") || text.includes("invalid login"))
    return "That email and password don't match an account.";
  if (text.includes("weak_password") || text.includes("password should"))
    return "Choose a stronger password of at least 8 characters.";
  return "Something went wrong. Please try again.";
}

export default function AuthScreen({ signup = false }: { signup?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(signup ? "signup" : "signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [canResend, setCanResend] = useState(false);
  const [next, setNext] = useState("/expense-intel");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNext(safeNext(params.get("next")));
    if (params.get("auth") === "expired")
      setError("That link expired or was already used. Sign in, or request a new link.");
    // Someone already signed in has nothing to do here.
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace(safeNext(params.get("next")));
      })
      .catch(() => undefined);
  }, [router]);

  function switchMode(to: Mode) {
    setMode(to);
    setError("");
    setMessage("");
    setCanResend(false);
  }

  const callback = (after: string) =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(after)}`;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setCanResend(false);
    const f = new FormData(e.currentTarget);
    const address = String(f.get("email") ?? "").trim();
    setEmail(address);
    const client = createClient();
    try {
      if (mode === "forgot") {
        const { error } = await client.auth.resetPasswordForEmail(address, {
          redirectTo: callback("/reset-password"),
        });
        if (error) throw error;
        setMessage("If an account uses that email, a link to set a new password is on its way.");
        return;
      }
      const password = String(f.get("password") ?? "");
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email: address,
          password,
          options: {
            emailRedirectTo: callback(next),
            data: { full_name: String(f.get("name") ?? "").trim() },
          },
        });
        if (error) throw error;
        // Supabase hides whether an address is registered by returning a
        // user with no identities; say so plainly instead of waiting forever.
        if (data.user && data.user.identities?.length === 0) {
          setError("An account already uses this email. Sign in, or reset your password.");
          return;
        }
        if (!data.session) {
          setMessage(`We sent a confirmation link to ${address}. Open it to finish creating your account.`);
          setCanResend(true);
          return;
        }
      } else {
        const { error } = await client.auth.signInWithPassword({ email: address, password });
        if (error) {
          setCanResend(/not confirmed|email_not_confirmed/i.test(`${error.code} ${error.message}`));
          throw error;
        }
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(authMessage(err as { message?: string; status?: number; code?: string }));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!email) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await createClient().auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: callback(next) },
      });
      if (error) throw error;
      setMessage(`A new confirmation link is on its way to ${email}.`);
    } catch (err) {
      setError(authMessage(err as { message?: string; status?: number }));
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
        options: { redirectTo: callback(next) },
      });
      if (error || !data.url) throw new Error("google");
      window.location.assign(data.url);
    } catch {
      setError("Google sign-in is unavailable right now. Use your email instead.");
      setBusy(false);
    }
  }

  const heading =
    mode === "signup" ? "Create your free workspace" : mode === "forgot" ? "Reset your password" : "Sign in to your workspace";
  const intro =
    mode === "signup"
      ? "Use your email and a password of at least 8 characters."
      : mode === "forgot"
        ? "Enter your email and we'll send you a link to choose a new password."
        : "Your reports and unfinished reviews are where you left them.";

  return (
    <Layout>
      <main className="auth-layout">
        <section>
          <p className="eyebrow">AETHER FLOW</p>
          <h1>
            {mode === "signup" ? (
              <>
                See where your money <em>quietly goes</em>
              </>
            ) : (
              <>
                Welcome <em>back</em>
              </>
            )}
          </h1>
          <p>
            Upload your statements and find forgotten subscriptions, price
            increases and double charges. Every figure is computed from your own
            data.
          </p>
          <Link className="text-link" href="/demo">
            Try the demo first, no account needed ↗
          </Link>
        </section>
        <section className="auth-card">
          <h2>{heading}</h2>
          <p>{intro}</p>
          {error && (
            <div className="notice error" role="alert" style={{ marginTop: 18 }}>
              {error}
            </div>
          )}
          {message && (
            <div className="notice info" role="status" style={{ marginTop: 18 }}>
              {message}
            </div>
          )}
          <form onSubmit={(e) => void submit(e)}>
            {mode === "signup" && (
              <label htmlFor="full-name">
                Full name
                <input id="full-name" name="name" autoComplete="name" maxLength={100} required />
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
                defaultValue={email}
              />
            </label>
            {mode !== "forgot" && (
              <label htmlFor="password">
                Password
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  minLength={mode === "signup" ? 8 : 1}
                  maxLength={200}
                />
              </label>
            )}
            <button className="btn primary" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : "Sign in"}
            </button>
          </form>
          {canResend && (
            <button className="btn subtle" style={{ marginTop: 12 }} disabled={busy} onClick={() => void resend()}>
              Send the confirmation email again
            </button>
          )}
          {mode !== "forgot" && (
            <button className="btn subtle" style={{ marginTop: 12 }} disabled={busy} onClick={() => void google()}>
              Continue with Google
            </button>
          )}
          <div className="auth-links micro">
            {mode === "signin" && (
              <>
                <button className="text-link" onClick={() => switchMode("forgot")}>
                  Forgot your password?
                </button>
                <Link className="text-link" href="/signup">
                  Create an account
                </Link>
              </>
            )}
            {mode === "signup" && (
              <Link className="text-link" href="/login">
                Already have an account? Sign in
              </Link>
            )}
            {mode === "forgot" && (
              <button className="text-link" onClick={() => switchMode("signin")}>
                Back to sign in
              </button>
            )}
          </div>
          <Link className="text-link micro" href="/data-guide">
            How your expense data is handled ↗
          </Link>
        </section>
      </main>
    </Layout>
  );
}
