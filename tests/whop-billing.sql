DO $$
DECLARE
  actor uuid;
  other uuid;
  intent uuid := gen_random_uuid();
  other_intent uuid := gen_random_uuid();
  linked_intent uuid := gen_random_uuid();
  live_intent uuid := gen_random_uuid();
  paid_at timestamptz := now();
  membership jsonb;
  draft jsonb;
  job jsonb;
BEGIN
  INSERT INTO etmam.accounts DEFAULT VALUES RETURNING id INTO actor;
  INSERT INTO etmam.accounts DEFAULT VALUES RETURNING id INTO other;
  PERFORM public.etmam_whop_checkout(actor,'sandbox',intent,'create');
  PERFORM public.etmam_whop_checkout(other,'sandbox',other_intent,'create');
  BEGIN
    PERFORM public.etmam_whop_checkout(other,'sandbox',intent,'get');
    RAISE EXCEPTION 'other_account_read_checkout';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'not_found' THEN RAISE; END IF;
  END;
  PERFORM public.etmam_whop_checkout(actor,'sandbox',intent,'bind','ch_testone','https://sandbox.whop.com/checkout/ch_testone');
  PERFORM public.etmam_whop_checkout(other,'sandbox',other_intent,'bind','ch_testtwo','https://sandbox.whop.com/checkout/ch_testtwo');

  IF etmam.billing_membership(actor) IS NOT NULL THEN RAISE EXCEPTION 'pending_activated'; END IF;
  BEGIN
    PERFORM public.etmam_whop_activate('live',intent,'ch_testone','pay_whoptest',paid_at);
    RAISE EXCEPTION 'sandbox_crossed_to_live';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'payment_mismatch' THEN RAISE; END IF;
  END;
  IF NOT public.etmam_whop_activate('sandbox',intent,'ch_testone','pay_whoptest',paid_at) THEN RAISE EXCEPTION 'whop_not_activated'; END IF;
  IF public.etmam_whop_checkout(actor,'sandbox',intent,'get')->>'completed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'whop_status_not_updated'; END IF;
  IF public.etmam_whop_activate('sandbox',intent,'ch_testone','pay_whoptest',paid_at) THEN RAISE EXCEPTION 'whop_activation_replayed'; END IF;
  BEGIN
    PERFORM public.etmam_whop_activate('sandbox',other_intent,'ch_testtwo','pay_whoptest',paid_at);
    RAISE EXCEPTION 'payment_reused';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF etmam.billing_membership(other) IS NOT NULL THEN RAISE EXCEPTION 'cross_account_activation'; END IF;
  INSERT INTO etmam.identities(kind,subject,account_id) VALUES ('email','whop-link-test',other);
  PERFORM public.etmam_whop_checkout(other,'sandbox',linked_intent,'create');
  UPDATE etmam.identities SET account_id=actor WHERE kind='email' AND subject='whop-link-test';
  IF public.etmam_whop_checkout(actor,'sandbox',linked_intent,'get')->>'intentId' IS DISTINCT FROM linked_intent::text THEN
    RAISE EXCEPTION 'pending_whop_checkout_not_linked';
  END IF;

  membership := etmam.billing_membership(actor);
  IF membership->>'maxDrafts' IS DISTINCT FROM '1'
     OR membership->>'aiRemaining' IS DISTINCT FROM '3'
     OR (membership->>'expires')::timestamptz IS DISTINCT FROM paid_at + interval '720 hours' THEN
    RAISE EXCEPTION 'whop_wrong_entitlement';
  END IF;
  draft := public.etmam_command(actor,'drafts.create','{"content":{},"design":{}}');
  BEGIN
    PERFORM public.etmam_command(actor,'drafts.create','{"content":{},"design":{}}');
    RAISE EXCEPTION 'whop_second_draft';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'draft_limit' THEN RAISE; END IF;
  END;
  FOR operation IN 1..3 LOOP
    job := public.etmam_command(actor,'jobs.create',jsonb_build_object(
      'draftId',draft->>'id','revision',1,'kind','improve','consent',true,'idempotencyKey','whop-test-'||operation));
    PERFORM public.etmam_command(actor,'jobs.claim',jsonb_build_object('id',job->>'id'));
    PERFORM public.etmam_command(actor,'jobs.finish',jsonb_build_object('id',job->>'id','success',true,'result','{}'::jsonb));
  END LOOP;
  IF etmam.billing_membership(actor)->>'aiRemaining' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'whop_credits_not_charged'; END IF;
  BEGIN
    PERFORM public.etmam_command(actor,'jobs.create',jsonb_build_object(
      'draftId',draft->>'id','revision',1,'kind','improve','consent',true,'idempotencyKey','whop-test-over-limit'));
    RAISE EXCEPTION 'whop_fourth_operation';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'ai_limit' THEN RAISE; END IF;
  END;

  INSERT INTO etmam.memberships(account_id,activated,expires,ai_limit) VALUES (actor,now(),now()+interval '3 months',10);
  IF etmam.billing_membership(actor)->>'maxDrafts' IS DISTINCT FROM '2'
     OR etmam.billing_membership(actor)->>'aiRemaining' IS DISTINCT FROM '10' THEN RAISE EXCEPTION 'zid_entitlement_changed'; END IF;
  PERFORM public.etmam_whop_checkout(other,'live',live_intent,'create');
  PERFORM public.etmam_whop_checkout(other,'live',live_intent,'bind','ch_testlive','https://whop.com/checkout/ch_testlive');
  IF NOT public.etmam_whop_activate('live',live_intent,'ch_testlive','pay_whoplive',paid_at) THEN
    RAISE EXCEPTION 'live_whop_not_activated';
  END IF;
  IF (SELECT offer->>'amountMinor' FROM etmam.billing_orders
      WHERE environment='whop_live' AND transaction_id='pay_whoplive') IS DISTINCT FROM '1000' THEN
    RAISE EXCEPTION 'live_whop_wrong_order_amount';
  END IF;
  IF has_function_privilege('anon','public.etmam_whop_activate(text,uuid,text,text,timestamptz)','execute')
     OR has_function_privilege('authenticated','public.etmam_whop_activate(text,uuid,text,text,timestamptz)','execute') THEN
    RAISE EXCEPTION 'public_whop_activation';
  END IF;
END;
$$;
