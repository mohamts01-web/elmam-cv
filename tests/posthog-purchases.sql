-- Run inside a disposable local transaction. The HTTP call is replaced by a fixture.
create schema extensions;
create schema etmam;
create schema cron;
create table etmam.whop_intents (
  id uuid primary key, environment text, payment_id text, paid_at timestamptz
);
create table extensions.capture_fixture (status integer, body text, payload jsonb);
insert into extensions.capture_fixture values (429,'{"status":0}',null);
create type extensions.http_response as (status integer, content text);
create function extensions.http_set_curlopt(text,text) returns boolean language sql as 'select true';
create function extensions.http_post(endpoint text, request_body text, content_type text)
returns extensions.http_response language plpgsql as $$
declare result extensions.http_response;
begin
  if endpoint <> 'https://us.i.posthog.com/batch/' or content_type <> 'application/json' then
    raise exception 'unexpected endpoint';
  end if;
  update extensions.capture_fixture set payload=request_body::jsonb
    returning status,extensions.capture_fixture.body into result;
  return result;
end;
$$;
create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';

-- APPLY_MIGRATION
do $$
declare
  request jsonb;
  event jsonb;
begin
  if etmam.export_confirmed_purchases() <> 0 then raise exception 'empty export'; end if;
  insert into etmam.whop_intents values
    ('a7a52125-a05f-44a3-9f69-1664aa4f99d2','live','pay_fixture_live','2026-11-17 07:00:00+00'),
    ('d42d8983-f6f2-4398-9aa7-184924e18cd3','sandbox','pay_fixture_sandbox','2026-11-17 07:01:00+00'),
    ('dbca9323-bfe5-40fd-bd52-3460db3a5863','live',null,null);
  begin
    perform etmam.export_confirmed_purchases();
    raise exception 'failure treated as success';
  exception when raise_exception then
    if sqlerrm not like 'posthog_purchase_export_not_accepted%' then raise; end if;
  end;
  if exists(select 1 from etmam.posthog_purchase_exports) then raise exception 'failure lost purchase'; end if;
  update extensions.capture_fixture set status=200,body='{"status":1}';
  if etmam.export_confirmed_purchases() <> 1 then raise exception 'wrong delivery count'; end if;
  select payload into request from extensions.capture_fixture;
  event := request->'batch'->0;
  if jsonb_array_length(request->'batch') <> 1 or event->>'event' <> 'cv purchase confirmed'
     or (event->>'timestamp')::timestamptz <> '2026-11-17 07:00:00+00'::timestamptz
     or request::text like '%pay_fixture%' or request::text like '%a7a52125-a05f-44a3-9f69-1664aa4f99d2%'
     or (event->'properties'->>'$process_person_profile') <> 'false' then
    raise exception 'unexpected analytics payload';
  end if;
  if etmam.export_confirmed_purchases() <> 0 then raise exception 'duplicate delivery'; end if;
end;
$$;
