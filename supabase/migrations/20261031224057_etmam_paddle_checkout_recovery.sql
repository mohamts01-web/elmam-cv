-- Safe retry after definitive validation failure; preserve paid and refunded sources.
CREATE OR REPLACE FUNCTION public.etmam_billing(p_actor uuid,p_action text,p_environment text,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
 ELSIF p_action='intent.release' THEN
  UPDATE etmam.billing_intents SET creating=false WHERE id=(p_payload->>'id')::uuid AND account_id=p_actor AND environment=p_environment AND transaction_id IS NULL;RETURN '{}';
 ELSIF p_action='intent.bind' THEN
  UPDATE etmam.billing_intents SET transaction_id=p_payload->>'transactionId' WHERE id=(p_payload->>'id')::uuid AND account_id=p_actor AND environment=p_environment AND (transaction_id IS NULL OR transaction_id=p_payload->>'transactionId') RETURNING * INTO i;
  IF i.id IS NULL THEN RAISE EXCEPTION 'intent_conflict';END IF;RETURN to_jsonb(i);
 ELSIF p_action='intent.get' THEN
  SELECT * INTO i FROM etmam.billing_intents WHERE id=(p_payload->>'id')::uuid AND account_id=p_actor AND environment=p_environment;
  IF i.id IS NULL THEN RAISE EXCEPTION 'not_found';END IF;
  RETURN jsonb_build_object('completed',EXISTS(SELECT 1 FROM etmam.billing_orders WHERE intent_id=i.id AND NOT revoked),'transactionId',i.transaction_id,'sku',i.sku);
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
  UPDATE etmam.billing_subscriptions SET status=p_payload->>'status',updated_event=(p_payload->>'occurredAt')::timestamptz WHERE environment=p_environment AND id=p_payload->>'subscriptionId' AND updated_event<=(p_payload->>'occurredAt')::timestamptz;
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

CREATE OR REPLACE FUNCTION etmam.billing_membership(p_actor uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE m etmam.memberships; s record; pack record; total integer:=0;used integer:=0;pending integer:=0;slots integer:=2;until_at timestamptz;since_at timestamptz;has_plan boolean:=false;
BEGIN
 SELECT * INTO m FROM etmam.memberships WHERE account_id=p_actor;
 until_at:=m.expires;since_at:=m.activated;
 IF m.account_id IS NOT NULL THEN used:=m.ai_used;total:=m.ai_used;END IF;
 IF m.expires>now() THEN total:=m.ai_limit;pending:=etmam.billing_pending(p_actor,'zid');END IF;
 FOR s IN SELECT b.*,w.starts,w.expires,a.id allowance_id,coalesce(a.ai_used,0) used FROM etmam.billing_subscriptions b CROSS JOIN LATERAL etmam.billing_month(b.period_start,b.paid_until) w LEFT JOIN etmam.billing_allowances a ON a.environment=b.environment AND a.subscription_id=b.id AND a.starts=w.starts WHERE b.account_id=p_actor AND NOT b.revoked AND b.status<>'paused' AND b.period_start<=now() AND b.paid_until>now() LOOP
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

CREATE OR REPLACE FUNCTION etmam.billing_reserve(p_actor uuid,p_job uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m etmam.memberships;q record;chosen uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM etmam.ai_reservations WHERE job_id=p_job) THEN RETURN;END IF;
 SELECT * INTO m FROM etmam.memberships WHERE account_id=p_actor;
 IF m.expires>now() AND m.ai_limit-m.ai_used-etmam.billing_pending(p_actor,'zid')>0 THEN INSERT INTO etmam.ai_reservations VALUES(p_job,p_actor,'zid',NULL,m.activated);RETURN;END IF;
 FOR q IN SELECT b.*,w.starts,w.expires FROM etmam.billing_subscriptions b CROSS JOIN LATERAL etmam.billing_month(b.period_start,b.paid_until) w WHERE b.account_id=p_actor AND NOT b.revoked AND b.status<>'paused' ORDER BY w.expires LOOP
  INSERT INTO etmam.billing_allowances(environment,subscription_id,account_id,starts,expires,ai_limit) VALUES(q.environment,q.id,p_actor,q.starts,q.expires,q.ai_operations) ON CONFLICT(environment,subscription_id,starts) DO UPDATE SET ai_limit=excluded.ai_limit RETURNING id INTO chosen;
  IF EXISTS(SELECT 1 FROM etmam.billing_allowances a WHERE id=chosen AND ai_limit-ai_used-etmam.billing_pending(p_actor,'allowance',a.id)>0) THEN INSERT INTO etmam.ai_reservations VALUES(p_job,p_actor,'allowance',chosen,NULL);RETURN;END IF;
 END LOOP;
 SELECT id INTO chosen FROM etmam.billing_credit_packs p WHERE account_id=p_actor AND NOT revoked AND ai_limit-ai_used-etmam.billing_pending(p_actor,'pack',p.id)>0 ORDER BY id LIMIT 1;
 IF chosen IS NOT NULL THEN INSERT INTO etmam.ai_reservations VALUES(p_job,p_actor,'pack',chosen,NULL);RETURN;END IF;
 RAISE EXCEPTION 'ai_limit';
END$$;

