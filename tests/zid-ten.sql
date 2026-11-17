DO $$DECLARE a uuid;b uuid;h text;h2 text;r jsonb;expiry timestamptz;BEGIN
 a:=(public.etmam_command(NULL,'resolve',jsonb_build_object('kind','email','subject','zid-ten-'||gen_random_uuid()))#>>'{}')::uuid;
 b:=(public.etmam_command(NULL,'resolve',jsonb_build_object('kind','email','subject','zid-ten-other-'||gen_random_uuid()))#>>'{}')::uuid;
 h:='test-'||gen_random_uuid();h2:='test-'||gen_random_uuid();
 INSERT INTO etmam.codes(secret_hash,batch,state,created) VALUES(h,'zid-ten-test','ready',now()),(h2,'zid-ten-test','ready',now());
 r:=public.etmam_command(a,'redeem',jsonb_build_object('hash',h));
 IF r->'membership'->>'aiLimit'<>'10' OR r->'membership'->>'maxDrafts'<>'2' THEN RAISE EXCEPTION 'ten_grant_failed';END IF;
 expiry:=(r->'membership'->>'expires')::timestamptz;
 UPDATE etmam.memberships SET ai_used=2 WHERE account_id=a;
 r:=public.etmam_command(a,'redeem',jsonb_build_object('hash',h));
 IF r->'membership'->>'aiRemaining'<>'8' OR (r->'membership'->>'expires')::timestamptz<>expiry THEN RAISE EXCEPTION 'same_code_granted_twice';END IF;
 r:=public.etmam_command(b,'redeem',jsonb_build_object('hash',h));
 IF r->>'error'<>'code_used' THEN RAISE EXCEPTION 'code_ownership_failed';END IF;
 r:=public.etmam_command(a,'redeem',jsonb_build_object('hash',h2));
 IF r->'membership'->>'aiLimit'<>'20' OR r->'membership'->>'aiUsed'<>'2' THEN RAISE EXCEPTION 'renewal_or_usage_failed';END IF;
 IF (r->'membership'->>'expires')::timestamptz<=expiry THEN RAISE EXCEPTION 'renewal_duration_failed';END IF;
 IF EXISTS(SELECT 1 FROM etmam.billing_offers WHERE enabled) THEN RAISE EXCEPTION 'direct_offers_still_enabled';END IF;
END$$;
