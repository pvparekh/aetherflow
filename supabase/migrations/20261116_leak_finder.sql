-- Additive migration for the leak-finder release. Not yet applied anywhere.
-- Apply only with the owner's explicit authorisation (see docs/leak-finder/02-workstreams.md).

-- Tags and notes on transactions.
alter table public.line_items add column if not exists tags text[] not null default '{}';
alter table public.line_items add column if not exists note text;

-- Monthly budget per canonical category.
create table if not exists public.budgets (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 category text not null check (category in ('Food/Dining','Travel/Transport','Accommodation','Software/SaaS','Office/Supplies','Marketing/Ads','Entertainment','Utilities','Misc')),
 monthly_target numeric not null check (monthly_target > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, category)
);
alter table public.budgets enable row level security;
revoke all on public.budgets from public, anon, authenticated;
grant select on public.budgets to authenticated;
grant all on public.budgets to service_role;
create policy budgets_owner_select on public.budgets for select to authenticated using (user_id = auth.uid());

-- Per-user merchant rules: a vendor key always maps to a category.
-- origin 'correction' rules are created from audited category corrections;
-- 'manual' rules are created by the user directly.
create table if not exists public.merchant_rules (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 vendor_key text not null check (length(vendor_key) between 1 and 120),
 category text not null check (category in ('Food/Dining','Travel/Transport','Accommodation','Software/SaaS','Office/Supplies','Marketing/Ads','Entertainment','Utilities','Misc')),
 display_name text,
 origin text not null check (origin in ('correction','manual')),
 hits integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, vendor_key)
);
alter table public.merchant_rules enable row level security;
revoke all on public.merchant_rules from public, anon, authenticated;
grant select on public.merchant_rules to authenticated;
grant all on public.merchant_rules to service_role;
create policy merchant_rules_owner_select on public.merchant_rules for select to authenticated using (user_id = auth.uid());
