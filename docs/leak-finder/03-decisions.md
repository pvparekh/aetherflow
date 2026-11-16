# Decision log

Newest first. Each entry: decision, why, and what would reverse it.

## 2026-11-15: Build parallel workstreams on shared contracts

Phase 0 fixes the model layer, cross-workstream types, vendor key and migration before agents fan out, so six agents can work without colliding. Reverse if contracts prove wrong in phase 2; change them in one coordinated commit.

## 2026-11-15: Chat completions, not the Responses API

Ollama's `/v1/responses` silently ignores `json_object`, rejects `input_file`, and has no `seed` (checked against its source on 2026-11-15). Chat completions with `json_schema` works on Ollama, OpenAI and Cloudflare Workers AI. Reverse if a target provider only supports Responses.

## 2026-11-15: Local model for development and evals; hosted open model for the live site

A deployed Vercel app cannot reach a laptop. Local: `qwen3.5:9b` on Ollama (6.6 GB, Apache-2.0; fits an 8 GB GPU). Live: Cloudflare Workers AI free allocation (no training on customer content, no retention, about 10,000 neurons a day), with a daily cap; the demo uses stored data so the cap never breaks it. Rejected: Gemini and OpenRouter free tiers (terms allow training or human review of inputs); tunnelling to a home PC (demo-grade reliability). Reverse if Workers AI quality or limits fail the eval gate; the fallback is $5 of OpenAI prepaid credit.

## 2026-11-15: Model last; confidence from the path

Every leading product publishes the same layering: rules, a merchant cache, user history, then a model for the remainder. Self-reported model confidence is poorly calibrated on small models. Confidence is set by which path resolved the row. Reverse only with eval evidence.

## 2026-11-15: Batch size stays 25 until measured

`CLAUDE.md` principle 1 fixes 25 rows per call. Published work shows accuracy falling with batch size on larger models, with no evidence for 4 to 9 billion parameter models. The eval harness runs 25 and 10; the rule changes only if 10 wins clearly, recorded here.

## 2026-11-15: Robust anomaly scores for the leak engine

A plain z-score cannot exceed (n−1)/√n, so with 10 or fewer charges it can never reach 3 (NIST). The existing pipeline already switches to a median-based score for skewed categories. The leak engine's unusual-charge detector uses median and MAD on log amounts against the vendor's own history (at least 5 charges) or the category. Stored `z_score` values are unchanged, so no migration.

## 2026-11-15: Portfolio first, monetisation-ready; absorb upload-compatible Rocket Money features

The owner chose a portfolio-grade product over a narrow business. Research found consumer subscription-finding to be weak as a business and bookkeeper clean-up to be the strongest paying demand; the build stays compatible with that path (shareable report, categorised workpapers) without building billing or multi-client features now. See `00-brief.md`.

## 2026-11-15: Privacy is positioning, hosted web app is the delivery model

Local-only finance tools draw large free audiences and little revenue; hardware limits reach. The app stays a hosted web app with an optional local model. Claims stay literally true: no bank linking; the summary is written from totals.
