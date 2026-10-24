import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  FileText,
  SlidersHorizontal,
  ScanLine,
  Check,
  ShieldCheck,
} from "lucide-react";
import Layout from "@/components/Layout";
export default function Home() {
  return (
    <Layout>
      <main>
        <section className="hero af-width">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="status-dot" /> CLARITY, DOWN TO THE TRANSACTION
            </p>
            <h1>
              Your expenses.
              <br />
              <em>A clearer picture.</em>
            </h1>
            <p className="hero-lead">
              From scattered files to a considered view of your spending. Review
              your records, understand what changed, and keep the details within
              reach.
            </p>
            <div className="button-row">
              <Link className="btn primary" href="/signup">
                Open your workspace <ArrowUpRight size={17} />
              </Link>
              <Link className="btn subtle" href="/demo">
                Explore with sample data <ArrowRight size={17} />
              </Link>
            </div>
            <p className="micro">
              CSV · TXT · PDF review &nbsp; / &nbsp; USD expense analytics
            </p>
          </div>
          <div
            className="hero-product"
            aria-label="Illustrative sample expense workspace"
          >
            <div className="preview-top">
              <span className="brand-mark">
                <ScanLine size={16} />
              </span>
              <strong>Spending overview</strong>
              <span className="pill">SAMPLE DATA</span>
            </div>
            <div className="preview-scope">
              <span>October 2026</span>
              <SlidersHorizontal size={14} />
            </div>
            <div className="preview-total">
              <span>Total reviewed expenses</span>
              <strong>
                $8,426<span>.50</span>
              </strong>
              <p>
                <span className="positive">↓ 8.2%</span> vs. previous sample
                period
              </p>
            </div>
            <div className="preview-bars">
              {[30, 55, 39, 65, 50, 80, 62, 41, 71, 50, 91, 68].map((h, i) => (
                <div key={i} style={{ height: h + "%" }} />
              ))}
            </div>
            <div className="preview-days">
              <span>01 OCT</span>
              <span>15 OCT</span>
              <span>31 OCT</span>
            </div>
            <div className="preview-note">
              <span className="note-icon">
                <Check size={14} />
              </span>
              <div>
                <strong>Everything has a source.</strong>
                <p>Trace a total back to the transactions behind it.</p>
              </div>
            </div>
          </div>
        </section>
        <div className="principles-strip">
          <div className="af-width">
            <span>DESIGNED FOR THE DETAILS</span>
            <p>Review before import</p>
            <p>Statistics computed in code</p>
            <p>Insights you can question</p>
          </div>
        </div>
        <section className="af-width editorial-section">
          <div className="section-heading">
            <p className="eyebrow">A MORE USEFUL MONTH-END</p>
            <h2>
              Less deciphering.
              <br />
              <em>More understanding.</em>
            </h2>
            <p>
              Bring your expense exports into one workspace. Keep the original
              context, resolve uncertainty, and explore the numbers at your
              pace.
            </p>
          </div>
          <div className="feature-grid">
            {[
              {
                icon: FileText,
                n: "01",
                title: "Start with your records",
                text: "Import a CSV, text file, or PDF. Preview extracted rows, correct meaningful details, and choose what belongs in your expenses.",
              },
              {
                icon: SlidersHorizontal,
                n: "02",
                title: "Find the signal",
                text: "Explore vendors, categories, and unusual charges. Filters keep your totals, transactions, and exports aligned.",
              },
              {
                icon: ShieldCheck,
                n: "03",
                title: "Keep your judgment",
                text: "Reviewable suggestions sit alongside computed statistics. A flag is a reason to investigate, not a verdict.",
              },
            ].map(({ icon: Icon, ...f }) => (
              <article key={f.n}>
                <div className="feature-top">
                  <Icon size={23} />
                  <span>{f.n}</span>
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="af-width closing-section">
          <div>
            <p className="eyebrow">A GOOD PLACE TO START</p>
            <h2>
              Make your next
              <br />
              <em>expense review easier.</em>
            </h2>
          </div>
          <div>
            <Link className="btn primary" href="/demo">
              Take a look inside <ArrowUpRight size={17} />
            </Link>
            <p className="micro">
              No account needed for the isolated sample workspace.
            </p>
            <Link className="text-link" href="/data-guide">
              Understand file support and data handling →
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
