# Research ledger (2026-11-15)

Condensed evidence behind the brief and decisions. Labels: [P] primary page fetched, [F] founder self-report, [S] secondary or search snippet, [R] Reddit thread read through the Arctic Shift archive, [I] inference. The full narrative case study lives in the owner's Claude doc "Expense Intelligence: market case study and go/no-go".

## Root cause of the broken AI (2026-11-15)

The OpenAI key authenticates (`GET /v1/models` returns 200) but every generation returns `billing_not_active`: an account billing state, not a code fault. Fix options: prepaid credits ($5 minimum) or switch provider.

## Local models and runtime

- `qwen3.5:9b`: 6.6 GB at Q4_K_M, 256K native context, Apache-2.0, vision-capable, thinking on by default [P ollama.com/library/qwen3.5]. One RTX 3070 8 GB measurement: about 59 tokens a second, 6.8 GB peak at 4K context [S].
- Runner-ups: `qwen3.5:4b` (3.3 GB), `gemma4:e4b`. `glm-ocr` (0.9B) for scanned pages.
- Ollama `/v1/responses` limits and the 4K default context: see `03-decisions.md` [P github.com/ollama/ollama openai/responses.go, docs.ollama.com/context-length].
- Ollama has no authentication; never expose it directly [P docs.ollama.com/faq].

## Hosted options

| Option | Free terms | Data use | Source |
| --- | --- | --- | --- |
| Cloudflare Workers AI | 10,000 neurons a day | No training, no retention | [P developers.cloudflare.com/workers-ai/platform/data-usage] |
| Groq | Free plan, about 8K tokens a minute | No retention by default; zero-retention option | [P console.groq.com/docs/your-data] |
| Gemini free tier | Generous | Used to improve products; human review | [P aistudio.google.com/docs/terms] |
| OpenAI | $5 minimum prepaid | API data not used for training by default | [S] |

## How leading products categorise

Rules, then merchant lookup or cache, then learned models, then an LLM for the unknown tail; corrections feed back. Ramp restricts its model to a candidate list [P builders.ramp.com/post/fixing-merchant-classifications-with-ai]. Ntropy reports 96.2% cache hits with denoised keys versus 0.08% on raw strings [P ntropy.com/blog/caching-framework]. Copilot Money trains a per-user model [P]. Actual Budget learns a majority-vote rule per payee [P actualbudget.org/docs/budgeting/rules]. Sure (the Maybe fork) uses enum-constrained IDs and categories with a null option [P github.com/we-promise/sure].

## Market

- Bank Statement Converter (solo): about $12.5k MRR in 2023 [F]; revenue down 24% since February 2026, new subscribers 191 (January) to 45 (August) [P bankstatementconverter.com/blog/posts/2026-08-28-business-is-dying]. Cancellation survey of 42: 50% one-off job, 7% using AI, 5% moved to QuickBooks [P .../2026-09-21-why-are-people-canceling].
- Converters: DocuClipper $29 to $299 a month [P docuclipper.com/pricing]; Statement Desk $19 and $49 a month, $29.99 per client migration [P statementdesk.com/pricing].
- Consumer: Rocket Money Free, Premium $7 to $14 a month, Premium+ $15 with AI assistant and negotiation [P rocketmoney.com, page dated 2026-01-19]. Monarch $99.99 a year, YNAB $109, Lunch Money $10 a month, Tiller $99 [P].
- SaaS spend: Cledara from £75 a month [P cledara.com/pricing]; enterprise tools $18k to $36k a year [S G2].
- Local-first: Actual Budget about 30,000 GitHub stars, about $57k raised in total on Open Collective [P]; Maybe's paid hosted product failed [P Sure README].

## Voice of customer (Reddit and Hacker News)

- Clean-up bookkeeping is 2.6% of r/Bookkeeping posts (86 of 3,256, March to November 2026), the most engaged pain [R]. A year of review and categorisation is quoted at $2,500 to $5,500 [R r/Bookkeeping 1uvpj1b, 1xi23wk].
- Tax preparers already receive client workbooks made by running statements through general chat AI [R r/taxpros 1wugw1e].
- Bookkeepers distrust uploading client statements to unknown sites; top comment in one thread has 19 points saying never [R r/Bookkeeping 1mmp9cx].
- Consumer subscription finding: about 3 of 3,121 r/personalfinance posts; top answer says reading your statements is free [R 1xult81].
- Monarch users complain its recurring detection is wrong (86 points) [R r/MonarchMoney 1vtntd8].
- Show HN posts about statement tools in 2026: median 2.5 points across 30 [P hn.algolia.com].

## Marketing evidence

- Paid search lost money for the category leader (about $1,000 a month for about $200 revenue) [F].
- Product Hunt and Show HN rarely produce paying users for this category [F, P].
- Best-evidenced channels: direct bookkeeper outreach, free single-purpose tool pages, helpful answers in megathreads [I from the above].
- Compliance: no fabricated testimonials (FTC rule, about $51k per violation) [P ftc.gov]; privacy and AI claims must be literally true [S].

## Statistics

- Maximum possible z-score in a sample of n is (n−1)/√n [P itl.nist.gov/div898/handbook/eda/section3/eda35h.htm].
- Modified z-score 0.6745 × (x − median) / MAD, flag above 3.5 (Iglewicz and Hoaglin, via NIST).
