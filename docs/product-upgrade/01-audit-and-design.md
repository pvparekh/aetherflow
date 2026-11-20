# Product upgrade: contract, audit and design

Baseline: production 18340abd3ea3929d0dfd6496675bd311fd330264.

## Preservation matrix

| Capability      | Contract                                     | Acceptance                                                                  |
| --------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| Availability    | Public HTML independent of Auth              | Existing six middleware tests retained                                      |
| Categories      | Nine canonical strings; 25-row model batches | Model cannot change reviewed amount/date; category validation               |
| Statistics      | Arithmetic in code; history across uploads   | Existing 49 golden tests retained; recomputation idempotent                 |
| Narrative       | Pre-aggregated context only                  | Explicit generation/retry, validated response, atomic claim                 |
| Imports         | CSV/TXT/PDF                                  | Persisted review, page-aware extraction, explicit exclusions, atomic commit |
| History/account | Read, export, deletion                       | Existing routes and ownership checks retained                               |

## Findings

P0: upload published before review; model-authoritative amounts; duplicate narrative invocations; ignored database errors.
P1: PDF first-12000-character truncation; no scan path; ambiguous dates; partial records; CSV formula injection; stale dashboard responses.
P2: fragmented navigation, nonexistent policy destinations, false testimonial, no transaction explorer and no shared filter/export scope.

## Scope

Expense intelligence, not accounting. Statement candidates retain credit/transfer direction during review; only confirmed positive outflows enter the existing engine. No local-model migration, banking integration, currencies conversion or new subscriptions. Historical records retain existing semantics.

## Direction comparison

A. Warm editorial ledger: neutral paper, forest accent, serif display, precise numeric typography. Strong visual identity and comfortable expense review. Selected.
B. Compact analytical console: cool monochrome and tightly packed controls. Efficient but risks density for occasional users.
C. Dark workspace: restrained dark surfaces and bright accent. Viable but less suitable for comparison with white source documents.
These are design judgments, not representative user-study findings. Reference principles: Linear hierarchy; Stripe scope-preserving drilldown; Mercury synchronized charts/tables; QuickBooks mapping and review; Ramp actionable flags; Polaris collection controls; Notion views; Figma components; Material states; Carbon table density. Full source ledger is in the owner's prompt pack.

## Information architecture

Public landing → isolated sample workspace or sign-in → overview/transactions/review/vendors/history → account. Review is a persisted stage before publication. Selection and filters affect visible rows and exports together. Source and analysis state remain visible.

## States

Every fetch: loading, success, empty, failed with retry. Imports: extracting, review, saving, committing, complete/error; selection/correction persisted before commit. Narrative: pending, processing with lease, complete, retryable error. A model failure cannot erase deterministic results.

## Release boundary

Additive database migration must be applied to an isolated test database and then the authorized environment. Production credentials and a migration executor are not present locally. SQL fixture tests are not live Supabase validation. Current production stays untouched until exact-build verification and release authorization.
