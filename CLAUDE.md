# Aether Flow — Project Context

## Current Feature Build: Expense Intelligence Dashboard
A 2-pass AI-powered expense analysis dashboard that ingests CSV/TXT expense
reports, categorizes line items with gpt-4o-mini, runs statistical anomaly
detection in code, then uses the existing OpenAI integration for narrative
insights. Persists everything to SQLite so baselines improve with every upload.

## Expense Categories (CANONICAL — do not change without migration)
Food/Dining · Travel/Transport · Accommodation · Software/SaaS ·
Office/Supplies · Marketing/Ads · Entertainment · Utilities · Misc

## Architectural Principles (non-negotiable)
1. Pass 1 BATCHES line items (20-30 per API call). Never 1 call per item.
2. Pass 2 receives PRE-AGGREGATED stats as context. Never raw line items.
3. Rolling averages recalculate on every upload across ALL historical data.
4. Anomaly flags use Z-scores (z = (Xi - X̄) / σ), not just % deviation.
5. Statistical computation happens in CODE, not via AI. AI only does
   categorization (Pass 1) and narrative insight (Pass 2).

## Feature Directory
/expense-intel/
  /parsers/   — CSV/TXT ingestion
  /ai/        — Pass 1 + Pass 2 logic
  /stats/     — rolling avg, z-score, trend, drift
  /vendors/   — vendor intelligence module
  /db/        — SQLite schema + migrations
  /api/       — dashboard endpoints
  /ui/        — dashboard components

## Existing OpenAI Integration
[Claude Code: fill this in after scanning — path + usage pattern]