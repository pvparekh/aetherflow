# Workstreams

Phase 0 (done, commit on `feat/leak-finder`): model layer `src/lib/llm/`, contracts `src/lib/expense-intel/contracts.ts`, baseline `normalize/`, `txns.ts` (`loadUserTxns`), migration `20261116_leak_finder.sql`, these docs.

Phase 1 runs workstreams A to F in parallel, each in its own worktree branch. Phase 2 builds the UI on the merged result. Phase 3 verifies end to end.

## Rules for every agent

1. Read `CLAUDE.md`, `docs/leak-finder/00-brief.md` and `01-architecture.md` first.
2. Edit only the paths your workstream owns. Anything else you need changed: stop and report it. `contracts.ts` and `src/lib/llm/` are read-only; if a contract is missing a field, add an optional field and say so in your report.
3. Never apply migrations to Supabase, never call a live database, never call a paid API. Tests use PGlite (`src/lib/imports/test-schema.sql` plus the migrations) and mock `@/lib/llm` with `vi.mock`.
4. Ollama may not be installed. Code must not need it to pass tests.
5. Isomorphic modules (`normalize/`, `leaks/`, `ask/` executor, `actions/` data, `demo/`) import nothing server-only, so the demo can run them in the browser.
6. No new npm dependency without a strong reason stated in your report.
7. Before finishing, all of these pass: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`. Commit on your branch with clear messages.
8. Report: what you built, file list, test count, anything you could not do, any contract change.
9. Plain-English user-facing text. No statistics jargon in the UI or in model prompts' output rules ("z-score", "standard deviation", "baseline").

## A. Categorisation quality

Owns: `src/lib/expense-intel/normalize/`, `src/lib/expense-intel/pass1/`, `src/lib/expense-intel/rules/` (new), `src/lib/imports/pdf.ts`, `src/lib/expense-intel/parser/index.ts`, `src/app/api/imports/[id]/commit/route.ts`, `src/app/api/expense-intel/correct/route.ts`, `src/lib/imports/access.ts`.

Build:

1. Extend `vendorKey`/`displayVendor` (prefixes, aliases, city and state stripping) with a table-driven test of at least 60 raw descriptors.
2. `rules/`: `resolveFromRules(txns, rules)` and a history vote (majority category per `vendorKey` across the user's already-categorised rows, at least 2 votes and at least 75% agreement). Server functions to load and upsert `merchant_rules`. A category correction upserts a `correction` rule for that vendor key.
3. Categoriser through `completeJson`: ID-keyed output schema (`{"items":[{"id": <enum of input ids>, "category": <enum of 9>, "subcategory": string, "vendor": string}]}`), every input ID exactly once. Drop self-reported confidence; set `confidence` from the path (rule 1.0, history 0.9, model 0.7, ladder fallback 0). Failure ladder: one retry, then halve the batch, then single items, then `Misc` with subcategory "Needs review". `BATCH_SIZE` stays 25 for now; make it a parameter so evals can test 10.
4. Commit route: resolve rules and history first, send only unresolved rows to the model, record `category_origin` (`rule`, `history`, `model`, `fallback`).
5. PDF text extraction through `completeJson`. Visual path: keep OpenAI `input_file` only when the provider is OpenAI; otherwise a clear error suggesting CSV or a text PDF.
6. `access.ts`: map `LlmUnavailableError` (including `billing_not_active`) and an unreachable local model to clear, actionable messages.

Accept: existing import lifecycle tests still pass; new tests cover the ladder, ID validation, rules-first resolution, and correction-to-rule.

## B. Leak engine

Owns: `src/lib/expense-intel/leaks/` (new), `src/app/api/expense-intel/leaks/route.ts` (new), `src/app/api/expense-intel/calendar/route.ts` (new).

Build:

1. `buildLeakReport(txns: Txn[], today: string): LeakReport` exactly per `contracts.ts`. Pure, deterministic, isomorphic.
2. Recurring detection by `vendorKey`: cadence from median interval (weekly 7, biweekly 14, monthly 28 to 31, quarterly about 91, annual about 365) with tolerance; amounts within 15% of the stream median, or a step change (price change) that persists; at least 3 charges (2 for annual). Next expected date, annual cost, `possibly_cancelled` when overdue by more than half a cycle plus 7 days. Must not flag rent-like or grocery-like irregular vendors as subscriptions just because they repeat.
3. Price changes: a persistent step in a stream's amount (at least 2 consecutive charges at the new level, or the latest charge for annual), reported with annualised impact.
4. Duplicates: same `vendorKey` and amount within 3 days, excluding expected recurring charges.
5. Unusual charges: robust score (median and MAD) on log amounts against the vendor's own history when it has at least 5 charges, else the category; ignore recurring streams. Plain-English reasons.
6. `toIcs(report, appName)`: RFC 5545 calendar of upcoming expected charges (next 12 months), stable UIDs.
7. Routes: `GET /api/expense-intel/leaks` (auth via `importAccess`, data via `loadUserTxns`, `Cache-Control: no-store`) and `GET /api/expense-intel/calendar` returning `text/calendar` with an attachment filename.

Accept: fixtures covering each detector including negatives (irregular groceries, rent, a cancelled subscription, an annual renewal, a price increase, a true duplicate, a recurring charge that is not a duplicate).

## C. Narrative, drafts and the cancel guide

Owns: `src/lib/expense-intel/ai/`, `src/lib/expense-intel/actions/` (new), `src/app/api/expense-intel/pass2/route.ts`, `src/app/api/expense-intel/drafts/route.ts` (new).

Build:

1. Narrative (`pass2.ts`) through `completeJson` with a strict JSON schema mirroring `Pass2Result`.
2. `checkFaithfulness(text, facts)`: every money amount, percentage and count in the narrative must match a value in the supplied context within rounding; vendor and category names must be in the allowed set. On failure: one regeneration, then `templateNarrative(context)` with `source` marked. Unit-test both.
3. Cancel guide data (`actions/cancel-guide.ts`): about 40 common consumer and business subscriptions, each with vendor key patterns, plain steps, and an official cancellation or account URL. Include a URL only if you fetched the page and confirmed it is the vendor's own account or cancellation page; otherwise `null`. Record the check date.
4. `draftCancellation(stream, guideEntry)` and `draftNegotiation(stream, priceChange)` returning `Draft`. Facts (amounts, dates, annual cost) are filled by code; the model writes only the wording, and the faithfulness check applies. Template fallback for both.
5. `POST /api/expense-intel/drafts` with `{ kind, streamKey }`: loads txns, builds the leak report, finds the stream, returns a `Draft`.

Accept: tests for the checker (true and false cases), template outputs, guide lookup, and route auth.

## D. Ask your spending

Owns: `src/lib/expense-intel/ask/` (new), `src/app/api/expense-intel/ask/route.ts` (new).

Build:

1. `AskQuery` type and JSON schema: metric (`sum`, `count`, `average`, `max`, `list`), group by (`none`, `category`, `vendor`, `month`), filters (categories, vendor text, date range, amount range, recurring only), sort, limit (max 50). Export it from `ask/types.ts`.
2. `runQuery(txns, query, report?)`: pure, isomorphic executor returning rows and matching transactions.
3. `translateQuestion(question, context)`: model maps the question to an `AskQuery` (context: today's date, category list, top vendor names, date span). Reject out-of-scope questions (advice, anything not about this data) with a polite canned answer.
4. Answer: phrase the result with a template from the computed rows. Optionally let the model phrase it, checked by C's `checkFaithfulness` (import it; if C's module is not there yet, keep template-only and say so).
5. `PRESET_QUESTIONS`: 6 questions with their hand-written `AskQuery`, used by the demo with no model.
6. `POST /api/expense-intel/ask` with `{ question }`, rate-limited per user (simple in-memory window is fine), max 300 characters.

Accept: executor tests for every metric and grouping; translation tests with a mocked model including invalid output and out-of-scope questions.

## E. Evals and demo data

Owns: `evals/` (new), `src/lib/demo/` (new), `package.json` scripts only (`eval`, `eval:ci`), `.github/workflows/quality.yml`.

Build:

1. `src/lib/demo/`: deterministic generator (seeded) for one persona, a freelance designer, over the 12 months ending 2026-10-31: about 600 transactions, realistic raw bank descriptors (processor prefixes, store numbers, cities), 10 to 14 subscriptions (one annual, one price increase, one cancelled mid-year, one forgotten small one), one true duplicate, two unusual charges, irregular groceries and rent-like vendors as negatives. Export `demoTxns(): Txn[]` and `demoLineItems(): LineItem[]`.
2. Golden set `evals/golden/categorize.jsonl`: at least 200 labelled rows (raw descriptor, amount, expected category, expected display vendor), stratified with at least 15 per category, including hard cases. Label carefully; explain ambiguous choices in a `notes` field.
3. Harness `evals/run.ts` (`npm run eval`): runs the real categoriser (through rules and model) against the configured provider; writes a run into `evals/results/latest.json` per `EvalReport`; computes accuracy, macro F1, per-category precision and recall, schema-valid rate, abstain rate, share resolved without the model, latency p50 and p95. Optional `--batch 10`.
4. `npm run eval:ci`: deterministic checks only (golden set well-formed, normaliser accuracy on golden display vendors, demo data invariants, leak engine finds the planted leaks once B lands). Wire into the existing quality workflow.
5. Commit a placeholder `evals/results/latest.json` with `runs: []`.

Accept: generator is deterministic (same output twice); golden set validates; `eval:ci` passes.

## F. Budgets, tags and notes

Owns: `src/lib/expense-intel/budgets/` (new), `src/app/api/expense-intel/budgets/route.ts` (new), `src/app/api/expense-intel/transactions/[id]/route.ts` (new).

Build:

1. `budgetProgress(txns, budgets, month)`: spent, target, remaining, projected month-end (linear), status (`under`, `near` at 85%, `over`). Pure and isomorphic.
2. Budgets route: `GET` list with current-month progress, `PUT` upsert `{ category, monthly_target }`, `DELETE` by category. Ownership enforced; categories validated against `CATEGORIES`.
3. Transaction route: `PATCH { tags?: string[], note?: string | null }` with limits (10 tags, 24 characters each, lowercase; note at most 500 characters), ownership checked through the upload.
4. PGlite tests including a second user who must not read or write the first user's rows.

Accept: tests for progress math, validation, and ownership.

## Phase 2: UI (after merge)

New view components under `src/components/workspace/views/`, wired into `Workspace.tsx` by one agent at a time: Leaks overview (headline "found $X a year" and cards), Subscriptions (list, calendar, `.ics` download, draft buttons), Budgets, Ask, transaction tags and notes, a public "How it works" page with the pipeline diagram and the eval scoreboard, a refreshed landing page, and the demo switched to the 12-month dataset.

## Phase 3: verification

Full `npm run verify`; local run against Ollama with a real upload of the sample CSVs; browser walkthrough of demo and signed-in flows at desktop and mobile widths; eval run recorded; case study updated with measured results.
