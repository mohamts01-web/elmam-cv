create extension if not exists http with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table etmam.posthog_purchase_exports (
  intent_id uuid primary key references etmam.whop_intents(id) on delete cascade,
  exported_at timestamptz not null default now()
);
alter table etmam.posthog_purchase_exports enable row level security;
revoke all on etmam.posthog_purchase_exports from public, anon, authenticated;

create function etmam.export_confirmed_purchases() returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  ids uuid[];
  batch jsonb;
  response extensions.http_response;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(1475719, 384900) then return 0; end if;

  select array_agg(intent.id), jsonb_agg(jsonb_build_object(
    'event', 'cv purchase confirmed',
    'uuid', md5('elmam-cv-posthog-purchase-v1:' || intent.id::text)::uuid,
    'distinct_id', md5('elmam-cv-posthog-purchase-v1:' || intent.id::text),
    'timestamp', intent.paid_at,
    'properties', jsonb_build_object('site','elmam_cv','source','whop_verified',
      '$process_person_profile',false,'$geoip_disable',true)
  )) into ids, batch
  from (
    select i.id,i.paid_at
    from etmam.whop_intents i
    where i.environment = 'live' and i.payment_id is not null and i.paid_at is not null
      and not exists (select 1 from etmam.posthog_purchase_exports e where e.intent_id = i.id)
    order by i.paid_at, i.id limit 100
  ) intent;
  if ids is null then return 0; end if;

  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','2000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','8000');
  select * into response from extensions.http_post('https://us.i.posthog.com/batch/',
    jsonb_build_object('api_key','phc_n2Y5DSoHZSUjZHGvUGczSmyyphtYcysWwrruTvSrzfJS','batch',batch)::text,
    'application/json');
  if response.status not between 200 and 299
    or (response.content::jsonb->>'status') is distinct from '1'
    or (response.content::jsonb ? 'quota_limited') then
    raise exception 'posthog_purchase_export_not_accepted (%)', response.status;
  end if;
  insert into etmam.posthog_purchase_exports(intent_id) select unnest(ids) on conflict do nothing;
  return cardinality(ids);
end;
$$;
revoke all on function etmam.export_confirmed_purchases() from public, anon, authenticated;

select cron.schedule('elmam-cv-confirmed-purchases-posthog','*/15 * * * *',
  'select etmam.export_confirmed_purchases()');
