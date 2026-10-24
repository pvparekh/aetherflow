# Candidate release and verification record

## Status

Implemented product-upgrade candidate; **not approved for production release**. The prior availability repair remains the production baseline at `18340abd3ea3929d0dfd6496675bd311fd330264`. No production alias or environment variables were changed in this upgrade. On October 24, 2026, the additive import-review migration was applied to the existing pre-launch Supabase database at the owner's direction; the application has not been promoted to production.

Repository: `pvparekh/aetherflow`. Branch: `feat/product-upgrade`. The exact candidate is the PR head commit, verified by CI's `GITHUB_SHA` and the source tree comparison. Tests run from this branch must pass again after any source change.

Expected hosting target (from the repaired baseline): Vercel project `prj_Zv0myAz0ZlkZVYbRWvyOlyvFz8QS`, team `team_RqhGfIKp7itis9JGF7WAfKXw`; public production alias `aetherflow-three.vercel.app`. Current project configuration cannot be refreshed: the connector returns a team-authorization 403. Do not infer the current deployment or Node version from these historical identifiers.

## Implemented release scope

- Cohesive landing, sign-in/signup, confirmation/callback, workspace, import/review, transaction source details, category corrections, signal decisions, vendors, history, all-time view, account/data management, useful 404/error views and an isolated synthetic demo.
- CSV preamble/header mapping, UTF-8/BOM, quoted delimiters/newlines, strict dates and US-decimal money, debit/credit interpretation, unsupported-currency warnings, source evidence and explicit inclusion.
- PDF.js native extraction with page provenance and bounded segments. Sparse/mixed pages use the existing provider's visual PDF input. Native evidence and amounts are checked against source text; every PDF candidate starts unselected. Completeness and reconciliation remain unknown.
- Persisted review checkpoints, optimistic concurrency, 25-row categorization checkpoints, atomic final transaction publication, replay safety, account write leases, bounded extraction attempts and recovery for interrupted analytics.
- Category correction audit and source preservation. Statistics remain computed in TypeScript and are persisted atomically. Vendor snapshots rebuild from records instead of incrementing a counter on retry. Historical narratives are invalidated after material changes.
- Explicit model-interpretation generation, full nested output validation, bounded provider calls and stale-run protection. Provider failure does not erase deterministic results.
- Filtered CSV export uses the same matching rows as transaction exploration, across all pages, with quoting and spreadsheet-formula protection. Full account export also includes review drafts and category corrections.

## Evidence and acceptance matrix

| Check                                                 | Evidence                                                                                                                                                                   | Status                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Original statistical formulas                         | Existing 49 pure statistical tests retained                                                                                                                                | Pass, local                                                      |
| Repaired auth middleware                              | Existing six cookie/deadline/public-route tests retained; middleware unchanged                                                                                             | Pass, local                                                      |
| Parser boundaries                                     | CSV/TXT fixtures: quoted data, preambles, credits, invalid dates/money/currency, row limits, formula escaping                                                              | Pass, local                                                      |
| Native PDF text and page coverage                     | Real two-page synthetic PDF and sparse PDF; real PDF.js; provider transport/output mocked                                                                                  | Pass for these fixtures                                          |
| Live OCR/extraction quality                           | No authorized real-provider test configuration or representative statement corpus available                                                                                | Not tested; no precision/recall claim                            |
| Atomic publication and RLS                            | Real Postgres/PGlite migration tests: replay, cursor/run rejection, ownership, service-only RPC, correction audit, vendor snapshot and deletion                            | Pass, local fixture schema                                       |
| Route lifecycle                                       | Preview → save/exclude → categorize → atomic publish → actual statistics/vendor functions; second-checkpoint provider failure → resume; unauthorized/other-owner rejection | Pass, local Postgres adapter and mocked provider                 |
| Connected UI interactions                             | Actual React components: isolated demo, filter/details, reversible decisions, first import, failed fetch/narrative/resolution, incomplete analytics                        | Pass, DOM interaction tests                                      |
| Static/types/lint/build                               | `npm run verify`: TypeScript, zero-warning ESLint, full Vitest, optimized Next build                                                                                       | Pass, local candidate; see CI for exact remote SHA               |
| Production-build HTTP                                 | `node scripts/http-smoke.mjs`: public routes and unauthorized APIs under synthetic auth configuration                                                                      | Pass locally when accompanying log reports all expected statuses |
| Browser visual/keyboard/mobile                        | Cloud browser could not reach local server (`ERR_CONNECTION_REFUSED`)                                                                                                      | Blocked; DOM tests are not visual QA                             |
| Live Supabase migration / existing-data compatibility | Applied `import_review` on October 24, 2026; verified new tables, six RPCs, service-role execute grants and schema cache reload. Existing rows were preserved. | Installed; full live workflow not yet tested |
| Live auth/OAuth/confirmation                          | Provider configuration and test-account flow unavailable                                                                                                                   | Not tested                                                       |
| Candidate deployment/build/runtime                    | Vercel team authorization 403                                                                                                                                              | Blocked; READY alone would not count as acceptance               |
| Production release and post-release smoke             | Not requested for this redesign                                                                                                                                            | Not performed                                                    |

The suite currently contains 88 tests. Updated CI output, rather than this static count, is authoritative after subsequent changes. This is internal engineering evaluation, not representative user research or accessibility certification.

## PDF decision and measured limits

The old `pdf-parse` dependency rejected the generated valid native statement with `bad XRef entry`. The installed PDF.js 5.4.296 successfully extracts both pages and the sparse fixture. The new runtime path uses PDF.js as a server external package, following Mozilla's [Node example](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs). Its Apache-2.0 license and installed Node dependency avoid introducing a separate worker service. The legacy parser code remains outside the new upload route for compatibility with existing internal callers.

pypdf/pdfplumber and Docling are not measured in this release. They would require a Python deployment path, and Docling OCR/model/runtime costs require separate evaluation. No claim is made that the selected extractor outperforms them. Visual PDF extraction sends the document to the same existing OpenAI service, not a new provider. The local-model migration is deferred.

Actual local test evidence: two native pages transmitted with page markers; two expected mocked transaction records matched their printed evidence; all PDF rows unselected; sparse input selected the visual transport; invalid files, unsupported amounts, unmatched evidence and incomplete provider responses rejected. Scanned field accuracy, real-statement recall, latency and token costs are **not measured**. Complex layouts, encrypted/unsupported documents or extraction failure need a clearer source or CSV. A failed extraction never publishes a partial success.

## Migration and staging procedure

1. Provision or identify an authorized **isolated** Supabase environment with the existing schema. Do not use the minimal `test-schema.sql` as a real application schema.
2. Back up the environment. Inspect real enum/numeric/FK/index definitions and existing-data compatibility. Confirm account deletion cascades and existing baseline grants. Apply `20261024_import_review.sql` once through the normal migration runner; it runs as an additive migration and is not an idempotent arbitrary SQL script.
3. Verify its new tables' RLS and service-only RPC grants. Test with two distinct real test users. Service-role credentials stay server-side.
4. Configure preview credentials separately from production. Check URL/anon key pairing, service key ownership, provider key, Node >=22.3 (Node 24 used locally), and function duration support for preview=300 seconds / commit=120 seconds / narrative=60 seconds. PDF.js must remain external with its package/worker assets available.
5. Configure Supabase email and Google redirects for `/auth/callback` and `/auth/confirm` at the candidate origin. Exercise signup confirmation, valid login, expired link, logout and session refresh.
6. Deploy the exact verified source SHA to preview. Repeat file/review/retry/correction/delete/export tests against real persistence. Use synthetic documents and an owned test account. No production or employer financial documents are needed.
7. Complete visual checks at 320, 390, 768, 1024 and 1440 pixels, phone landscape, 200% zoom and reduced motion. Inspect empty/dense/review/error/account states, keyboard focus, native-dialog focus return, internal table overflow and long amounts/merchants. Measure browser lab Web Vitals separately from local HTTP timings.
8. Inspect preview build/runtime evidence and record the exact deployment/SHA. Only after these pass and production release is explicitly authorized should migration/deployment promotion proceed.

## Recovery and diagnostics

- A draft is private to its owner. `review` permits edits until categorization starts. `processing` uses a run ID and optimistic claim; after 90 seconds a stale import claim can be retried. Each categorizer request has a 20-second deadline, up to three attempts, and 25 rows.
- A completed chunk persists its classification and cursor. The next request starts after that cursor. A provider/schema failure marks the draft `error`; Resume continues saved progress instead of reclassifying published rows.
- Publication creates the upload and all selected line items in one database transaction. Processing analytics is a separate, visible stage. A failed stage is recoverable through the report's Retry computed analysis or saved review. It is never displayed as clean statistics.
- Account writes serialize with a five-minute lease. After an abrupt runtime termination, retry after expiry. The release environment must keep function duration below the lease. Leases use tokens so a stale runner cannot release a newer lease.
- Narratives are claimed independently and bound to a run ID; corrected/deleted/history-changing data invalidates old runs. Optional commentary can be retried after provider recovery.
- Extraction attempts are charged before model use and limited to 20/account/hour. A failed parse counts. One account extraction runs at a time. Exact replay of an existing draft does not call the provider.
- Logs use operation labels, IDs, counts and sanitized error codes, not document bodies/model outputs. Diagnose a stuck draft through owner/status/cursor/run/updated_at. Do not paste source evidence into logs.
- Delete report/data operations are deliberate and atomic at the database boundary. A failed deletion recalculation can be repaired by retrying the same delete request. Account deletion uses the established auth-admin cascade and must be checked in staging.

## Rollback

Keep known-good production deployment `dpl_Gdp1GoF8BrPX724U6U6GztXS7Ffh` (historical repair deployment; revalidate availability before release). The migration is additive: old code can continue using established tables, but it does not understand unfinished drafts or new audit metadata. Do not drop new tables during rollback or delete original financial records. Preserve drafts and correction history for forward recovery.

If an authorized release regresses availability, restore the prior deployment/alias and investigate with the preserved data. App rollback does not undo category corrections or deleted records. Restore actual backups only under a deliberate data-recovery procedure; do not apply destructive down migrations automatically.

## Remaining release gates

Team access renewal, real authenticated/provider import/retry walkthrough, existing-data compatibility verification and browser visual acceptance are required before calling this production-ready. The migration has been applied to the shared pre-launch database without a separate isolated database as explicitly authorized; this increases the importance of preserving backups and proving old-report compatibility before release. The regular production service remains repaired and untouched. GitHub Review Bot is handled separately after this candidate; it cannot be used as proof of AetherFlow's acceptance. Local inference and unrelated accounting-platform features remain deferred.

## October 24, 2026 follow-up — shared Supabase migration and UI recovery

The owner authorized use of the existing pre-launch production Supabase project for candidate testing (no isolated copy). The exact additive SQL in `supabase/migrations/20261024_import_review.sql` was applied through Supabase's migration runner and recorded as migration `20261024210606_import_review`. Afterward, a read-only inspection confirmed the four new tables, six principal import/rebuild RPCs and their service-role execute permissions; a PostgREST schema-cache reload was requested. Existing records remained: 11 uploads, 164 line items, 50 category-stat rows and 75 vendor rows, observed immediately before installation. This is schema validation, **not** a successful live upload, OCR, categorization or computed-analysis acceptance test.

A follow-up patch on `feat/product-upgrade` adjusts default report selection to prefer completed uploads, keeps failed saved-review discovery from masquerading as a failed new import, hides stale workspace results during the import flow, and centers the workspace on wide screens while retaining mobile breakpoints. New component tests cover the interrupted-report choice and nonblocking review-list failure. Obtain the exact final PR head SHA and CI result before release; any later source change invalidates earlier build evidence.

Vercel access for the `pvparekhs-projects` team remains blocked by a team-authorization 403. The preview deployment, authenticated end-to-end workflows and responsive browser QA remain unverified. Do not assert that the screenshot's import/rebuild error is resolved until a user/test-account session confirms the actual API responses. The legacy data includes errored or processing uploads; those may require explicit user-initiated rebuild after verifying which records are appropriate to recover.
