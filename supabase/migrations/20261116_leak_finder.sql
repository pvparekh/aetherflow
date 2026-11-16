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

-- Creates or replaces the rule for one vendor key. Corrections overwrite
-- earlier rules for the same vendor: the latest decision wins.
create or replace function public.upsert_merchant_rule(p_owner uuid,p_vendor_key text,p_category text,p_display_name text,p_origin text)
returns void language sql security invoker set search_path=public as $$
 insert into merchant_rules(user_id,vendor_key,category,display_name,origin)
 values(p_owner,p_vendor_key,p_category,p_display_name,p_origin)
 on conflict (user_id,vendor_key) do update
 set category=excluded.category,display_name=excluded.display_name,origin=excluded.origin,updated_at=now();
$$;
revoke all on function public.upsert_merchant_rule(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.upsert_merchant_rule(uuid,text,text,text,text) to service_role;

-- How each row got its category: pass 1 records rule, history, model or
-- fallback ("Misc, needs review"); a correction records user.
alter table public.line_items drop constraint if exists line_items_category_origin_check;
alter table public.line_items add constraint line_items_category_origin_check
 check (category_origin in ('rule','history','model','fallback','user'));

-- Same as 20261024_import_review.sql, plus category_origin copied from each
-- chunk row (chunks without it keep the previous default, 'model').
create or replace function public.append_import_chunk(p_id uuid,p_owner uuid,p_run uuid,p_cursor integer,p_chunk jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare d public.import_drafts; u uuid; all_rows jsonb; expected integer;
begin
 select * into d from public.import_drafts where id=p_id and user_id=p_owner for update;
 if not found then raise exception 'Import not found'; end if;
 if d.upload_id is not null then return d.upload_id; end if;
 if d.run_id is distinct from p_run or d.cursor<>p_cursor or d.status<>'processing' then raise exception 'Import changed; reload'; end if;
 if jsonb_typeof(p_chunk)<>'array' or jsonb_array_length(p_chunk)>25 then raise exception 'Invalid chunk'; end if;
 select count(*) into expected from jsonb_array_elements(d.review->'rows') r where (r->>'included')::boolean;
 all_rows=d.classified||p_chunk;
 if jsonb_array_length(all_rows)>expected then raise exception 'Too many rows'; end if;
 if jsonb_array_length(all_rows)=expected then
  if expected=0 then raise exception 'Select expenses before import'; end if;
  insert into public.uploads(user_id,filename,line_item_count,total_amount,pass1_status,pass2_status)
   select p_owner,d.review->>'filename',expected,sum((r->>'amount')::numeric),'processing','pending' from jsonb_array_elements(all_rows) r returning id into u;
  insert into public.line_items(upload_id,raw_text,vendor,amount,transaction_date,category,subcategory,confidence,category_origin,is_anomaly,anomaly_severity,is_first_time_vendor,is_round_number,is_possible_duplicate)
   select u,r.raw_text,r.vendor,r.amount,r.transaction_date,r.category,r.subcategory,r.confidence,coalesce(r.category_origin,'model'),false,'none',false,false,false
   from jsonb_populate_recordset(null::public.line_items,all_rows) r;
  update public.import_drafts set classified=all_rows,cursor=expected,upload_id=u,status='processing',error=null,updated_at=clock_timestamp() where id=p_id;
  return u;
 end if;
 update public.import_drafts set classified=all_rows,cursor=jsonb_array_length(all_rows),status='review',run_id=null,error=null,updated_at=clock_timestamp() where id=p_id;
 return null;
end $$;
revoke all on function public.append_import_chunk(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.append_import_chunk(uuid,uuid,uuid,integer,jsonb) to service_role;
