import Layout from "@/components/Layout";
export default function DataGuide() {
  return (
    <Layout>
      <main className="af-width reading">
        <p className="eyebrow">WORK WITH CONTEXT</p>
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
            PDFs up to 20 pages and 4 MB use native text extraction where
            available, with visual extraction through the existing OpenAI
            provider for scanned documents. Results are suggestions, not a
            guarantee of completeness. Poor scans, complex tables, unsupported
            currencies or ambiguous dates may require a CSV export instead.
          </p>
        </section>
        <section>
          <h2>Where data goes</h2>
          <p>
            Account, review drafts, transaction records and analysis are stored
            using Supabase. Descriptions are sent to OpenAI for categorization;
            PDF contents may be sent for extraction. Narrative requests use
            aggregated statistics and vendor summaries. The current version does
            not run inference locally.
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
