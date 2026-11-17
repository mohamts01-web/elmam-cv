-- Independent payment ledger; Zid memberships remain intact.
CREATE TABLE etmam.billing_offers (
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),sku text NOT NULL,
 price_id text NOT NULL, title text NOT NULL,kind text NOT NULL CHECK(kind IN ('subscription','ai')),
 usd_cents integer NOT NULL CHECK(usd_cents>0),sar_target numeric(10,2) NOT NULL,
 interval text CHECK(interval IN ('month','year')),ai_operations integer NOT NULL CHECK(ai_operations>0),
 max_drafts integer NOT NULL DEFAULT 0,enabled boolean NOT NULL DEFAULT false,
 PRIMARY KEY(environment,sku),UNIQUE(environment,price_id),
 CHECK((kind='subscription' AND interval IS NOT NULL AND max_drafts IN (2,10)) OR(kind='ai' AND interval IS NULL AND max_drafts=0))
);
CREATE TABLE etmam.billing_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES etmam.accounts(id),
 environment text NOT NULL,sku text NOT NULL,transaction_id text,creating boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(environment,sku) REFERENCES etmam.billing_offers(environment,sku),UNIQUE(environment,transaction_id)
);
CREATE TABLE etmam.billing_subscriptions (
 environment text NOT NULL,id text NOT NULL,account_id uuid NOT NULL REFERENCES etmam.accounts(id),
 customer_id text NOT NULL,price_id text NOT NULL,status text NOT NULL DEFAULT 'active',
 period_start timestamptz NOT NULL,paid_until timestamptz NOT NULL,ai_operations integer NOT NULL,max_drafts integer NOT NULL,
 updated_event timestamptz NOT NULL DEFAULT now(),revoked boolean NOT NULL DEFAULT false,paid_transaction text NOT NULL,
 PRIMARY KEY(environment,id),CHECK(paid_until>period_start)
);
CREATE TABLE etmam.billing_orders (
 environment text NOT NULL,transaction_id text NOT NULL,account_id uuid NOT NULL REFERENCES etmam.accounts(id),
 intent_id uuid REFERENCES etmam.billing_intents(id),subscription_id text,offer jsonb NOT NULL,
 paid_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false,PRIMARY KEY(environment,transaction_id)
);
CREATE TABLE etmam.billing_events (
 environment text NOT NULL,event_id text NOT NULL,event_type text NOT NULL,occurred_at timestamptz NOT NULL,
 processed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(environment,event_id)
);
CREATE TABLE etmam.billing_revocations(environment text NOT NULL,transaction_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(environment,transaction_id));
CREATE TABLE etmam.billing_allowances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),environment text NOT NULL,subscription_id text NOT NULL,
 account_id uuid NOT NULL REFERENCES etmam.accounts(id),starts timestamptz NOT NULL,expires timestamptz NOT NULL,
 ai_limit integer NOT NULL CHECK(ai_limit>0),ai_used integer NOT NULL DEFAULT 0 CHECK(ai_used>=0),
 UNIQUE(environment,subscription_id,starts),FOREIGN KEY(environment,subscription_id) REFERENCES etmam.billing_subscriptions(environment,id)
);
CREATE TABLE etmam.billing_credit_packs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),environment text NOT NULL,transaction_id text NOT NULL,
 account_id uuid NOT NULL REFERENCES etmam.accounts(id),ai_limit integer NOT NULL CHECK(ai_limit>0),ai_used integer NOT NULL DEFAULT 0 CHECK(ai_used>=0),
 revoked boolean NOT NULL DEFAULT false,UNIQUE(environment,transaction_id),FOREIGN KEY(environment,transaction_id) REFERENCES etmam.billing_orders(environment,transaction_id)
);
CREATE TABLE etmam.ai_reservations (
 job_id uuid PRIMARY KEY REFERENCES etmam.jobs(id) ON DELETE CASCADE,account_id uuid NOT NULL REFERENCES etmam.accounts(id),
 source text NOT NULL CHECK(source IN ('zid','allowance','pack')),source_id uuid,legacy_activated timestamptz
);
INSERT INTO etmam.ai_reservations SELECT j.id,j.account_id,'zid',NULL,m.activated FROM etmam.jobs j JOIN etmam.memberships m ON m.account_id=j.account_id WHERE j.kind<>'export' AND j.state IN ('queued','running');
CREATE INDEX billing_subscriptions_account ON etmam.billing_subscriptions(account_id,paid_until);
CREATE INDEX billing_packs_account ON etmam.billing_credit_packs(account_id) WHERE NOT revoked;
CREATE INDEX billing_allowances_account ON etmam.billing_allowances(account_id,expires);
CREATE INDEX billing_intents_account ON etmam.billing_intents(account_id,created_at);
CREATE INDEX ai_reservations_source ON etmam.ai_reservations(source,source_id);

CREATE FUNCTION etmam.billing_month(p_start timestamptz,p_end timestamptz,p_now timestamptz DEFAULT now()) RETURNS TABLE(starts timestamptz,expires timestamptz) LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (p_start AT TIME ZONE 'Asia/Riyadh'+make_interval(months=>n)) AT TIME ZONE 'Asia/Riyadh',least(p_end,(p_start AT TIME ZONE 'Asia/Riyadh'+make_interval(months=>n+1)) AT TIME ZONE 'Asia/Riyadh')
 FROM generate_series(0,11) n WHERE (p_start AT TIME ZONE 'Asia/Riyadh'+make_interval(months=>n)) AT TIME ZONE 'Asia/Riyadh'<=p_now AND least(p_end,(p_start AT TIME ZONE 'Asia/Riyadh'+make_interval(months=>n+1)) AT TIME ZONE 'Asia/Riyadh')>p_now;
$$;
CREATE FUNCTION etmam.billing_pending(p_actor uuid,p_source text,p_id uuid DEFAULT NULL) RETURNS integer LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT count(*)::integer FROM etmam.ai_reservations r JOIN etmam.jobs j ON j.id=r.job_id WHERE r.account_id=p_actor AND r.source=p_source AND r.source_id IS NOT DISTINCT FROM p_id AND j.state IN ('queued','running');
$$;
CREATE FUNCTION etmam.billing_membership(p_actor uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE m etmam.memberships; s record; pack record; total integer:=0;used integer:=0;pending integer:=0;slots integer:=2;until_at timestamptz;since_at timestamptz;has_plan boolean:=false;
BEGIN
 SELECT * INTO m FROM etmam.memberships WHERE account_id=p_actor;
 until_at:=m.expires;since_at:=m.activated;
 IF m.account_id IS NOT NULL THEN used:=m.ai_used;total:=m.ai_used;END IF;
 IF m.expires>now() THEN total:=m.ai_limit;pending:=etmam.billing_pending(p_actor,'zid');END IF;
 FOR s IN SELECT b.*,w.starts,w.expires,a.id allowance_id,coalesce(a.ai_used,0) used FROM etmam.billing_subscriptions b CROSS JOIN LATERAL etmam.billing_month(b.period_start,b.paid_until) w LEFT JOIN etmam.billing_allowances a ON a.environment=b.environment AND a.subscription_id=b.id AND a.starts=w.starts WHERE b.account_id=p_actor AND NOT b.revoked AND b.period_start<=now() AND b.paid_until>now() LOOP
  has_plan:=true;until_at:=greatest(until_at,s.paid_until);since_at:=least(since_at,s.period_start);slots:=greatest(slots,s.max_drafts);
  total:=total+s.ai_operations;used:=used+s.used;IF s.allowance_id IS NOT NULL THEN pending:=pending+etmam.billing_pending(p_actor,'allowance',s.allowance_id);END IF;
 END LOOP;
 FOR pack IN SELECT * FROM etmam.billing_credit_packs WHERE account_id=p_actor AND NOT revoked LOOP
  total:=total+pack.ai_limit;used:=used+pack.ai_used;pending:=pending+etmam.billing_pending(p_actor,'pack',pack.id);
 END LOOP;
 IF until_at IS NULL THEN SELECT max(paid_until),min(period_start) INTO until_at,since_at FROM etmam.billing_subscriptions WHERE account_id=p_actor;END IF;
 IF until_at IS NULL THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('active',coalesce(m.expires>now(),false) OR has_plan,'expires',until_at,'activated',since_at,'aiLimit',total,'aiUsed',used,'aiRemaining',greatest(0,total-used-pending),'maxDrafts',slots,'extraAiRemaining',coalesce((SELECT sum(greatest(0,p.ai_limit-p.ai_used-etmam.billing_pending(p_actor,'pack',p.id))) FROM etmam.billing_credit_packs p WHERE account_id=p_actor AND NOT revoked),0));
END$$;
CREATE OR REPLACE FUNCTION etmam.access(p_actor uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',p_actor,'telegramLinked',EXISTS(SELECT 1 FROM etmam.identities WHERE account_id=p_actor AND kind='telegram'),'membership',etmam.billing_membership(p_actor));
$$;
CREATE FUNCTION etmam.billing_reserve(p_actor uuid,p_job uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m etmam.memberships;q record;chosen uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM etmam.ai_reservations WHERE job_id=p_job) THEN RETURN;END IF;
 SELECT * INTO m FROM etmam.memberships WHERE account_id=p_actor;
 IF m.expires>now() AND m.ai_limit-m.ai_used-etmam.billing_pending(p_actor,'zid')>0 THEN INSERT INTO etmam.ai_reservations VALUES(p_job,p_actor,'zid',NULL,m.activated);RETURN;END IF;
 FOR q IN SELECT b.*,w.starts,w.expires FROM etmam.billing_subscriptions b CROSS JOIN LATERAL etmam.billing_month(b.period_start,b.paid_until) w WHERE b.account_id=p_actor AND NOT b.revoked ORDER BY w.expires LOOP
  INSERT INTO etmam.billing_allowances(environment,subscription_id,account_id,starts,expires,ai_limit) VALUES(q.environment,q.id,p_actor,q.starts,q.expires,q.ai_operations) ON CONFLICT(environment,subscription_id,starts) DO UPDATE SET ai_limit=excluded.ai_limit RETURNING id INTO chosen;
  IF EXISTS(SELECT 1 FROM etmam.billing_allowances a WHERE id=chosen AND ai_limit-ai_used-etmam.billing_pending(p_actor,'allowance',a.id)>0) THEN INSERT INTO etmam.ai_reservations VALUES(p_job,p_actor,'allowance',chosen,NULL);RETURN;END IF;
 END LOOP;
 SELECT id INTO chosen FROM etmam.billing_credit_packs p WHERE account_id=p_actor AND NOT revoked AND ai_limit-ai_used-etmam.billing_pending(p_actor,'pack',p.id)>0 ORDER BY id LIMIT 1;
 IF chosen IS NOT NULL THEN INSERT INTO etmam.ai_reservations VALUES(p_job,p_actor,'pack',chosen,NULL);RETURN;END IF;
 RAISE EXCEPTION 'ai_limit';
END$$;
CREATE FUNCTION etmam.billing_charge(p_actor uuid,p_job uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE q etmam.ai_reservations;BEGIN
 SELECT * INTO q FROM etmam.ai_reservations WHERE account_id=p_actor AND job_id=p_job;
 IF q.source='zid' THEN UPDATE etmam.memberships SET ai_used=least(ai_limit,ai_used+1) WHERE account_id=p_actor AND activated=q.legacy_activated;
 ELSIF q.source='allowance' THEN UPDATE etmam.billing_allowances SET ai_used=ai_used+1 WHERE id=q.source_id;
 ELSIF q.source='pack' THEN UPDATE etmam.billing_credit_packs SET ai_used=ai_used+1 WHERE id=q.source_id;
 ELSE RAISE EXCEPTION 'quota_reservation_missing';END IF;
END$$;

DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['billing_offers','billing_intents','billing_subscriptions','billing_orders','billing_events','billing_revocations','billing_allowances','billing_credit_packs','ai_reservations'] LOOP
  EXECUTE format('ALTER TABLE etmam.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON etmam.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON etmam.%I TO service_role',t);
 END LOOP;
END$$;
REVOKE ALL ON FUNCTION etmam.billing_month(timestamptz,timestamptz,timestamptz),etmam.billing_pending(uuid,text,uuid),etmam.billing_membership(uuid),etmam.billing_reserve(uuid,uuid),etmam.billing_charge(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION etmam.billing_month(timestamptz,timestamptz,timestamptz),etmam.billing_pending(uuid,text,uuid),etmam.billing_membership(uuid),etmam.billing_reserve(uuid,uuid),etmam.billing_charge(uuid,uuid) TO service_role;

-- Trusted server gateway only. Raw webhook JSON is verified and normalized before this call.
CREATE FUNCTION public.etmam_billing(p_actor uuid,p_action text,p_environment text,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE offer etmam.billing_offers;i etmam.billing_intents;s etmam.billing_subscriptions;actor uuid;tx text;r jsonb;event_at timestamptz;old_order etmam.billing_orders;
BEGIN
 IF p_environment NOT IN ('sandbox','live') THEN RAISE EXCEPTION 'invalid_environment';END IF;
 IF p_action NOT LIKE 'event.%' THEN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'unauthorized';END IF;
  PERFORM id FROM etmam.accounts WHERE id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unauthorized';END IF;
 END IF;
 IF p_action='catalog' THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(o)-'environment'-'enabled' ORDER BY kind DESC,usd_cents) FROM etmam.billing_offers o WHERE environment=p_environment AND enabled),'[]');
 ELSIF p_action='status' THEN RETURN jsonb_build_object('subscriptions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'status',status,'expires',paid_until,'priceId',price_id,'maxDrafts',max_drafts,'aiMonthly',ai_operations,'revoked',revoked)) FROM etmam.billing_subscriptions WHERE account_id=p_actor AND environment=p_environment),'[]'),'extraAiRemaining',etmam.billing_membership(p_actor)->'extraAiRemaining');
 ELSIF p_action='portal' THEN
  SELECT * INTO s FROM etmam.billing_subscriptions WHERE account_id=p_actor AND environment=p_environment ORDER BY paid_until DESC LIMIT 1;
  IF s.id IS NULL THEN RAISE EXCEPTION 'not_found';END IF;
  RETURN jsonb_build_object('customerId',s.customer_id,'subscriptionId',s.id);
 ELSIF p_action='intent.create' THEN
  SELECT * INTO offer FROM etmam.billing_offers WHERE environment=p_environment AND sku=p_payload->>'sku' AND enabled;
  IF offer.sku IS NULL THEN RAISE EXCEPTION 'offer_unavailable';END IF;
  IF offer.kind='ai' AND NOT coalesce((etmam.billing_membership(p_actor)->>'active')::boolean,false) THEN RAISE EXCEPTION 'subscription_required';END IF;
  IF offer.kind='subscription' AND EXISTS(SELECT 1 FROM etmam.billing_subscriptions WHERE account_id=p_actor AND environment=p_environment AND status IN ('active','trialing','past_due','paused') AND NOT revoked) THEN RAISE EXCEPTION 'subscription_exists';END IF;
  SELECT * INTO i FROM etmam.billing_intents WHERE id=(p_payload->>'id')::uuid;
  IF i.id IS NOT NULL THEN
   IF i.account_id<>p_actor OR i.environment<>p_environment OR i.sku<>offer.sku THEN RAISE EXCEPTION 'intent_conflict';END IF;
  ELSE
   IF (SELECT count(*) FROM etmam.billing_intents WHERE account_id=p_actor AND created_at>now()-interval '15 minutes')>=5 THEN RAISE EXCEPTION 'checkout_rate_limit';END IF;
   INSERT INTO etmam.billing_intents(id,account_id,environment,sku) VALUES((p_payload->>'id')::uuid,p_actor,p_environment,offer.sku) RETURNING * INTO i;
  END IF;
  RETURN jsonb_build_object('intent',to_jsonb(i),'offer',to_jsonb(offer));
 ELSIF p_action='intent.claim' THEN
  UPDATE etmam.billing_intents SET creating=true WHERE id=(p_payload->>'id')::uuid AND account_id=p_actor AND environment=p_environment AND NOT creating AND transaction_id IS NULL;RETURN to_jsonb(FOUND);
 ELSIF p_action='intent.bind' THEN
  UPDATE etmam.billing_intents SET transaction_id=p_payload->>'transactionId' WHERE id=(p_payload->>'id')::uuid AND account_id=p_actor AND environment=p_environment AND (transaction_id IS NULL OR transaction_id=p_payload->>'transactionId') RETURNING * INTO i;
  IF i.id IS NULL THEN RAISE EXCEPTION 'intent_conflict';END IF;RETURN to_jsonb(i);
 ELSIF p_action='intent.get' THEN
  SELECT * INTO i FROM etmam.billing_intents WHERE id=(p_payload->>'id')::uuid AND account_id=p_actor AND environment=p_environment;
  IF i.id IS NULL THEN RAISE EXCEPTION 'not_found';END IF;
  RETURN jsonb_build_object('completed',EXISTS(SELECT 1 FROM etmam.billing_orders WHERE intent_id=i.id AND NOT revoked),'transactionId',i.transaction_id);
 ELSIF p_action='event.lookup' THEN
  IF p_payload->>'subscriptionId' IS NOT NULL THEN SELECT * INTO s FROM etmam.billing_subscriptions WHERE environment=p_environment AND id=p_payload->>'subscriptionId';END IF;
  IF s.id IS NOT NULL THEN
   SELECT * INTO offer FROM etmam.billing_offers WHERE environment=p_environment AND price_id=p_payload->>'priceId';
   RETURN jsonb_build_object('accountId',s.account_id,'subscription',to_jsonb(s),'offer',to_jsonb(offer));
  END IF;
  SELECT * INTO i FROM etmam.billing_intents WHERE id=(p_payload->>'intentId')::uuid AND environment=p_environment;
  IF i.id IS NULL THEN RETURN NULL;END IF;
  SELECT * INTO offer FROM etmam.billing_offers WHERE environment=p_environment AND sku=i.sku;
  RETURN jsonb_build_object('accountId',i.account_id,'intent',to_jsonb(i),'offer',to_jsonb(offer));
 ELSIF p_action='event.complete' THEN
  actor:=(p_payload->>'accountId')::uuid;tx:=p_payload->>'transactionId';event_at:=(p_payload->>'occurredAt')::timestamptz;
  PERFORM id FROM etmam.accounts WHERE id=actor FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'unauthorized';END IF;
  IF EXISTS(SELECT 1 FROM etmam.billing_revocations WHERE environment=p_environment AND transaction_id=tx) THEN RETURN '{}';END IF;
  SELECT * INTO old_order FROM etmam.billing_orders WHERE environment=p_environment AND transaction_id=tx;
  IF old_order.transaction_id IS NOT NULL THEN
   IF old_order.account_id<>actor THEN RAISE EXCEPTION 'payment_mismatch';END IF;RETURN '{}';
  END IF;
  SELECT * INTO offer FROM etmam.billing_offers WHERE environment=p_environment AND price_id=p_payload->>'priceId';
  IF offer.price_id IS NULL THEN RAISE EXCEPTION 'offer_unavailable';END IF;
  IF p_payload->>'intentId' IS NOT NULL THEN
   SELECT * INTO i FROM etmam.billing_intents WHERE id=(p_payload->>'intentId')::uuid AND account_id=actor AND environment=p_environment;
   IF i.id IS NULL OR (i.transaction_id IS NOT NULL AND i.transaction_id<>tx) THEN RAISE EXCEPTION 'payment_mismatch';END IF;
   UPDATE etmam.billing_intents SET transaction_id=tx WHERE id=i.id;
  ELSIF NOT EXISTS(SELECT 1 FROM etmam.billing_subscriptions WHERE environment=p_environment AND id=p_payload->>'subscriptionId' AND account_id=actor) THEN RAISE EXCEPTION 'payment_mismatch';END IF;
  INSERT INTO etmam.billing_orders(environment,transaction_id,account_id,intent_id,subscription_id,offer,paid_at) VALUES(p_environment,tx,actor,i.id,p_payload->>'subscriptionId',to_jsonb(offer),(p_payload->>'paidAt')::timestamptz);
  IF offer.kind='ai' THEN INSERT INTO etmam.billing_credit_packs(environment,transaction_id,account_id,ai_limit) VALUES(p_environment,tx,actor,offer.ai_operations);
  ELSE
   INSERT INTO etmam.billing_subscriptions(environment,id,account_id,customer_id,price_id,status,period_start,paid_until,ai_operations,max_drafts,updated_event,paid_transaction) VALUES(p_environment,p_payload->>'subscriptionId',actor,p_payload->>'customerId',offer.price_id,'active',(p_payload->>'periodStart')::timestamptz,(p_payload->>'periodEnd')::timestamptz,offer.ai_operations,offer.max_drafts,event_at,tx)
   ON CONFLICT(environment,id) DO UPDATE SET price_id=excluded.price_id,period_start=excluded.period_start,paid_until=excluded.paid_until,ai_operations=excluded.ai_operations,max_drafts=excluded.max_drafts,updated_event=excluded.updated_event,revoked=false,paid_transaction=excluded.paid_transaction WHERE etmam.billing_subscriptions.account_id=actor AND etmam.billing_subscriptions.updated_event<=event_at;
  END IF;
  INSERT INTO etmam.billing_events VALUES(p_environment,p_payload->>'eventId','transaction.completed',event_at,now()) ON CONFLICT DO NOTHING;
  RETURN etmam.access(actor);
 ELSIF p_action='event.subscription' THEN
  UPDATE etmam.billing_subscriptions SET status=p_payload->>'status',updated_event=(p_payload->>'occurredAt')::timestamptz,revoked=CASE WHEN p_payload->>'status'='paused' THEN true ELSE revoked END WHERE environment=p_environment AND id=p_payload->>'subscriptionId' AND updated_event<=(p_payload->>'occurredAt')::timestamptz;
  RETURN '{}';
 ELSIF p_action='event.refund' THEN
  INSERT INTO etmam.billing_revocations(environment,transaction_id) VALUES(p_environment,p_payload->>'transactionId') ON CONFLICT DO NOTHING;
  SELECT * INTO old_order FROM etmam.billing_orders WHERE environment=p_environment AND transaction_id=p_payload->>'transactionId';
  IF old_order.account_id IS NULL THEN RETURN '{}';END IF;
  PERFORM id FROM etmam.accounts WHERE id=old_order.account_id FOR UPDATE;
  UPDATE etmam.billing_orders SET revoked=true WHERE environment=p_environment AND transaction_id=old_order.transaction_id;
  UPDATE etmam.billing_credit_packs SET revoked=true WHERE environment=p_environment AND transaction_id=old_order.transaction_id;
  UPDATE etmam.billing_subscriptions SET revoked=true WHERE environment=p_environment AND paid_transaction=old_order.transaction_id;
  RETURN '{}';
 END IF;
 RAISE EXCEPTION 'unknown_action';
END$$;
REVOKE ALL ON FUNCTION public.etmam_billing(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.etmam_billing(uuid,text,text,jsonb) TO service_role;




-- Shared gateway with payment entitlements
-- Section-level proposal approval. No additional AI requests or quota changes.
CREATE OR REPLACE FUNCTION public.etmam_command(p_actor uuid,p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a uuid;other uuid;d etmam.drafts;m etmam.memberships;c etmam.codes;j etmam.jobs;s etmam.sessions;u etmam.telegram_updates;r jsonb;pending integer;active boolean;new_expiry timestamptz;tok etmam.link_tokens;membership jsonb;selected_keys text[];field_key text;
BEGIN
 IF p_action='resolve' THEN RETURN to_jsonb(etmam.resolve_identity(p_payload->>'kind',p_payload->>'subject'));END IF;
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM etmam.accounts WHERE id=p_actor) THEN RAISE EXCEPTION 'unauthorized';END IF;
 IF p_action='link.consume' THEN
  SELECT * INTO tok FROM etmam.link_tokens WHERE secret_hash=p_payload->>'hash' FOR UPDATE;
  IF tok.secret_hash IS NULL OR tok.used_at IS NOT NULL OR tok.expires<=now() THEN RAISE EXCEPTION 'link_expired';END IF;
  other:=tok.account_id;
  PERFORM id FROM etmam.accounts WHERE id IN (p_actor,other) ORDER BY id FOR UPDATE;
  IF p_actor<>other THEN
   IF EXISTS(SELECT 1 FROM etmam.identities WHERE account_id=other AND kind='telegram' AND subject<>p_payload->>'subject') THEN RAISE EXCEPTION 'link_conflict';END IF;
   IF EXISTS(SELECT 1 FROM etmam.identities WHERE account_id=p_actor AND kind='email') THEN RAISE EXCEPTION 'link_conflict';END IF;
   IF ((EXISTS(SELECT 1 FROM etmam.memberships WHERE account_id=p_actor) OR EXISTS(SELECT 1 FROM etmam.billing_orders WHERE account_id=p_actor)) OR EXISTS(SELECT 1 FROM etmam.drafts WHERE account_id=p_actor)) AND ((EXISTS(SELECT 1 FROM etmam.memberships WHERE account_id=other) OR EXISTS(SELECT 1 FROM etmam.billing_orders WHERE account_id=other)) OR EXISTS(SELECT 1 FROM etmam.drafts WHERE account_id=other)) THEN RAISE EXCEPTION 'link_conflict';END IF;
   IF (EXISTS(SELECT 1 FROM etmam.memberships WHERE account_id=p_actor) OR EXISTS(SELECT 1 FROM etmam.billing_orders WHERE account_id=p_actor)) OR EXISTS(SELECT 1 FROM etmam.drafts WHERE account_id=p_actor) THEN
    UPDATE etmam.identities SET account_id=p_actor WHERE account_id=other;other:=p_actor;
   ELSE
    IF EXISTS(SELECT 1 FROM etmam.sessions WHERE account_id=p_actor AND body->'data'->>'name' IS NOT NULL) AND EXISTS(SELECT 1 FROM etmam.drafts WHERE account_id=other) THEN RAISE EXCEPTION 'link_conflict';END IF;
    UPDATE etmam.identities SET account_id=other WHERE account_id=p_actor;
    UPDATE etmam.sessions SET account_id=other WHERE account_id=p_actor AND NOT EXISTS(SELECT 1 FROM etmam.sessions WHERE account_id=other);
   END IF;
  END IF;
  UPDATE etmam.link_tokens SET used_at=now() WHERE secret_hash=tok.secret_hash;RETURN etmam.access(other);
 END IF;
 PERFORM id FROM etmam.accounts WHERE id=p_actor FOR UPDATE;
 SELECT * INTO m FROM etmam.memberships WHERE account_id=p_actor;membership:=etmam.billing_membership(p_actor);active:=coalesce((membership->>'active')::boolean,false);
 IF p_action='identity.telegram' THEN
  INSERT INTO etmam.identities VALUES('telegram',p_payload->>'subject',p_actor) ON CONFLICT(kind,subject) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM etmam.identities WHERE kind='telegram' AND subject=p_payload->>'subject' AND account_id=p_actor) THEN RAISE EXCEPTION 'link_conflict';END IF;RETURN '{}';
 ELSIF p_action='me' THEN RETURN etmam.access(p_actor);
 ELSIF p_action='link.create' THEN
  DELETE FROM etmam.link_tokens WHERE account_id=p_actor AND used_at IS NULL;INSERT INTO etmam.link_tokens VALUES(p_payload->>'hash',p_actor,now()+interval '5 minutes',NULL);RETURN '{}';
 ELSIF p_action='redeem' THEN
  IF (SELECT count(*) FROM etmam.code_attempts WHERE account_id=p_actor AND created>now()-interval '15 minutes')>=10 THEN RETURN jsonb_build_object('error','activation_rate_limit');END IF;
  INSERT INTO etmam.code_attempts(account_id) VALUES(p_actor);
  SELECT * INTO c FROM etmam.codes WHERE secret_hash=p_payload->>'hash' FOR UPDATE;
  IF c.secret_hash IS NULL OR c.state='revoked' THEN RETURN jsonb_build_object('error','invalid_code');END IF;
  IF c.redeemed_account IS NOT NULL THEN IF c.redeemed_account=p_actor THEN RETURN etmam.access(p_actor);ELSE RETURN jsonb_build_object('error','code_used');END IF;END IF;
  new_expiry:=((CASE WHEN coalesce(m.expires>now(),false) THEN m.expires ELSE now() END AT TIME ZONE 'Asia/Riyadh')+interval '3 months') AT TIME ZONE 'Asia/Riyadh';
  INSERT INTO etmam.memberships VALUES(p_actor,CASE WHEN coalesce(m.expires>now(),false) THEN m.activated ELSE now() END,new_expiry,CASE WHEN coalesce(m.expires>now(),false) THEN m.ai_limit+8 ELSE 8 END,CASE WHEN coalesce(m.expires>now(),false) THEN m.ai_used ELSE 0 END)
  ON CONFLICT(account_id) DO UPDATE SET activated=excluded.activated,expires=excluded.expires,ai_limit=excluded.ai_limit,ai_used=excluded.ai_used;
  UPDATE etmam.codes SET state='redeemed',redeemed_account=p_actor,redeemed_at=now() WHERE secret_hash=c.secret_hash;
  RETURN etmam.access(p_actor);
 ELSIF p_action='drafts.list' THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)-'account_id'-'approved_content'-'approved_design' ORDER BY updated_at DESC) FROM etmam.drafts x WHERE account_id=p_actor),'[]');
 ELSIF p_action='drafts.create' THEN
  IF NOT active THEN RAISE EXCEPTION 'subscription_required';END IF;
  IF (SELECT count(*) FROM etmam.drafts WHERE account_id=p_actor)>=coalesce((membership->>'maxDrafts')::integer,2) THEN RAISE EXCEPTION 'draft_limit';END IF;
  INSERT INTO etmam.drafts(account_id,title,content,design) VALUES(p_actor,left(coalesce(p_payload->>'title','سيرتي الذاتية'),120),p_payload->'content',p_payload->'design') RETURNING * INTO d;
  RETURN to_jsonb(d)-'account_id'-'approved_content'-'approved_design';
 ELSIF p_action LIKE 'drafts.%' THEN
  SELECT * INTO d FROM etmam.drafts WHERE id=(p_payload->>'id')::uuid AND account_id=p_actor FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'not_found';END IF;
  IF p_action='drafts.get' THEN RETURN to_jsonb(d)-'account_id'-'approved_content'-'approved_design';END IF;
  IF p_action='drafts.delete' THEN DELETE FROM etmam.sessions WHERE account_id=p_actor AND active_draft=d.id; DELETE FROM etmam.drafts WHERE id=d.id;RETURN '{}';END IF;
  IF NOT active THEN RAISE EXCEPTION 'subscription_required';END IF;
  IF d.revision<>(p_payload->>'revision')::integer THEN RAISE EXCEPTION 'revision_conflict';END IF;
  IF p_action='drafts.approve' THEN UPDATE etmam.drafts SET approved_content=content,approved_design=design,approved_revision=revision WHERE id=d.id RETURNING * INTO d;
  ELSIF p_action='drafts.save' THEN UPDATE etmam.drafts SET title=left(coalesce(p_payload->>'title',title),120),content=p_payload->'content',design=p_payload->'design',revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
  ELSE RAISE EXCEPTION 'unknown_action';END IF;
  RETURN to_jsonb(d)-'account_id'-'approved_content'-'approved_design';
 ELSIF p_action='jobs.create' THEN
  SELECT * INTO j FROM etmam.jobs WHERE account_id=p_actor AND idempotency_key=p_payload->>'idempotencyKey';
  IF j.id IS NOT NULL THEN RETURN to_jsonb(j)-'source'-'input'-'account_id';END IF;
  SELECT * INTO d FROM etmam.drafts WHERE id=(p_payload->>'draftId')::uuid AND account_id=p_actor;
  IF d.id IS NULL THEN RAISE EXCEPTION 'not_found';END IF;
  IF d.revision<>(p_payload->>'revision')::integer THEN RAISE EXCEPTION 'revision_conflict';END IF;
  IF p_payload->>'kind'='export' THEN
   IF d.approved_content IS NULL THEN RAISE EXCEPTION 'approval_required';END IF;
   r:=jsonb_build_object('content',d.approved_content,'design',d.approved_design,'revision',d.approved_revision);
  ELSE
   IF NOT active THEN RAISE EXCEPTION 'subscription_required';END IF;
   IF p_payload->>'consent'<>'true' THEN RAISE EXCEPTION 'consent_required';END IF;
   SELECT count(*) INTO pending FROM etmam.jobs WHERE account_id=p_actor AND kind<>'export' AND state IN ('queued','running');
   IF coalesce((membership->>'aiRemaining')::integer,0)<=0 THEN RAISE EXCEPTION 'ai_limit';END IF;
   r:=jsonb_build_object('content',d.content,'design',d.design,'revision',d.revision);
  END IF;
  INSERT INTO etmam.jobs(account_id,draft_id,kind,idempotency_key,base_revision,source,input) VALUES(p_actor,d.id,p_payload->>'kind',p_payload->>'idempotencyKey',d.revision,r,p_payload-'draftId'-'idempotencyKey') RETURNING * INTO j;
  IF j.kind<>'export' THEN PERFORM etmam.billing_reserve(p_actor,j.id);END IF;
  RETURN to_jsonb(j)-'source'-'input'-'account_id';
 ELSIF p_action LIKE 'jobs.%' THEN
  SELECT * INTO j FROM etmam.jobs WHERE id=(p_payload->>'id')::uuid AND account_id=p_actor FOR UPDATE;
  IF j.id IS NULL THEN RAISE EXCEPTION 'not_found';END IF;
  IF p_action='jobs.get' THEN RETURN to_jsonb(j)-'source'-'input'-'account_id';
  ELSIF p_action='jobs.claim' THEN IF j.state<>'queued' THEN RETURN 'null';END IF;UPDATE etmam.jobs SET state='running',started_at=now() WHERE id=j.id RETURNING * INTO j;RETURN to_jsonb(j);
  ELSIF p_action='jobs.finish' THEN
   IF j.state<>'running' THEN RETURN '{}';END IF;
   IF p_payload->>'success'='true' THEN
    IF j.kind<>'export' THEN PERFORM etmam.billing_charge(p_actor,j.id);END IF;
    UPDATE etmam.jobs SET state='completed',result=p_payload->'result',completed_at=now(),input='{}',source='{}' WHERE id=j.id;
   ELSE UPDATE etmam.jobs SET state=CASE WHEN p_payload->>'uncertain'='true' THEN 'uncertain' ELSE 'failed' END,error=p_payload->>'error',completed_at=now(),input='{}',source='{}' WHERE id=j.id;END IF;RETURN '{}';
  ELSIF p_action='jobs.apply' THEN
   IF NOT active THEN RAISE EXCEPTION 'subscription_required';END IF;
   SELECT * INTO d FROM etmam.drafts WHERE id=j.draft_id AND account_id=p_actor FOR UPDATE;
   IF d.id IS NULL THEN RAISE EXCEPTION 'not_found';END IF;
   IF j.state<>'completed' OR j.result->'content' IS NULL THEN RAISE EXCEPTION 'revision_conflict';END IF;
   IF p_payload->'keys' IS NULL OR p_payload->'keys'='null'::jsonb THEN
    IF coalesce(jsonb_array_length(j.result->'appliedKeys'),0)>0 THEN RAISE EXCEPTION 'revision_conflict';END IF;
    selected_keys:=ARRAY(SELECT jsonb_object_keys(j.result->'content'));
   ELSE
    IF jsonb_typeof(p_payload->'keys')<>'array' OR jsonb_array_length(p_payload->'keys') NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION 'invalid_proposal_selection';END IF;
    selected_keys:=ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_payload->'keys'));
   END IF;
   FOREACH field_key IN ARRAY selected_keys LOOP
    IF NOT field_key=ANY(ARRAY['name','headline','email','phone','country','city','linkedin','github','summary','language','profile','education','experience','projects','skills','courses','certifications','volunteering','languages']) OR NOT (j.result->'content' ? field_key) THEN RAISE EXCEPTION 'invalid_proposal_selection';END IF;
   END LOOP;
   IF NOT EXISTS(SELECT 1 FROM unnest(selected_keys) k WHERE NOT coalesce(j.result->'appliedKeys','[]'::jsonb) ? k) THEN RETURN to_jsonb(d)-'account_id'-'approved_content'-'approved_design';END IF;
   IF j.base_revision<>d.revision OR d.revision<>(p_payload->>'revision')::integer THEN RAISE EXCEPTION 'revision_conflict';END IF;
   r:='{}'::jsonb;
   FOREACH field_key IN ARRAY selected_keys LOOP
    IF NOT coalesce(j.result->'appliedKeys','[]'::jsonb) ? field_key THEN r:=r||jsonb_build_object(field_key,j.result->'content'->field_key);END IF;
   END LOOP;
   UPDATE etmam.drafts SET content=content||r,revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
   UPDATE etmam.jobs SET base_revision=d.revision,result=jsonb_set(result,'{appliedKeys}',coalesce(result->'appliedKeys','[]'::jsonb)||to_jsonb(selected_keys)) WHERE id=j.id;
   RETURN to_jsonb(d)-'account_id'-'approved_content'-'approved_design';
  END IF;
 ELSIF p_action='session.get' THEN RETURN (SELECT to_jsonb(x)-'account_id' FROM etmam.sessions x WHERE account_id=p_actor);
 ELSIF p_action='session.set' THEN
  SELECT * INTO s FROM etmam.sessions WHERE account_id=p_actor;
  IF coalesce(s.version,0)<>coalesce((p_payload->>'version')::integer,0) THEN RAISE EXCEPTION 'revision_conflict';END IF;
  IF p_payload->>'draftId' IS NOT NULL THEN
   SELECT * INTO d FROM etmam.drafts WHERE id=(p_payload->>'draftId')::uuid AND account_id=p_actor FOR UPDATE;
   IF d.id IS NULL THEN RAISE EXCEPTION 'not_found';END IF;
   IF d.revision<>coalesce((p_payload->>'baseRevision')::integer,0) THEN RAISE EXCEPTION 'revision_conflict';END IF;
   IF d.content IS DISTINCT FROM p_payload->'content' AND NOT active THEN RAISE EXCEPTION 'subscription_required';END IF;
   IF d.content IS DISTINCT FROM p_payload->'content' THEN UPDATE etmam.drafts SET content=p_payload->'content',revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;END IF;
   IF p_payload->>'approved'='true' AND active THEN UPDATE etmam.drafts SET approved_content=content,approved_design=design,approved_revision=revision WHERE id=d.id;END IF;
  END IF;
  INSERT INTO etmam.sessions VALUES(p_actor,p_payload->'body',coalesce(s.version,0)+1,d.id,d.revision,now()) ON CONFLICT(account_id) DO UPDATE SET body=excluded.body,version=excluded.version,active_draft=excluded.active_draft,base_revision=excluded.base_revision,updated_at=now() RETURNING * INTO s;
  RETURN to_jsonb(s)-'account_id';
 ELSIF p_action='session.delete' THEN DELETE FROM etmam.sessions WHERE account_id=p_actor;RETURN '{}';
 ELSIF p_action='feedback.save' THEN
  IF (SELECT count(*) FROM etmam.feedback WHERE account_id=p_actor AND created_at>now()-interval '1 day')>=5 THEN RAISE EXCEPTION 'feedback_limit';END IF;
  INSERT INTO etmam.feedback VALUES((p_payload->>'id')::uuid,p_actor,p_payload,now()) ON CONFLICT(id) DO NOTHING;RETURN to_jsonb(p_payload->>'id');
 ELSIF p_action='feedback.list' THEN RETURN jsonb_build_object('total',(SELECT count(*) FROM etmam.feedback),'item',(SELECT body||jsonb_build_object('created',extract(epoch from created_at)*1000) FROM etmam.feedback ORDER BY created_at DESC LIMIT 1 OFFSET greatest(0,(p_payload->>'page')::integer)));
 ELSIF p_action='telegram.enqueue' THEN INSERT INTO etmam.telegram_updates(id,account_id,body) VALUES((p_payload->>'id')::bigint,p_actor,p_payload->'body') ON CONFLICT DO NOTHING;RETURN '{}';
 ELSIF p_action='telegram.claim' THEN
  IF EXISTS(SELECT 1 FROM etmam.telegram_updates WHERE account_id=p_actor AND state='running') THEN RETURN 'null';END IF;
  SELECT * INTO u FROM etmam.telegram_updates WHERE account_id=p_actor AND state='queued' ORDER BY id LIMIT 1 FOR UPDATE;
  IF u.id IS NULL THEN RETURN 'null';END IF;UPDATE etmam.telegram_updates SET state='running',started_at=now() WHERE id=u.id;RETURN to_jsonb(u);
 ELSIF p_action='telegram.finish' THEN UPDATE etmam.telegram_updates SET state=CASE WHEN p_payload->>'success'='true' THEN 'done' ELSE 'uncertain' END,body='{}',error=p_payload->>'error' WHERE id=(p_payload->>'id')::bigint AND account_id=p_actor;RETURN '{}';
 ELSIF p_action='cache.get' THEN RETURN (SELECT to_jsonb(x)-'account_id' FROM etmam.pdf_cache x WHERE cache_key=p_payload->>'key' AND account_id=p_actor);
 ELSIF p_action='cache.put' THEN INSERT INTO etmam.pdf_cache VALUES(p_payload->>'key',p_actor,p_payload->>'path',now()) ON CONFLICT DO NOTHING;RETURN '{}';
 END IF;
 RAISE EXCEPTION 'unknown_action';
END$$;