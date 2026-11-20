"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Layers2,
  LayoutDashboard,
  FolderClock,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { useAuthUser } from "./useAuthUser";
import { firstName } from "@/lib/auth/names";
import { createClient } from "../../utils/supabase/client";
export default function Layout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const user = useAuthUser();
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
    } finally {
      router.push("/logout");
      router.refresh();
      setSigningOut(false);
    }
  }
  const workspace =
    path.startsWith("/expense-intel") ||
    path === "/demo" ||
    path === "/account";
  return (
    <div className={workspace ? "af-app" : "af-public"}>
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <header className="af-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Layers2 size={19} />
          </span>
          Aether<span>Flow</span>
          <small>EXPENSE INTELLIGENCE</small>
        </Link>
        <nav aria-label="Main navigation">
          <Link
            className={path === "/expense-intel" ? "active" : ""}
            href="/expense-intel"
          >
            Workspace
          </Link>
          <Link className={path === "/demo" ? "active" : ""} href="/demo">
            Explore demo
          </Link>
          <Link
            className={path === "/how-it-works" ? "active" : ""}
            href="/how-it-works"
          >
            How it works
          </Link>
          {user ? (
            <>
              <Link
                className={path === "/account" ? "active" : ""}
                href="/account"
                title={user.email ?? undefined}
              >
                Hello, {firstName(user)}
              </Link>
              <button
                type="button"
                className="nav-signin"
                onClick={() => void signOut()}
                disabled={signingOut}
              >
                {signingOut ? "Signing out…" : "Sign out"} <LogOut size={14} />
              </button>
            </>
          ) : user === null ? (
            <>
              <Link className={path === "/login" ? "active" : ""} href="/login">
                Sign in
              </Link>
              <Link className="nav-signin" href="/signup">
                Create account <ArrowUpRight size={14} />
              </Link>
            </>
          ) : (
            <span className="nav-signin nav-pending" aria-hidden="true" />
          )}
        </nav>
      </header>
      {workspace && (
        <aside className="workspace-rail" aria-label="Workspace navigation">
          <p className="eyebrow">YOUR WORKSPACE</p>
          <Link href="/expense-intel">
            <LayoutDashboard size={17} /> Expense review
          </Link>
          <Link href="/expense-intel?view=history">
            <FolderClock size={17} /> Import history
          </Link>
          <Link href="/account">
            <ShieldCheck size={17} /> Account & data
          </Link>
          <div className="rail-note">
            <span className="status-dot" /> Every figure is computed from your
            statements
            <p>AI only sorts merchants and words the summaries.</p>
          </div>
        </aside>
      )}
      <div id="content">{children}</div>
      <footer className="af-footer">
        <Link className="brand" href="/">
          AetherFlow<span className="muted"> / Find the money leaking out</span>
        </Link>
        <div>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/data-guide">Data & limitations</Link>
          <Link href="/demo">Try sample workspace</Link>
          <a
            href="https://github.com/pvparekh/aetherflow"
            target="_blank"
            rel="noreferrer"
          >
            Source ↗
          </a>
        </div>
        <small>
          Independent expense intelligence · {new Date().getFullYear()}
        </small>
      </footer>
    </div>
  );
}
