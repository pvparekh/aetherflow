# AetherFlow — Expense Intelligence

AI-powered expense tracking and analysis. Upload a CSV, TXT, or PDF of your business expenses and get automated categorization, anomaly detection, vendor intelligence, and insights.


## Live Demo

[aetherflow-three.vercel.app](https://aetherflow-three.vercel.app/)

---

## What It Does

AetherFlow runs every uploaded expense file through a two-pass AI pipeline:

**Pass 1 — Categorization (GPT-4o-mini)**
Every transaction is classified into one of 9 canonical categories in batches of 25. Fast and cheap.

**Pass 2 — Narrative Analysis (GPT-4o)**
A deeper AI pass that reads pre-aggregated stats and writes plain-English insights, a 1–10 health score, savings opportunities, and anomaly explanations. Runs asynchronously so it never blocks the upload.

In between, all statistical computation is hardcoded — z-scores, rolling averages, trend detection, and duplicate flagging, So the AI has everything it needs and only does what it's good at.

---

## Features

### Expense Intelligence Dashboard
- Upload CSV, TXT, or PDF expense files — drag-and-drop or click to browse
- Automatic format detection (standard CSV, bank export with debit/credit split, plain text, PDF)
- Category donut chart with click-to-filter
- Current vs Category Average bar chart per category
- Anomaly feed with severity levels (critical, warning, info), filter pills, and per-item resolve/dismiss actions
- AI Insights panel with health score, narrative summary, savings opportunities, and anomaly explanations
- Vendor table tracking spend, occurrences, average amount, and recurrence tier across all uploads
- Upload history with per-upload delete and rolling stat recalculation
- All-time view aggregating stats across every upload
- Export line items as CSV

### Statistical Engine
- Z-score per transaction: `(amount - category_mean) / category_stdDev`
- Anomaly severity: high (|z| ≥ 3), medium (|z| ≥ 2), low (|z| ≥ 1)
- Rolling averages: last-5-uploads and all-time, recalculated on every upload and delete
- Trend direction: compares recent 3-upload mean vs prior 3-upload mean (>10% threshold)
- Category drift: flags when a category's share of total spend shifts >15 percentage points
- MAD z-scores for skewed distributions (where `|mean - median| / |median| > 0.25`)

### Vendor Intelligence
- First-time vendor detection across all user uploads
- Duplicate charge detection: same vendor + same amount within 7 days, within and across uploads
- Round-number flagging: amounts ≥ $100 that are multiples of $50
- Recurrence tiers: one-time → occasional → regular → core (based on occurrence count)
- Price creep detection: warns when a recurring vendor's average amount increases >10%
- Consolidation opportunities: flags when 3+ vendors serve the same subcategory purpose

### Account & Data Management
- Profile display (name, email, join date)
- Usage stats: total uploads, transactions analyzed, tracking since, average health score
- Export all data as a ZIP (analyzed_expenses.csv + summary.json)
- Delete all uploads (typed confirmation: "DELETE")
- Delete account (typed confirmation: "DELETE MY ACCOUNT", cascades all data)
- Email digest preference (UI placeholder, coming soon)

### Auth
- Email/password sign-up and login
- Google OAuth
- Protected routes redirect unauthenticated users to sign-up


---

## Tech Stack

| | |
|---|---|
| Framework | Next.js 15.3 (App Router) |
| Frontend | React 19, Tailwind CSS 4, Framer Motion, Recharts |
| Database & Auth | Supabase (PostgreSQL + Auth) |
| AI | OpenAI GPT-4o (Pass 2), GPT-4o-mini (Pass 1, PDF parsing) |
| File Parsing | PapaParse (CSV), pdf-parse (PDF) |
| Export | JSZip |
| Icons | Lucide React |
| Testing | Vitest |

---

## Canonical Categories

All expenses are classified into exactly one of:

`Food/Dining` · `Travel/Transport` · `Accommodation` · `Software/SaaS` · `Office/Supplies` · `Marketing/Ads` · `Entertainment` · `Utilities` · `Misc`

---

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project
- An OpenAI API key

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-api-key
```

### Install and Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build for Production

```bash
npm run build
npm start
```

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/              # Login, signup, logout pages
│   ├── api/
│   │   ├── account/         # Stats, export, delete uploads, delete account
│   │   ├── analyze/         # Free one-shot analysis (guest)
│   │   └── expense-intel/   # Upload, dashboard, pass2, resolve, anomaly, aggregate
│   ├── account/             # Account page
│   ├── analyze/             # Free analysis page
│   ├── expense-intel/       # Main dashboard page
│   └── page.tsx             # Landing page
├── components/
│   ├── expense-intel/       # Dashboard components (charts, anomaly feed, etc.)
│   └── ...                  # Navbar, Layout, Footer, auth buttons
└── lib/
    └── expense-intel/
        ├── parser/          # CSV, TXT, PDF ingestion
        ├── pass1/           # Batch AI categorization
        ├── ai/              # Pass 2 narrative analysis
        ├── stats/           # Z-scores, rolling averages, trend detection
        ├── vendors/         # Vendor intelligence and flag generation
        └── types.ts         # Shared TypeScript types
utils/
└── supabase/                # Browser, server, service role, middleware clients
```

---

## Architecture Notes

- **Pass 1 always batches** — 25 line items per API call, never one per item
- **Pass 2 receives pre-aggregated stats** — never raw line items, keeps prompts small and focused
- **All math happens in code** — AI does categorization and narrative only, never arithmetic (In order to lessen compute)
- **Vendor table rebuilds atomically** — on any upload delete, the entire vendor table for that user is wiped and reconstructed from remaining line items to prevent stale data
- **Rolling averages recalculate on every change** — upload, delete, or resolve all trigger a recalc so historical baselines are always accurate
- **Service role is backend-only** — the Supabase service role key (bypasses RLS) is never imported in any client component
