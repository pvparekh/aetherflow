# AetherFlow — expense intelligence

AetherFlow helps an individual operator review expense files, inspect transactions and understand spending patterns. It is an expense-review product, not a bank ledger or accounting platform.

Production: https://aetherflow-three.vercel.app/ . The product-upgrade branch is a release candidate until its migration and deployment acceptance checks are complete.

## Workflow

1. Choose a CSV, TXT or PDF and specify amount direction, date order and optional CSV column names.
2. Review a saved draft. Correct descriptions, amounts and dates; explicitly exclude credits, transfers and ambiguous rows. Every PDF candidate starts unselected.
3. Confirm the selected positive USD expenses. Categorization checkpoints at 25 rows. Repeating the same import/settings reuses its draft; commit replay cannot publish it twice.
4. Inspect computed totals, category history, vendor aggregates and review signals. Resolve a signal or correct a category. Category corrections retain source evidence and an audit record, then recalculate deterministic results.
5. Optionally generate AI commentary from aggregates. Provider failure leaves computed results available. Filter transaction rows and export the same matching rows, across all pages.

`/demo` uses labeled synthetic records in browser state and makes no import/analysis requests. Changes in the demo are discarded on reload. It is not a substitute for an authenticated integration test.

## Supported limits

- UTF-8 CSV/TXT; common headers, quoted delimiters/newlines, BOM/CRLF, up to 19 preamble records, custom columns, US decimal format, strict ISO or selected day/month date order.
- Separate debit/credit or a signed-amount convention. Ambiguous double-populated columns and known non-USD currency are excluded. No currency conversion.
- 4 MB, 500 candidate rows and 20 PDF pages. Native text uses page-tagged PDF.js extraction; scanned or mixed pages use visual PDF input through the existing OpenAI provider. Native extraction is capped at five 18,000-character segments. No text is silently truncated into a claimed complete import.
- All PDFs require source review. Extraction completeness and statement reconciliation are unknown; a complex layout, unsupported language or poor scan may require a CSV export. Scanned extraction accuracy has not been measured against real bank statements.
- Extraction attempts are limited to 20 per account per hour and one concurrent extraction. Categorization uses at most three bounded attempts per 25-row checkpoint. Normal import progress survives navigation; unsaved review edits must be saved before leaving the page.

## Analytics contracts

Nine canonical categories, positive expense amounts, 25-row categorization, and code-computed formulas remain. Reviewed amounts and dates cannot be overwritten by model output. Recent averages include the current report and up to four prior category report totals; all-history averages include every recorded report for that category. Reports can have different coverage or overlap. Missing dates are excluded by date filters.

Anomaly signals are review cues, not findings of fraud. Category confidence and optional model commentary are not audited financial assessments. Narrative requests contain precomputed category/vendor summaries, not individual transaction records. Health scoring is retained in storage for compatibility but is not the principal financial metric in the new workspace.

## Development

Use Node 24 (or a supported runtime satisfying PDF.js's Node >=22.3 requirement) and `npm ci`.

Configure these names in a local, ignored environment file:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `OPENAI_API_KEY` (server only)

Use an isolated Supabase database for upgrade testing. Apply `supabase/migrations/20261024_import_review.sql` once using an authorized migration runner before running this branch. It expects the existing uploads, line_items, category_stats and vendors tables; the minimal automated-test schema is **not** a production schema migration.

Run `npm run dev`. Google OAuth and confirmation URLs must allow the candidate origin's `/auth/callback` and existing `/auth/confirm` routes. Do not point an unvalidated preview at production data.

Validation:

```sh
npm run verify
```

This runs TypeScript, ESLint, the full Vitest suite and the optimized build. Tests cover statistical fixtures, import parsing, real PDF text extraction with mocked provider responses, real Postgres transactions/RLS via PGlite, route lifecycle/retry behavior and component interactions. A mocked provider is not an OCR-quality evaluation; PGlite is not a live Supabase deployment test; DOM tests do not certify responsive visual appearance.

## Data and operations

Supabase stores accounts, extracted review evidence, selected expenses, category corrections, aggregates and interpretation. Raw uploaded files are not persisted as downloadable originals. Existing OpenAI services receive descriptions for categorization and PDF content for extraction. Account export includes drafts and correction history; deleting expense data removes both saved reports and unfinished reviews. Account deletion removes the owning auth user and associated rows according to database foreign keys. Verify the existing production cascade contract before releasing.

See [the runbook and acceptance record](docs/product-upgrade/02-release-and-verification.md) for deployment, migration, recovery and rollback instructions. Local-model migration, banking connections, payments, taxes and subscriptions are deferred.
