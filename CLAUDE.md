# Aether Flow — Project Context

## Product: Expense Intelligence
An AI-powered expense tracking and analysis tool. Users upload CSV, TXT, or PDF expense files.
The system categorizes every line item, runs statistical anomaly detection, and generates
plain-English insights via a two-pass AI pipeline. Every entry is an expense (outflow).
No income tracking, no credits, no bank statement mode.

## Canonical Categories (do not change without migration)
Food/Dining · Travel/Transport · Accommodation · Software/SaaS ·
Office/Supplies · Marketing/Ads · Entertainment · Utilities · Misc

## Architectural Principles (non-negotiable)
1. Pass 1 BATCHES line items (25 per API call). Never 1 call per item.
2. Pass 2 receives PRE-AGGREGATED stats as context. Never raw line items.
3. Rolling averages recalculate on every upload across ALL historical data.
4. Anomaly flags use Z-scores (z = (Xi - X̄) / σ), not just % deviation.
5. Statistical computation happens in CODE, not via AI. AI only does
   categorization (Pass 1), narrative insight (Pass 2), PDF row extraction,
   wording of drafts, and translating questions into structured queries.
   Every number a user sees is computed by code.
6. All amounts are stored as positive numbers. Every row is an expense.

## Parser Behavior
- CSV standard format (Date, Description, Amount): amounts always stored positive
- CSV bank export format (separate Debit/Credit columns): Debit column only, Credit rows ignored
- TXT: regex extracts description + amount, always positive
- PDF: PDF.js text extraction, then model extraction through `src/lib/llm/`; always positive amounts

## Feature Directory
/expense-intel/
  /parser/    — CSV/TXT/PDF ingestion
  /ai/        — Pass 1 + Pass 2 logic
  /pass1/     — batch categorization
  /stats/     — rolling avg, z-score, trend, drift
  /vendors/   — vendor intelligence module
  /api/       — dashboard endpoints
  /components — dashboard UI components

## Model Integration
All model calls go through `src/lib/llm/index.ts` (`completeJson`): OpenAI-compatible
chat completions with a strict JSON schema, temperature 0, validated in code.
Provider is chosen by environment (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`,
`LLM_MODEL_<TASK>`); default is local Ollama `qwen3.5:9b`, and a bare
`OPENAI_API_KEY` still selects OpenAI. Never import the `openai` SDK elsewhere.

## Current Work: Leak Finder (branch `feat/leak-finder`)
Read before changing anything:
- `docs/leak-finder/00-brief.md` — signed-off scope and the honest market verdict
- `docs/leak-finder/01-architecture.md` — pipeline, modules, model layer, demo mode
- `docs/leak-finder/02-workstreams.md` — ownership and acceptance per workstream
- `docs/leak-finder/03-decisions.md` — decision log; add an entry for any reversal
- `docs/leak-finder/04-research.md` — evidence ledger with sources
Cross-workstream types live in `src/lib/expense-intel/contracts.ts`.
Never apply Supabase migrations without the owner's explicit approval.
