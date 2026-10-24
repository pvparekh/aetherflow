"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Layers2,
  LayoutDashboard,
  FolderClock,
  ShieldCheck,
} from "lucide-react";
export default function Layout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
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
          <Link className={path === "/account" ? "active" : ""} href="/account">
            Account
          </Link>
          <Link className="nav-signin" href="/login">
            Sign in <ArrowUpRight size={14} />
          </Link>
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
            <span className="status-dot" /> Your numbers. Explained.
            <p>
              Computed statistics, reviewable records, and optional AI
              interpretation.
            </p>
          </div>
        </aside>
      )}
      <div id="content">{children}</div>
      <footer className="af-footer">
        <Link className="brand" href="/">
          AetherFlow<span className="muted"> / Make sense of spend.</span>
        </Link>
        <div>
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
