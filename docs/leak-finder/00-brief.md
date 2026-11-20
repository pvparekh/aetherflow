# Leak finder: product brief

Status: signed off by the owner on 2026-11-15. Branch: `feat/leak-finder` (built on `feat/product-upgrade`, draft PR 3).

## What it is

Aether Flow finds the leaks in your spending. Upload a few months of card or bank statements (CSV, TXT or PDF). See every subscription, duplicate charge, price increase and unusual charge, with a dollar total. No bank login.

It absorbs the subscription, bill and insight features of consumer tools like Rocket Money that work without a live bank feed, and turns their paid human services (cancellation, bill negotiation) into AI-drafted messages the user sends themselves.

## Goal and audience

Primary goal: a portfolio-grade product that signals production AI engineering and product judgment to recruiters, hiring managers and engineers. Secondary goal: stay ready to monetise.

| Viewer | Surface | What they must take away within 90 seconds |
| --- | --- | --- |
| Recruiter, non-technical | Live demo (no signup), short video | A real, polished product with a one-line value |
| Hiring manager | Case study document | Researched the market, chose a scope, measured outcomes |
| Engineer | Repo, "How it works" page, eval scoreboard | Constrained model outputs, fallbacks, evaluation in CI, data integrity |

## Scope

In:

1. Model layer: local Ollama (development, evals) and a hosted open model (live site), switchable by environment variables.
2. Categorisation: rules and user history before the model; vendor normalisation; schema-constrained, ID-keyed batches; a failure ladder.
3. Leak engine: recurring charges with cadence, next date and annual cost; price-increase watch; duplicate charges; unusual charges on robust baselines; leak totals.
4. Bill calendar with a downloadable `.ics` file.
5. Budgets per category; tags and notes on transactions.
6. AI drafts: cancellation message (with a verified cancel link when known) and a negotiation call script, both grounded in the user's own numbers.
7. Ask your spending: natural-language questions answered by code-executed queries; numbers never come from the model.
8. Narrative faithfulness check with a templated fallback.
9. Evaluation: golden set, harness, CI checks, a public scoreboard.
10. Demo: 12 months of realistic synthetic data, explorable without signup. "How it works" page. Shareable report.

Out: bank linking, real-time sync, balance alerts, net worth, credit score, done-for-you cancellation or negotiation, billing, bookkeeper multi-client workspaces, desktop app.

Cut order if time runs short (last cut first): tags and notes; budgets; the `.ics` file; renewal email reminders (not in scope yet).

## Honest market verdict

Recorded so future work does not re-litigate it. Full evidence in [04-research.md](04-research.md) and the case study document.

- As a consumer business, "find forgotten subscriptions" is the weakest signal found: Reddit's top answer is that reading your own statements is free, and comparable launches got 0 to 2 comments.
- The strongest paying demand is bookkeepers' clean-up work from client statements ($2,500 to $5,500 per client-year by Reddit quotes). That is the monetisation path if this is ever sold: categorised, flagged, reconciled workpapers per client.
- Raw PDF-to-CSV conversion is commoditising (the best-known solo converter reported decline in August 2026).
- Privacy is a positioning claim, not a business by itself. Claims must be literally true for every path, including PDFs.

## Known limits to state in the product

- Recurring detection needs at least 2 to 3 months of statements; annual subscriptions need 12.
- Figures are computed by code; the model only categorises, drafts wording and interprets questions.
- Nothing here is tax or financial advice.
