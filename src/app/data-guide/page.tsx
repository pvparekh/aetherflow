import Layout from "@/components/Layout";
export default function DataGuide() {
  return (
    <Layout>
      <main className="af-width reading">
        <p className="eyebrow">DATA GUIDE</p>
        <h1>
          Data, formats
          <br />
          <em>and limitations.</em>
        </h1>
        <section>
          <h2>What this application does</h2>
          <p>
            AetherFlow is an expense-review tool, not a bank ledger or
            tax-advice service. Its analytics include positive, confirmed USD
            expenses. Deposits, refunds, transfers and ambiguous statement rows
            need review and are excluded unless explicitly confirmed as
            expenses.
          </p>
        </section>
        <section>
          <h2>Supported imports</h2>
          <p>
            CSV and TXT files up to 4 MB and 500 candidates. CSVs support common
            description, date, amount and debit/credit headers, with column and
            date-format settings. Review missing dates and amount direction
            before publication.
          </p>
          <p>
            PDFs up to 20 pages and 4 MB are read as text, and a language
            model turns that text into rows for you to confirm. Scanned PDFs
            need a model that accepts files, which the live site does not use,
            so export a CSV from your bank instead. Results are suggestions, not
            a guarantee of completeness. Poor scans, complex tables, unsupported
            currencies or ambiguous dates may require a CSV export instead.
          </p>
        </section>
        <section>
          <h2>Where data goes</h2>
          <p>
            Account, review drafts, transaction records and analysis are stored
            using Supabase. Merchant descriptions that your rules and history
            don&apos;t already recognise are sent to an open-weights language
            model (Llama 3.3 on Cloudflare Workers AI) for categorisation, and
            PDF text is sent to it for row extraction. Summaries and drafts are
            written from totals that code has already computed. Every figure
            you see is calculated by code, never by the model.
          </p>
          <p>
            Raw source files are processed for extraction rather than stored as
            downloadable originals. Drafts retain extracted evidence and
            corrections. Your account tools provide export and deletion
            controls. Platform logs and provider retention follow their
            respective configurations and policies; this page does not promise
            zero retention.
          </p>
        </section>
        <section>
          <h2>Interpret results carefully</h2>
          <p>
            Anomaly signals are statistical review cues, not proof of fraud or
            error. Historical comparisons are across uploads, which may cover
            different periods. AI explanations and scores are model
            interpretations, not an audited financial assessment. Missing dates
            and incomplete source coverage limit comparisons.
          </p>
        </section>
      </main>
    </Layout>
  );
}
