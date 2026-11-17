CREATE TABLE etmam.whop_intents (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES etmam.accounts(id),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  created_at timestamptz NOT NULL DEFAULT now(),
  configuration_id text CHECK (configuration_id ~ '^ch_[a-zA-Z0-9]{3,64}$'),
  checkout_url text,
  payment_id text CHECK (payment_id ~ '^pay_[a-zA-Z0-9]{3,64}$'),
  paid_at timestamptz,
  UNIQUE (environment, configuration_id),
  UNIQUE (environment, payment_id),
  CHECK ((configuration_id IS NULL) = (checkout_url IS NULL)),
  CHECK ((payment_id IS NULL) = (paid_at IS NULL)),
  CHECK (payment_id IS NULL OR configuration_id IS NOT NULL)
);

ALTER TABLE etmam.whop_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON etmam.whop_intents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON etmam.whop_intents TO service_role;
CREATE INDEX whop_intents_account_created ON etmam.whop_intents(account_id,environment,created_at);

-- Linking an email identity to an existing Telegram account may move the email.
-- Paid orders are already covered by the existing merge protection.
CREATE FUNCTION etmam.move_pending_whop_intents() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  UPDATE etmam.whop_intents SET account_id = NEW.account_id
  WHERE account_id = OLD.account_id AND payment_id IS NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION etmam.move_pending_whop_intents() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER whop_follow_email_identity AFTER UPDATE OF account_id ON etmam.identities
FOR EACH ROW WHEN (OLD.kind = 'email' AND OLD.account_id IS DISTINCT FROM NEW.account_id)
EXECUTE FUNCTION etmam.move_pending_whop_intents();

CREATE FUNCTION public.etmam_whop_checkout(
  p_actor uuid, p_environment text, p_intent uuid, p_action text,
  p_configuration text DEFAULT NULL, p_url text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  intent etmam.whop_intents;
BEGIN
  IF p_action NOT IN ('create','bind','get') OR p_action IS NULL THEN RAISE EXCEPTION 'unknown_action'; END IF;
  IF p_action <> 'get' THEN
    PERFORM id FROM etmam.accounts WHERE id = p_actor FOR UPDATE;
  END IF;

  SELECT * INTO intent FROM etmam.whop_intents
  WHERE id = p_intent AND account_id = p_actor AND environment = p_environment;
  IF NOT FOUND THEN
    IF p_action <> 'create' THEN RAISE EXCEPTION 'not_found'; END IF;
    IF (SELECT count(*) FROM etmam.whop_intents WHERE account_id = p_actor
        AND environment = p_environment AND created_at > now() - interval '1 hour') >= 5 THEN
      RAISE EXCEPTION 'checkout_rate_limit';
    END IF;
    INSERT INTO etmam.whop_intents(id,account_id,environment)
    VALUES (p_intent,p_actor,p_environment)
    ON CONFLICT (id) DO NOTHING RETURNING * INTO intent;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  END IF;

  IF p_action <> 'get' AND intent.configuration_id IS NULL
     AND intent.created_at < now() - interval '23 hours' THEN
    RAISE EXCEPTION 'checkout_pending';
  END IF;
  IF p_action = 'bind' THEN
    IF p_configuration IS NULL OR p_url IS NULL THEN RAISE EXCEPTION 'payment_mismatch'; END IF;
    IF intent.configuration_id IS NULL THEN
      UPDATE etmam.whop_intents SET configuration_id = p_configuration, checkout_url = p_url
      WHERE id = intent.id RETURNING * INTO intent;
    ELSIF intent.configuration_id <> p_configuration OR intent.checkout_url <> p_url THEN
      RAISE EXCEPTION 'payment_mismatch';
    END IF;
  END IF;
  RETURN jsonb_build_object('intentId',intent.id,'configurationId',intent.configuration_id,
    'url',intent.checkout_url,'completed',intent.payment_id IS NOT NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.etmam_whop_checkout(uuid,text,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etmam_whop_checkout(uuid,text,uuid,text,text,text) TO service_role;

CREATE FUNCTION public.etmam_whop_find_intent(p_environment text,p_configuration text)
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT id FROM etmam.whop_intents WHERE environment=p_environment AND configuration_id=p_configuration;
$$;
REVOKE ALL ON FUNCTION public.etmam_whop_find_intent(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etmam_whop_find_intent(text,text) TO service_role;

-- The server calls this only after retrieving and validating the payment from Whop.
-- The same account lock is used for draft changes and AI reservations.
CREATE FUNCTION public.etmam_whop_activate(
  p_environment text, p_intent uuid, p_configuration text, p_payment text, p_paid_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  intent etmam.whop_intents;
  actor uuid;
BEGIN
  SELECT account_id INTO STRICT actor FROM etmam.whop_intents WHERE id = p_intent;
  PERFORM id FROM etmam.accounts WHERE id = actor FOR UPDATE;
  SELECT * INTO STRICT intent FROM etmam.whop_intents WHERE id = p_intent FOR UPDATE;
  IF actor IS DISTINCT FROM intent.account_id THEN RAISE EXCEPTION 'checkout_pending'; END IF;

  IF p_environment IS DISTINCT FROM intent.environment OR p_configuration IS NULL
     OR p_configuration IS DISTINCT FROM intent.configuration_id
     OR p_payment IS NULL OR p_payment !~ '^pay_[a-zA-Z0-9]{3,64}$'
     OR p_paid_at IS NULL OR p_paid_at < intent.created_at - interval '5 minutes'
     OR p_paid_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'payment_mismatch';
  END IF;

  IF intent.payment_id IS NOT NULL THEN
    IF intent.payment_id <> p_payment THEN RAISE EXCEPTION 'payment_mismatch'; END IF;
    RETURN false;
  END IF;

  UPDATE etmam.whop_intents SET payment_id = p_payment, paid_at = p_paid_at WHERE id = p_intent;
  INSERT INTO etmam.billing_subscriptions (
    environment, id, account_id, customer_id, price_id, period_start, paid_until,
    ai_operations, max_drafts, paid_transaction, paid_event_at
  ) VALUES (
    'whop_' || p_environment, p_payment, actor, actor::text, 'whop-starter',
    p_paid_at, p_paid_at + interval '720 hours', 3, 1, p_payment, p_paid_at
  );
  INSERT INTO etmam.billing_orders (
    environment,transaction_id,account_id,subscription_id,offer,paid_at
  ) VALUES (
    'whop_' || p_environment,p_payment,actor,p_payment,
    jsonb_build_object('sku','whop-starter','currency','sar','amountMinor',
      CASE WHEN p_environment = 'live' THEN 1000 ELSE 900 END),p_paid_at
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.etmam_whop_activate(text,uuid,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etmam_whop_activate(text,uuid,text,text,timestamptz) TO service_role;

-- Whop's one-time purchase has one credit window for its entire term.
CREATE FUNCTION etmam.billing_window(p_environment text,p_start timestamptz,p_end timestamptz)
RETURNS TABLE(starts timestamptz,expires timestamptz) LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT p_start,p_end WHERE p_environment IN ('whop_sandbox','whop_live') AND p_start <= now() AND p_end > now()
  UNION ALL
  SELECT w.starts,w.expires FROM etmam.billing_month(p_start,p_end) w
  WHERE p_environment NOT IN ('whop_sandbox','whop_live');
$$;
REVOKE ALL ON FUNCTION etmam.billing_window(text,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION etmam.billing_window(text,timestamptz,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION etmam.billing_membership(p_actor uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE m etmam.memberships; s record; pack record; total integer:=0;used integer:=0;pending integer:=0;slots integer:=0;until_at timestamptz;since_at timestamptz;has_plan boolean:=false;
BEGIN
 SELECT * INTO m FROM etmam.memberships WHERE account_id=p_actor;
 until_at:=m.expires;since_at:=m.activated;
 IF m.account_id IS NOT NULL THEN used:=m.ai_used;total:=m.ai_used;END IF;
 IF m.expires>now() THEN total:=m.ai_limit;slots:=2;pending:=etmam.billing_pending(p_actor,'zid');END IF;
 FOR s IN SELECT b.*,w.starts,w.expires,a.id allowance_id,coalesce(a.ai_used,0) used FROM etmam.billing_subscriptions b CROSS JOIN LATERAL etmam.billing_window(b.environment,b.period_start,b.paid_until) w LEFT JOIN etmam.billing_allowances a ON a.environment=b.environment AND a.subscription_id=b.id AND a.starts=w.starts WHERE b.account_id=p_actor AND NOT b.revoked AND b.status<>'paused' AND b.period_start<=now() AND b.paid_until>now() LOOP
  has_plan:=true;until_at:=greatest(until_at,s.paid_until);since_at:=least(since_at,s.period_start);slots:=greatest(slots,s.max_drafts);
  total:=total+s.ai_operations;used:=used+s.used;IF s.allowance_id IS NOT NULL THEN pending:=pending+etmam.billing_pending(p_actor,'allowance',s.allowance_id);END IF;
 END LOOP;
 FOR pack IN SELECT * FROM etmam.billing_credit_packs WHERE account_id=p_actor AND NOT revoked LOOP
  total:=total+pack.ai_limit;used:=used+pack.ai_used;pending:=pending+etmam.billing_pending(p_actor,'pack',pack.id);
 END LOOP;
 IF until_at IS NULL THEN SELECT max(paid_until),min(period_start) INTO until_at,since_at FROM etmam.billing_subscriptions WHERE account_id=p_actor;END IF;
 IF until_at IS NULL THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('active',coalesce(m.expires>now(),false) OR has_plan,'expires',until_at,'activated',since_at,'aiLimit',total,'aiUsed',used,'aiRemaining',greatest(0,total-used-pending),'maxDrafts',coalesce(nullif(slots,0),2),'extraAiRemaining',coalesce((SELECT sum(greatest(0,p.ai_limit-p.ai_used-etmam.billing_pending(p_actor,'pack',p.id))) FROM etmam.billing_credit_packs p WHERE account_id=p_actor AND NOT revoked),0));
END$$;

CREATE OR REPLACE FUNCTION etmam.billing_reserve(p_actor uuid,p_job uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m etmam.memberships;q record;chosen uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM etmam.ai_reservations WHERE job_id=p_job) THEN RETURN;END IF;
 SELECT * INTO m FROM etmam.memberships WHERE account_id=p_actor;
 IF m.expires>now() AND m.ai_limit-m.ai_used-etmam.billing_pending(p_actor,'zid')>0 THEN INSERT INTO etmam.ai_reservations VALUES(p_job,p_actor,'zid',NULL,m.activated);RETURN;END IF;
 FOR q IN SELECT b.*,w.starts,w.expires FROM etmam.billing_subscriptions b CROSS JOIN LATERAL etmam.billing_window(b.environment,b.period_start,b.paid_until) w WHERE b.account_id=p_actor AND NOT b.revoked AND b.status<>'paused' ORDER BY w.expires LOOP
  INSERT INTO etmam.billing_allowances(environment,subscription_id,account_id,starts,expires,ai_limit) VALUES(q.environment,q.id,p_actor,q.starts,q.expires,q.ai_operations) ON CONFLICT(environment,subscription_id,starts) DO UPDATE SET ai_limit=excluded.ai_limit RETURNING id INTO chosen;
  IF EXISTS(SELECT 1 FROM etmam.billing_allowances a WHERE id=chosen AND ai_limit-ai_used-etmam.billing_pending(p_actor,'allowance',a.id)>0) THEN INSERT INTO etmam.ai_reservations VALUES(p_job,p_actor,'allowance',chosen,NULL);RETURN;END IF;
 END LOOP;
 SELECT id INTO chosen FROM etmam.billing_credit_packs p WHERE account_id=p_actor AND NOT revoked AND ai_limit-ai_used-etmam.billing_pending(p_actor,'pack',p.id)>0 ORDER BY id LIMIT 1;
 IF chosen IS NOT NULL THEN INSERT INTO etmam.ai_reservations VALUES(p_job,p_actor,'pack',chosen,NULL);RETURN;END IF;
 RAISE EXCEPTION 'ai_limit';
END$$;
