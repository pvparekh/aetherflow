-- Additive migration. Apply to an isolated Supabase environment before release.
create table if not exists public.import_drafts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 fingerprint text not null,
 review jsonb not null,
 status text not null default 'review' check(status in ('review','processing','complete','error')),
 classified jsonb not null default '[]',
 cursor integer not null default 0,
 run_id uuid,
 upload_id uuid references public.uploads(id) on delete cascade,
 error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,fingerprint)
);
alter table public.import_drafts enable row level security;
revoke all on public.import_drafts from anon,authenticated;
grant select,delete on public.import_drafts to authenticated;
grant all on public.import_drafts to service_role;
create policy import_drafts_owner_select on public.import_drafts for select to authenticated using(user_id=auth.uid());
create policy import_drafts_owner_delete on public.import_drafts for delete to authenticated using(user_id=auth.uid());

alter table public.uploads add column if not exists analysis_run_id uuid;
alter table public.uploads add column if not exists analysis_started_at timestamptz;

-- CAS and transaction ensure a chunk and final publication can be retried safely.
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
  insert into public.line_items(upload_id,raw_text,vendor,amount,transaction_date,category,subcategory,confidence,is_anomaly,anomaly_severity,is_first_time_vendor,is_round_number,is_possible_duplicate)
   select u,r.raw_text,r.vendor,r.amount,r.transaction_date,r.category,r.subcategory,r.confidence,false,'none',false,false,false
   from jsonb_populate_recordset(null::public.line_items,all_rows) r;
  update public.import_drafts set classified=all_rows,cursor=expected,upload_id=u,status='processing',error=null,updated_at=clock_timestamp() where id=p_id;
  return u;
 end if;
 update public.import_drafts set classified=all_rows,cursor=jsonb_array_length(all_rows),status='review',run_id=null,error=null,updated_at=clock_timestamp() where id=p_id;
 return null;
end $$;
revoke all on function public.append_import_chunk(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.append_import_chunk(uuid,uuid,uuid,integer,jsonb) to service_role;

-- Short durable leases serialize publication/corrections/deletion per account.
create table public.expense_leases (
 user_id uuid not null references auth.users(id) on delete cascade,
 scope text not null,
 token uuid not null,
 expires_at timestamptz not null,
 primary key(user_id,scope)
);
alter table public.expense_leases enable row level security;
revoke all on public.expense_leases from public,anon,authenticated;
grant all on public.expense_leases to service_role;
create function public.claim_expense_lease(p_owner uuid,p_scope text,p_token uuid) returns boolean
language sql security invoker set search_path=public as $$
 with claimed as (
 insert into expense_leases(user_id,scope,token,expires_at) values(p_owner,p_scope,p_token,clock_timestamp()+interval '5 minutes')
 on conflict(user_id,scope) do update set token=excluded.token,expires_at=excluded.expires_at where expense_leases.expires_at<clock_timestamp()
 returning token) select exists(select 1 from claimed)
$$;
revoke all on function public.claim_expense_lease(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_expense_lease(uuid,text,uuid) to service_role;

-- Corrections are recorded with old/new category; source evidence stays unchanged.
alter table public.line_items add column if not exists category_origin text not null default 'model';
create table public.category_corrections (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 line_item_id uuid not null references public.line_items(id) on delete cascade,
 old_category text,new_category text not null,created_at timestamptz not null default now()
);
alter table public.category_corrections enable row level security;
revoke all on public.category_corrections from public,anon,authenticated;
grant all on public.category_corrections to service_role;
create function public.correct_expense_category(p_owner uuid,p_item uuid,p_category text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare old_cat text; u uuid;
begin
 if p_category not in ('Food/Dining','Travel/Transport','Accommodation','Software/SaaS','Office/Supplies','Marketing/Ads','Entertainment','Utilities','Misc') then raise exception 'Invalid category'; end if;
 select i.category,i.upload_id into old_cat,u from line_items i join uploads up on up.id=i.upload_id where i.id=p_item and up.user_id=p_owner for update of i;
 if not found then raise exception 'Transaction not found'; end if;
 if old_cat is distinct from p_category then
  insert into category_corrections(user_id,line_item_id,old_category,new_category) values(p_owner,p_item,old_cat,p_category);
  update line_items set category=p_category,category_origin='user',confidence=null where id=p_item;
  update uploads set pass1_status='processing',pass2_status='pending',analysis_run_id=null,health_score=null,ai_analysis=null where id=u;
 end if;
 return u;
end $$;
revoke all on function public.correct_expense_category(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.correct_expense_category(uuid,uuid,text) to service_role;

-- A fresh snapshot makes import retry and category correction idempotent.
create function public.rebuild_expense_vendors(p_owner uuid,p_current uuid) returns void
language plpgsql security invoker set search_path=public as $$
begin
 delete from vendors where user_id=p_owner;
 insert into vendors(user_id,vendor_name,total_occurrences,total_spend,avg_amount,recurrence_tier,primary_category,first_seen_upload_id,last_seen_upload_id)
 with eligible as (select i.*,u.uploaded_at from line_items i join uploads u on u.id=i.upload_id where u.user_id=p_owner and (u.pass1_status='complete' or u.id=p_current) and coalesce(i.vendor,'')<>''),
 grouped as (select vendor,count(*) n,sum(amount) total,avg(amount) average,(array_agg(upload_id order by uploaded_at,upload_id))[1] first_id,(array_agg(upload_id order by uploaded_at desc,upload_id desc))[1] last_id from eligible group by vendor),
 cats as (select vendor,category,sum(amount) total,row_number() over(partition by vendor order by sum(amount) desc,category) rank from eligible group by vendor,category)
 select p_owner,g.vendor,g.n,round(g.total,2),round(g.average,2),case when g.n>=10 then 'core' when g.n>=5 then 'regular' when g.n>=2 then 'occasional' else 'one_time' end,c.category,g.first_id,g.last_id from grouped g join cats c on c.vendor=g.vendor and c.rank=1;
end $$;
revoke all on function public.rebuild_expense_vendors(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rebuild_expense_vendors(uuid,uuid) to service_role;

create function public.delete_expense_report(p_owner uuid,p_upload uuid) returns boolean
language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from uploads where id=p_upload and user_id=p_owner) then return false; end if;
 update vendors set first_seen_upload_id=null where user_id=p_owner and first_seen_upload_id=p_upload;
 update vendors set last_seen_upload_id=null where user_id=p_owner and last_seen_upload_id=p_upload;
 delete from line_items where upload_id=p_upload;
 delete from category_stats where upload_id=p_upload;
 delete from uploads where id=p_upload and user_id=p_owner;
 update uploads set pass2_status='pending',analysis_run_id=gen_random_uuid(),health_score=null,ai_analysis=null where user_id=p_owner;
 perform rebuild_expense_vendors(p_owner,null);
 return true;
end $$;
revoke all on function public.delete_expense_report(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_expense_report(uuid,uuid) to service_role;

create function public.delete_all_expenses(p_owner uuid) returns void
language plpgsql security invoker set search_path=public as $$
begin
 delete from import_drafts where user_id=p_owner;
 delete from vendors where user_id=p_owner;
 delete from line_items where upload_id in(select id from uploads where user_id=p_owner);
 delete from category_stats where upload_id in(select id from uploads where user_id=p_owner);
 delete from uploads where user_id=p_owner;
end $$;
revoke all on function public.delete_all_expenses(uuid) from public,anon,authenticated;
grant execute on function public.delete_all_expenses(uuid) to service_role;

-- Bound extraction cost even when parsing fails or the browser retries.
create table public.extraction_budget(user_id uuid primary key references auth.users(id) on delete cascade,window_start timestamptz not null,requests integer not null);
alter table public.extraction_budget enable row level security;
revoke all on public.extraction_budget from public,anon,authenticated;
grant all on public.extraction_budget to service_role;
create function public.admit_expense_extraction(p_owner uuid) returns boolean language sql security invoker set search_path=public as $$
 with admitted as (
 insert into extraction_budget(user_id,window_start,requests) values(p_owner,clock_timestamp(),1)
 on conflict(user_id) do update set window_start=case when extraction_budget.window_start<clock_timestamp()-interval '1 hour' then clock_timestamp() else extraction_budget.window_start end,
 requests=case when extraction_budget.window_start<clock_timestamp()-interval '1 hour' then 1 else extraction_budget.requests+1 end
 where extraction_budget.window_start<clock_timestamp()-interval '1 hour' or extraction_budget.requests<20
 returning user_id) select exists(select 1 from admitted)
$$;
revoke all on function public.admit_expense_extraction(uuid) from public,anon,authenticated;
grant execute on function public.admit_expense_extraction(uuid) to service_role;

-- Computation stays in TypeScript; these functions persist each result as one transaction.
create function public.write_expense_statistics(p_owner uuid,p_upload uuid,p_stats jsonb,p_items jsonb) returns void
language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from uploads where id=p_upload and user_id=p_owner for update;
 if not found then raise exception 'Report not found';end if;
 delete from category_stats where upload_id=p_upload;
 insert into category_stats(upload_id,category,total_spend_period,total_spend_alltime,mean_amount,median_amount,std_dev,rolling_avg_5,rolling_avg_alltime,pct_of_total_spend,trend_direction)
 select p_upload,r.category,r.total_spend_period,r.total_spend_alltime,r.mean_amount,r.median_amount,r.std_dev,r.rolling_avg_5,r.rolling_avg_alltime,r.pct_of_total_spend,r.trend_direction from jsonb_populate_recordset(null::public.category_stats,p_stats) r;
 update line_items i set z_score=r.z_score,is_anomaly=r.is_anomaly,anomaly_severity=r.anomaly_severity from jsonb_populate_recordset(null::public.line_items,p_items) r where i.id=r.id and i.upload_id=p_upload;
end $$;
revoke all on function public.write_expense_statistics(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.write_expense_statistics(uuid,uuid,jsonb,jsonb) to service_role;
create function public.write_vendor_signals(p_owner uuid,p_upload uuid,p_items jsonb) returns void
language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from uploads where id=p_upload and user_id=p_owner for update;
 if not found then raise exception 'Report not found';end if;
 update line_items i set is_first_time_vendor=r.is_first_time_vendor,is_round_number=r.is_round_number,is_possible_duplicate=r.is_possible_duplicate from jsonb_populate_recordset(null::public.line_items,p_items) r where i.id=r.id and i.upload_id=p_upload;
end $$;
revoke all on function public.write_vendor_signals(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.write_vendor_signals(uuid,uuid,jsonb) to service_role;
