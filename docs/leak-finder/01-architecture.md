# Architecture

## Principles (extend `CLAUDE.md`, never contradict it)

1. Numbers come from code. The model categorises, writes wording, and translates questions into structured queries. Every figure shown to a user is computed in TypeScript.
2. Model last. A row reaches the model only if no merchant rule and no history vote resolves it.
3. Every model output is schema-constrained where the provider supports it and validated in code regardless.
4. Every model feature has a non-model fallback (template, "needs review", or a clear error). A provider outage never erases computed results.
5. Analysis modules are isomorphic (no server-only imports) so the public demo can run them in the browser on synthetic data with no backend and no model.

## Pipeline

```
upload ──> parse (CSV/TXT: code; PDF: PDF.js text + model extraction)
       ──> human review (persisted draft)            existing, feat/product-upgrade
       ──> categorise:
             vendorKey(raw)                          normalize/
             └─ merchant_rules hit?  ── yes ──> category (origin: rule)
             └─ history vote?        ── yes ──> category (origin: history)
             └─ model batch (ID-keyed, enum, JSON schema) via llm/
                  └─ ladder: retry once → halve batch → per item → "Misc, needs review"
       ──> atomic publish (append_import_chunk)      existing
       ──> statistics + vendor signals (code)        existing stats/, vendors/
       ──> leak report (code, on read)               leaks/
       ──> narrative (model) ─ faithfulness check ─ template fallback      ai/
```

Read-time features over all of a user's `Txn[]`:

- `leaks/` builds the `LeakReport` (subscriptions, price changes, duplicates, unusual charges, totals) and the `.ics` calendar.
- `ask/` turns a question into an `AskQuery` (model), executes it (code), and phrases the answer from the computed rows.
- `actions/` produces `Draft`s (cancellation, negotiation) from a `RecurringStream` or `PriceChange`.

## Modules and ownership

| Path | Purpose | Workstream |
| --- | --- | --- |
| `src/lib/llm/` | Provider-neutral `completeJson`, config, errors, status | Phase 0 (stable) |
| `src/lib/expense-intel/contracts.ts` | Cross-workstream types: `Txn`, `LeakReport`, `Draft`, `EvalReport` | Phase 0 (stable) |
| `src/lib/expense-intel/normalize/` | `vendorKey`, `displayVendor` | A |
| `src/lib/expense-intel/pass1/`, `src/lib/imports/pdf.ts` | Categoriser, PDF extraction | A |
| `src/lib/expense-intel/rules/` | Merchant rules and history vote | A |
| `src/lib/expense-intel/leaks/` | Leak engine and calendar | B |
| `src/lib/expense-intel/ai/` | Narrative, faithfulness check, template | C |
| `src/lib/expense-intel/actions/` | Cancel guide data, drafts | C |
| `src/lib/expense-intel/ask/` | Query schema, executor, translator | D |
| `src/lib/expense-intel/budgets/` + routes | Budgets, tags, notes | F |
| `evals/`, `src/lib/demo/` | Golden set, harness, demo dataset | E |
| `src/components/workspace/views/` | New UI views | Phase 2 |

## Model layer

`completeJson({ task, system, user, schema, validate })` calls an OpenAI-compatible chat-completions endpoint with `response_format: json_schema` (strict), `temperature: 0`, `seed: 7`, and `reasoning_effort: "none"` on Ollama. It throws `LlmUnavailableError` (with `permanent` for billing, auth or missing-model failures) or `LlmOutputError` (bad JSON or failed validation).

Configuration (environment):

| Variable | Meaning | Default |
| --- | --- | --- |
| `LLM_BASE_URL` | OpenAI-compatible base URL | Unset: falls back to OpenAI if `OPENAI_API_KEY` is set, else `http://localhost:11434/v1` |
| `LLM_API_KEY` | Provider key | `ollama` locally |
| `LLM_MODEL` | Default model | `qwen3.5:9b` (Ollama), `gpt-4o-mini` (OpenAI) |
| `LLM_MODEL_<TASK>` | Per-task override: `CATEGORIZE`, `EXTRACT`, `NARRATIVE`, `ASK`, `DRAFT` | Unset |
| `LLM_PROVIDER` | Force the provider label | Inferred from URL |

Ollama specifics verified on 2026-11-15: its `/v1/responses` ignores `json_object`, rejects `input_file`, and has no `seed`, which is why this layer uses chat completions. Default context is 4K below 24 GB of VRAM; raise it with a Modelfile (`PARAMETER num_ctx 16384`) or `OLLAMA_CONTEXT_LENGTH`. Keep `OLLAMA_NUM_PARALLEL=1` on an 8 GB card.

Scanned PDFs: Ollama does not accept PDF files. The visual path needs page rasterisation to images; until that exists, scanned PDFs return a clear "export a CSV or use a text PDF" error when the provider is not OpenAI.

## Data

Existing tables: `uploads`, `line_items`, `category_stats`, `vendors`, `import_drafts`, `category_corrections`, `expense_leases`, `extraction_budget`. New in `supabase/migrations/20261116_leak_finder.sql` (not applied): `line_items.tags`, `line_items.note`, `budgets`, `merchant_rules`.

Supabase: the `feat/product-upgrade` migration was applied on 2026-10-24 to the shared pre-launch project at the owner's direction. Applying the leak-finder migration needs the owner's explicit authorisation. Tests use PGlite with `src/lib/imports/test-schema.sql` plus the migrations, never a live database.

## Demo mode

`/demo` renders the workspace with `demo` set. It must work with no backend and no model: data comes from `src/lib/demo/` (seeded, deterministic, 12 months), leak and ask features run their isomorphic code in the browser, and model-only features show precomputed outputs labelled as samples.
