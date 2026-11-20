import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  CalendarDays,
  Copy,
  Cpu,
  ListChecks,
  MessageCircleQuestion,
  PenLine,
  Repeat,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Upload,
  Wallet,
} from "lucide-react";
import Layout from "@/components/Layout";
import s from "./home.module.css";
import HeroActions from "./HeroActions";

export const metadata: Metadata = {
  title: "AetherFlow | Find the money leaking out of your accounts",
  description:
    "Upload card or bank statements (CSV, TXT or PDF) to see forgotten subscriptions, price increases, duplicate charges and unusual charges, without connecting a bank account. Every number is computed by code.",
};

const FINDS = [
  {
    icon: Repeat,
    title: "Forgotten subscriptions",
    text: "Every recurring charge, with how often it bills, when it bills next and what it costs a year.",
  },
  {
    icon: TrendingUp,
    title: "Price increases",
    text: "Subscriptions and bills that quietly started charging more, with the old and new price.",
  },
  {
    icon: Copy,
    title: "Duplicate charges",
    text: "The same merchant charging the same amount twice within a few days.",
  },
  {
    icon: TriangleAlert,
    title: "Unusual charges",
    text: "Charges far above what that merchant, or that kind of spending, normally costs you.",
  },
  {
    icon: CalendarDays,
    title: "Upcoming-charges calendar",
    text: "See what is due next, and add it to your own calendar as an .ics file.",
  },
  {
    icon: PenLine,
    title: "Cancel and negotiate drafts",
    text: "A cancellation message or a negotiation call script built from your own numbers. You send it.",
  },
  {
    icon: Wallet,
    title: "Budgets",
    text: "Set a monthly limit per category and see where each one stands.",
  },
  {
    icon: MessageCircleQuestion,
    title: "Ask your spending",
    text: "Ask “How much did I spend on software this year?” and get an answer from a query run on your own data.",
  },
];

const STEPS = [
  {
    icon: Upload,
    title: "Upload statements",
    text: "CSV, TXT or PDF exports from your card or bank. Review the rows before they are imported.",
  },
  {
    icon: ListChecks,
    title: "Categorise",
    text: "Merchant rules and your own history first; a language model only for what is left.",
  },
  {
    icon: Calculator,
    title: "Compute and report",
    text: "Code finds recurring charges, price changes, duplicates and outliers, and totals them.",
  },
];

export default function Home() {
  return (
    <Layout>
      <main>
        <section className={`af-width ${s.hero}`}>
          <div>
            <p className="eyebrow">
              <span className="status-dot" /> LEAK FINDER &middot; NO BANK LOGIN
            </p>
            <h1 className={s.title}>
              Find the money
              <br />
              <em>quietly leaving your accounts.</em>
            </h1>
            <p className="hero-lead">
              Upload a few months of card or bank statements. AetherFlow lists
              your subscriptions, price increases, duplicate charges and
              unusual charges, each with a dollar figure you can trace back to
              the transactions behind it.
            </p>
            <HeroActions />
            <p className="micro">
              Works with CSV, TXT and PDF statements. The demo uses 12 months
              of synthetic data and runs in your browser.
            </p>
          </div>

          <aside className={s.panel} aria-labelledby="report-heading">
            <p className="eyebrow" id="report-heading">
              WHAT A LEAK REPORT SHOWS
            </p>
            <ul>
              {FINDS.slice(0, 4).map(({ icon: Icon, title, text }) => (
                <li key={title}>
                  <span className={s.panelIcon}>
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </section>

        <section className={s.trust} aria-labelledby="trust-heading">
          <div className={`af-width ${s.trustInner}`}>
            <ShieldCheck size={22} aria-hidden="true" className={s.trustIcon} />
            <div>
              <h2 id="trust-heading" className={s.trustTitle}>
                Every number is computed by code.
              </h2>
              <p>
                AI only categorises transactions, extracts rows from PDFs and
                words summaries and drafts. Its wording is checked against the
                computed numbers before you see it, and replaced by a template
                if anything does not match.
              </p>
            </div>
            <div className={s.trustAside}>
              <Cpu size={18} aria-hidden="true" />
              <p>
                Runs on a free local or open-weights model, so no paid AI API
                is needed.
              </p>
            </div>
          </div>
        </section>

        <section className="af-width editorial-section" aria-labelledby="finds-heading">
          <div className="section-heading">
            <h2 id="finds-heading">
              See the small charges
              <br />
              <em>that add up over a year.</em>
            </h2>
            <p>
              Leaks hide in long statements: a trial that became a plan, a bill
              that crept up, a charge that went through twice. AetherFlow puts
              them on one page.
            </p>
          </div>
          <div className={s.finds}>
            {FINDS.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <Icon size={21} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`af-width ${s.how}`} aria-labelledby="how-heading">
          <div className={s.howHead}>
            <p className="eyebrow">HOW IT WORKS</p>
            <h2 id="how-heading">Three steps, no bank login.</h2>
          </div>
          <ol className={s.steps}>
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title}>
                <div className={s.stepTop}>
                  <Icon size={20} aria-hidden="true" />
                  <span>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          <Link className="text-link" href="/how-it-works">
            See the pipeline, design decisions and eval results &rarr;
          </Link>
        </section>

        <section className="af-width closing-section">
          <div>
            <h2>
              Explore a full year
              <br />
              <em>of sample statements.</em>
            </h2>
          </div>
          <div>
            <Link className="btn primary" href="/demo">
              Try the demo, no sign-up needed <ArrowRight size={17} />
            </Link>
            <p className="micro">
              Recurring charges need at least 2 to 3 months of statements to
              detect; annual subscriptions need 12. Nothing here is tax or
              financial advice.
            </p>
            <Link className="text-link" href="/data-guide">
              File support, data handling and limitations &rarr;
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
