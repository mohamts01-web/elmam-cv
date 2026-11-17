DO $$DECLARE actor uuid;other uuid;i uuid;d jsonb;j jsonb;r jsonb;e jsonb;k integer;BEGIN
 actor:=(public.etmam_command(NULL,'resolve','{"kind":"email","subject":"billing-test"}')#>>'{}')::uuid;
 other:=(public.etmam_command(NULL,'resolve','{"kind":"email","subject":"billing-other"}')#>>'{}')::uuid;
 INSERT INTO etmam.billing_offers VALUES('sandbox','basic_month','pri_basic','Basic','subscription',507,19,'month',5,2,true),('sandbox','plus_year','pri_plus','Plus','subscription',10400,390,'year',20,10,true),('sandbox','ai_10','pri_ai','Credits','ai',267,10,NULL,10,0,true);
 i:=gen_random_uuid();r:=public.etmam_billing(actor,'intent.create','sandbox',jsonb_build_object('id',i,'sku','basic_month'));
 PERFORM public.etmam_billing(actor,'intent.bind','sandbox',jsonb_build_object('id',i,'transactionId','txn_test'));
 BEGIN PERFORM public.etmam_billing(other,'intent.get','sandbox',jsonb_build_object('id',i));RAISE EXCEPTION 'intent_ownership';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'not_found' THEN RAISE;END IF;END;
 e:=jsonb_build_object('intentId',i,'accountId',actor,'transactionId','txn_test','priceId','pri_basic','subscriptionId','sub_test','customerId','ctm_test','periodStart',now()-interval '1 day','periodEnd',now()+interval '1 month','paidAt',now(),'occurredAt',now(),'eventId','evt_test');
 PERFORM public.etmam_billing(NULL,'event.complete','sandbox',e);PERFORM public.etmam_billing(NULL,'event.complete','sandbox',e);
 r:=public.etmam_command(actor,'me');IF r->'membership'->>'aiRemaining'<>'5' OR r->'membership'->>'maxDrafts'<>'2' THEN RAISE EXCEPTION 'paid_plan_or_double_grant';END IF;
 FOR k IN 1..2 LOOP d:=public.etmam_command(actor,'drafts.create','{"content":{"name":"Sample"},"design":{}}');END LOOP;
 BEGIN PERFORM public.etmam_command(actor,'drafts.create','{"content":{},"design":{}}');RAISE EXCEPTION 'third_allowed';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'draft_limit' THEN RAISE;END IF;END;
 FOR k IN 1..5 LOOP
  j:=public.etmam_command(actor,'jobs.create',jsonb_build_object('draftId',d->>'id','revision',1,'kind','improve','consent',true,'idempotencyKey','billing-'||k));
  PERFORM public.etmam_command(actor,'jobs.claim',jsonb_build_object('id',j->>'id'));
  PERFORM public.etmam_command(actor,'jobs.finish',jsonb_build_object('id',j->>'id','success',true,'result','{}'::jsonb));
 END LOOP;
 IF public.etmam_command(actor,'me')->'membership'->>'aiRemaining'<>'0' THEN RAISE EXCEPTION 'plan_did_not_charge';END IF;
 i:=gen_random_uuid();PERFORM public.etmam_billing(actor,'intent.create','sandbox',jsonb_build_object('id',i,'sku','ai_10'));
 e:=e||jsonb_build_object('intentId',i,'transactionId','txn_topup','priceId','pri_ai','subscriptionId',NULL,'eventId','evt_topup');
 PERFORM public.etmam_billing(NULL,'event.complete','sandbox',e);
 j:=public.etmam_command(actor,'jobs.create',jsonb_build_object('draftId',d->>'id','revision',1,'kind','improve','consent',true,'idempotencyKey','topup-fail'));
 IF public.etmam_command(actor,'me')->'membership'->>'aiRemaining'<>'9' THEN RAISE EXCEPTION 'reservation_missing';END IF;
 PERFORM public.etmam_command(actor,'jobs.claim',jsonb_build_object('id',j->>'id'));PERFORM public.etmam_command(actor,'jobs.finish',jsonb_build_object('id',j->>'id','success',false));
 IF public.etmam_command(actor,'me')->'membership'->>'aiRemaining'<>'10' THEN RAISE EXCEPTION 'failed_job_charged';END IF;
 UPDATE etmam.billing_subscriptions SET paid_until=now()-interval '1 second',period_start=now()-interval '1 month' WHERE account_id=actor;
 r:=public.etmam_command(actor,'me');IF r->'membership'->>'active'<>'false' OR r->'membership'->>'extraAiRemaining'<>'10' THEN RAISE EXCEPTION 'topup_expired_or_access_leak';END IF;
 BEGIN PERFORM public.etmam_command(actor,'jobs.create',jsonb_build_object('draftId',d->>'id','revision',1,'kind','chat','consent',true,'idempotencyKey','expired-ai'));RAISE EXCEPTION 'expired_topup_used';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'subscription_required' THEN RAISE;END IF;END;
 -- Paid annual renewal grants only the current month's 20 operations, plus saved topups.
 PERFORM public.etmam_billing(NULL,'event.subscription','sandbox',jsonb_build_object('subscriptionId','sub_test','status','active','occurredAt',now()+interval '1 minute'));
 e:=e||jsonb_build_object('intentId',NULL,'transactionId','txn_renew','priceId','pri_plus','subscriptionId','sub_test','periodStart',now()-interval '2 months','periodEnd',now()+interval '10 months','eventId','evt_renew');
 PERFORM public.etmam_billing(NULL,'event.complete','sandbox',e);
 r:=public.etmam_command(actor,'me');IF r->'membership'->>'maxDrafts'<>'10' OR r->'membership'->>'aiRemaining'<>'30' THEN RAISE EXCEPTION 'annual_monthly_allowance';END IF;
 FOR k IN 3..10 LOOP d:=public.etmam_command(actor,'drafts.create','{"content":{},"design":{}}');END LOOP;
 BEGIN PERFORM public.etmam_command(actor,'drafts.create','{"content":{},"design":{}}');RAISE EXCEPTION 'eleventh_allowed';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'draft_limit' THEN RAISE;END IF;END;
 -- Refund the topup only; the subscription remains valid.
 PERFORM public.etmam_billing(NULL,'event.refund','sandbox',jsonb_build_object('transactionId','txn_topup'));
 r:=public.etmam_command(actor,'me');IF r->'membership'->>'aiRemaining'<>'20' OR r->'membership'->>'active'<>'true' THEN RAISE EXCEPTION 'refund_crossed_sources';END IF;
 IF has_function_privilege('anon','public.etmam_billing(uuid,text,text,jsonb)','execute') OR has_function_privilege('authenticated','public.etmam_billing(uuid,text,text,jsonb)','execute') THEN RAISE EXCEPTION 'billing_gateway_public';END IF;
 r:=public.etmam_billing_change(actor,'create','sandbox',jsonb_build_object('subscriptionId','sub_test','sku','plus_year','preview','{}'::jsonb));i:=(r->>'id')::uuid;
 BEGIN PERFORM public.etmam_billing_change(other,'claim','sandbox',jsonb_build_object('id',i));RAISE EXCEPTION 'upgrade_ownership';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'checkout_pending' THEN RAISE;END IF;END;
 PERFORM public.etmam_billing_change(actor,'claim','sandbox',jsonb_build_object('id',i));
 BEGIN PERFORM public.etmam_billing_change(actor,'claim','sandbox',jsonb_build_object('id',i));RAISE EXCEPTION 'upgrade_double_charge';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'checkout_pending' THEN RAISE;END IF;END;
 PERFORM public.etmam_billing_change(actor,'finish','sandbox',jsonb_build_object('id',i,'state','completed'));
 IF (SELECT count(*) FROM etmam.billing_month('2027-01-31T12:00:00+03','2028-01-31T12:00:00+03','2027-03-01T12:00:00+03') WHERE starts='2027-02-28T12:00:00+03' AND expires='2027-03-31T12:00:00+03')<>1 THEN RAISE EXCEPTION 'annual_calendar_refill';END IF;
 RAISE NOTICE 'PASS Paddle ledger replay/ownership, monthly quotas, draft limits, reservation/failure, persistent topups, expiry, annual renewal, source-isolated refund and upgrade claim ownership/idempotency';
END$$;
