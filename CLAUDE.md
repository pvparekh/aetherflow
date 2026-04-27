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
   categorization (Pass 1) and narrative insight (Pass 2).
6. All amounts are stored as positive numbers. Every row is an expense.

## Parser Behavior
- CSV standard format (Date, Description, Amount): amounts always stored positive
- CSV bank export format (separate Debit/Credit columns): Debit column only, Credit rows ignored
- TXT: regex extracts description + amount, always positive
- PDF: gpt-4o-mini extraction, expense-only prompt, always positive amounts

## Feature Directory
/expense-intel/
  /parser/    — CSV/TXT/PDF ingestion
  /ai/        — Pass 1 + Pass 2 logic
  /pass1/     — batch categorization
  /stats/     — rolling avg, z-score, trend, drift
  /vendors/   — vendor intelligence module
  /api/       — dashboard endpoints
  /components — dashboard UI components

## Existing OpenAI Integration
[Claude Code: fill this in after scanning — path + usage pattern]
