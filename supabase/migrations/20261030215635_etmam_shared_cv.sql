-- ETMAM is isolated from existing Elmam commerce and career tables.
CREATE SCHEMA IF NOT EXISTS etmam;
REVOKE ALL ON SCHEMA etmam FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA etmam TO service_role;

CREATE TABLE etmam.accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE etmam.identities(kind text NOT NULL CHECK(kind IN ('email','telegram','legacy')),subject text NOT NULL,account_id uuid NOT NULL REFERENCES etmam.accounts(id),PRIMARY KEY(kind,subject));
CREATE INDEX identities_account ON etmam.identities(account_id);
CREATE TABLE etmam.memberships(account_id uuid PRIMARY KEY REFERENCES etmam.accounts(id),activated timestamptz NOT NULL,expires timestamptz NOT NULL,ai_limit integer NOT NULL CHECK(ai_limit>=0),ai_used integer NOT NULL DEFAULT 0 CHECK(ai_used>=0 AND ai_used<=ai_limit));
CREATE TABLE etmam.codes(secret_hash text PRIMARY KEY,batch text NOT NULL,state text NOT NULL CHECK(state IN ('ready','redeemed','revoked')),created timestamptz NOT NULL,redeemed_account uuid REFERENCES etmam.accounts(id),redeemed_at timestamptz);
CREATE TABLE etmam.drafts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES etmam.accounts(id),title text NOT NULL DEFAULT 'سيرتي الذاتية',content jsonb NOT NULL,design jsonb NOT NULL DEFAULT '{"template":"classic","accent":"#0F2D5B","fontSize":11,"spacing":1.5}',revision integer NOT NULL DEFAULT 1,approved_content jsonb,approved_design jsonb,approved_revision integer,updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX drafts_account ON etmam.drafts(account_id,updated_at DESC);
CREATE TABLE etmam.sessions(account_id uuid PRIMARY KEY REFERENCES etmam.accounts(id),body jsonb NOT NULL,version integer NOT NULL DEFAULT 1,active_draft uuid REFERENCES etmam.drafts(id) ON DELETE SET NULL,base_revision integer,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE etmam.jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES etmam.accounts(id),draft_id uuid REFERENCES etmam.drafts(id) ON DELETE SET NULL,kind text NOT NULL CHECK(kind IN ('improve','translate','chat','import','export')),state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','completed','failed','uncertain')),idempotency_key text NOT NULL,base_revision integer NOT NULL,source jsonb NOT NULL,input jsonb NOT NULL DEFAULT '{}',result jsonb,error text,created_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,completed_at timestamptz,UNIQUE(account_id,idempotency_key));
CREATE INDEX jobs_queue ON etmam.jobs(state,created_at);
CREATE TABLE etmam.link_tokens(secret_hash text PRIMARY KEY,account_id uuid NOT NULL REFERENCES etmam.accounts(id),expires timestamptz NOT NULL,used_at timestamptz);
CREATE TABLE etmam.code_attempts(account_id uuid NOT NULL REFERENCES etmam.accounts(id),created timestamptz NOT NULL DEFAULT now());
CREATE INDEX attempts_recent ON etmam.code_attempts(account_id,created);
CREATE TABLE etmam.telegram_updates(id bigint PRIMARY KEY,account_id uuid NOT NULL REFERENCES etmam.accounts(id),body jsonb NOT NULL,state text NOT NULL DEFAULT 'queued',created_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,error text);
CREATE INDEX telegram_queue ON etmam.telegram_updates(state,created_at);
CREATE TABLE etmam.feedback(id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES etmam.accounts(id),body jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE etmam.pdf_cache(cache_key text PRIMARY KEY,account_id uuid NOT NULL REFERENCES etmam.accounts(id),object_path text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE etmam.migration_ledger(source text PRIMARY KEY,digest text NOT NULL,imported_at timestamptz NOT NULL DEFAULT now());

DO $$DECLARE t record;BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='etmam' LOOP EXECUTE format('ALTER TABLE etmam.%I ENABLE ROW LEVEL SECURITY',t.tablename);EXECUTE format('REVOKE ALL ON etmam.%I FROM PUBLIC,anon,authenticated',t.tablename);EXECUTE format('GRANT ALL ON etmam.%I TO service_role',t.tablename);END LOOP;END$$;

CREATE FUNCTION etmam.resolve_identity(p_kind text,p_subject text) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a uuid;BEGIN
 IF p_kind NOT IN ('email','telegram','legacy') OR length(p_subject)>128 THEN RAISE EXCEPTION 'invalid_identity';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_kind||':'||p_subject,0));
 SELECT account_id INTO a FROM etmam.identities WHERE kind=p_kind AND subject=p_subject;
 IF a IS NULL THEN INSERT INTO etmam.accounts DEFAULT VALUES RETURNING id INTO a;INSERT INTO etmam.identities VALUES(p_kind,p_subject,a);END IF;RETURN a;
END$$;

CREATE FUNCTION etmam.access(p_actor uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',p_actor,'telegramLinked',EXISTS(SELECT 1 FROM etmam.identities WHERE account_id=p_actor AND kind='telegram'),'membership',(SELECT jsonb_build_object('active',m.expires>now(),'expires',m.expires,'activated',m.activated,'aiLimit',m.ai_limit,'aiUsed',m.ai_used,'aiRemaining',greatest(0,m.ai_limit-m.ai_used-(SELECT count(*) FROM etmam.jobs WHERE account_id=p_actor AND kind<>'export' AND state IN ('queued','running'))),'maxDrafts',3) FROM etmam.memberships m WHERE account_id=p_actor));
$$;

-- Only the trusted server service role may call this gateway. The actor is never accepted from a browser.
CREATE FUNCTION public.etmam_command(p_actor uuid,p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a uuid;other uuid;d etmam.drafts;m etmam.memberships;c etmam.codes;j etmam.jobs;s etmam.sessions;u etmam.telegram_updates;r jsonb;pending integer;active boolean;new_expiry timestamptz;tok etmam.link_tokens;
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
   IF (EXISTS(SELECT 1 FROM etmam.memberships WHERE account_id=p_actor) OR EXISTS(SELECT 1 FROM etmam.drafts WHERE account_id=p_actor)) AND (EXISTS(SELECT 1 FROM etmam.memberships WHERE account_id=other) OR EXISTS(SELECT 1 FROM etmam.drafts WHERE account_id=other)) THEN RAISE EXCEPTION 'link_conflict';END IF;
   IF EXISTS(SELECT 1 FROM etmam.memberships WHERE account_id=p_actor) OR EXISTS(SELECT 1 FROM etmam.drafts WHERE account_id=p_actor) THEN
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
 SELECT * INTO m FROM etmam.memberships WHERE account_id=p_actor;active:=coalesce(m.expires>now(),false);
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
  new_expiry:=((CASE WHEN active THEN m.expires ELSE now() END AT TIME ZONE 'Asia/Riyadh')+interval '3 months') AT TIME ZONE 'Asia/Riyadh';
  INSERT INTO etmam.memberships VALUES(p_actor,CASE WHEN active THEN m.activated ELSE now() END,new_expiry,CASE WHEN active THEN m.ai_limit+20 ELSE 20 END,CASE WHEN active THEN m.ai_used ELSE 0 END)
  ON CONFLICT(account_id) DO UPDATE SET activated=excluded.activated,expires=excluded.expires,ai_limit=excluded.ai_limit,ai_used=excluded.ai_used;
  UPDATE etmam.codes SET state='redeemed',redeemed_account=p_actor,redeemed_at=now() WHERE secret_hash=c.secret_hash;
  RETURN etmam.access(p_actor);
 ELSIF p_action='drafts.list' THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)-'account_id'-'approved_content'-'approved_design' ORDER BY updated_at DESC) FROM etmam.drafts x WHERE account_id=p_actor),'[]');
 ELSIF p_action='drafts.create' THEN
  IF NOT active THEN RAISE EXCEPTION 'subscription_required';END IF;
  IF (SELECT count(*) FROM etmam.drafts WHERE account_id=p_actor)>=3 THEN RAISE EXCEPTION 'draft_limit';END IF;
  INSERT INTO etmam.drafts(account_id,title,content,design) VALUES(p_actor,left(coalesce(p_payload->>'title','سيرتي الذاتية'),120),p_payload->'content',p_payload->'design') RETURNING * INTO d;
  RETURN to_jsonb(d)-'account_id'-'approved_content'-'approved_design';
 ELSIF p_action LIKE 'drafts.%' THEN
  SELECT * INTO d FROM etmam.drafts WHERE id=(p_payload->>'id')::uuid AND account_id=p_actor FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'not_found';END IF;
  IF p_action='drafts.get' THEN RETURN to_jsonb(d)-'account_id'-'approved_content'-'approved_design';END IF;
  IF NOT active THEN RAISE EXCEPTION 'subscription_required';END IF;
  IF p_action='drafts.delete' THEN DELETE FROM etmam.drafts WHERE id=d.id;RETURN '{}';END IF;
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
   IF m.ai_used+pending>=m.ai_limit THEN RAISE EXCEPTION 'ai_limit';END IF;
   r:=jsonb_build_object('content',d.content,'design',d.design,'revision',d.revision);
  END IF;
  INSERT INTO etmam.jobs(account_id,draft_id,kind,idempotency_key,base_revision,source,input) VALUES(p_actor,d.id,p_payload->>'kind',p_payload->>'idempotencyKey',d.revision,r,p_payload-'draftId'-'idempotencyKey') RETURNING * INTO j;
  RETURN to_jsonb(j)-'source'-'input'-'account_id';
 ELSIF p_action LIKE 'jobs.%' THEN
  SELECT * INTO j FROM etmam.jobs WHERE id=(p_payload->>'id')::uuid AND account_id=p_actor FOR UPDATE;
  IF j.id IS NULL THEN RAISE EXCEPTION 'not_found';END IF;
  IF p_action='jobs.get' THEN RETURN to_jsonb(j)-'source'-'input'-'account_id';
  ELSIF p_action='jobs.claim' THEN IF j.state<>'queued' THEN RETURN 'null';END IF;UPDATE etmam.jobs SET state='running',started_at=now() WHERE id=j.id RETURNING * INTO j;RETURN to_jsonb(j);
  ELSIF p_action='jobs.finish' THEN
   IF j.state<>'running' THEN RETURN '{}';END IF;
   IF p_payload->>'success'='true' THEN
    IF j.kind<>'export' THEN UPDATE etmam.memberships SET ai_used=ai_used+1 WHERE account_id=p_actor AND activated<=j.created_at;END IF;
    UPDATE etmam.jobs SET state='completed',result=p_payload->'result',completed_at=now(),input='{}',source='{}' WHERE id=j.id;
   ELSE UPDATE etmam.jobs SET state=CASE WHEN p_payload->>'uncertain'='true' THEN 'uncertain' ELSE 'failed' END,error=p_payload->>'error',completed_at=now(),input='{}',source='{}' WHERE id=j.id;END IF;RETURN '{}';
  ELSIF p_action='jobs.apply' THEN
   IF NOT active THEN RAISE EXCEPTION 'subscription_required';END IF;
   SELECT * INTO d FROM etmam.drafts WHERE id=j.draft_id AND account_id=p_actor FOR UPDATE;
   IF d.id IS NULL THEN RAISE EXCEPTION 'not_found';END IF;
   IF j.state<>'completed' OR j.result->'content' IS NULL OR j.base_revision<>d.revision OR d.revision<>(p_payload->>'revision')::integer THEN RAISE EXCEPTION 'revision_conflict';END IF;
   UPDATE etmam.drafts SET content=j.result->'content',revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;RETURN to_jsonb(d)-'account_id'-'approved_content'-'approved_design';
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

REVOKE ALL ON FUNCTION etmam.resolve_identity(text,text),etmam.access(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION etmam.resolve_identity(text,text),etmam.access(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.etmam_command(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.etmam_command(uuid,text,jsonb) TO service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('etmam-private','etmam-private',false,5242880,ARRAY['application/pdf']) ON CONFLICT(id) DO NOTHING;

CREATE FUNCTION public.etmam_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 -- A provider call interrupted after claiming is never retried automatically.
 UPDATE etmam.jobs SET state='uncertain',error='تعذرت متابعة الطلب. لم تُخصم عملية من الرصيد.',input='{}',source='{}',completed_at=now() WHERE state='running' AND started_at<now()-interval '3 minutes';
 UPDATE etmam.telegram_updates SET state='uncertain',body='{}',error='processing_interrupted' WHERE state='running' AND started_at<now()-interval '3 minutes';
 DELETE FROM etmam.feedback WHERE created_at<now()-interval '30 days';
 DELETE FROM etmam.code_attempts WHERE created<now()-interval '1 day';
 DELETE FROM etmam.link_tokens WHERE expires<now()-interval '1 day';
 RETURN jsonb_build_object('jobs',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,account_id FROM etmam.jobs WHERE state='queued' ORDER BY created_at LIMIT 10)x),'[]'),'telegram',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT DISTINCT account_id FROM etmam.telegram_updates WHERE state='queued' LIMIT 10)x),'[]'));
END$$;
REVOKE ALL ON FUNCTION public.etmam_maintenance() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.etmam_maintenance() TO service_role;

-- Supabase Vault encrypts ETMAM's configuration at rest. Never expose the decrypted view.
CREATE FUNCTION etmam.runtime() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role' THEN RAISE EXCEPTION 'unauthorized';END IF;
 RETURN (SELECT decrypted_secret::jsonb FROM vault.decrypted_secrets WHERE name='etmam-runtime-v1');
END$$;
REVOKE ALL ON FUNCTION etmam.runtime() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION etmam.runtime() TO service_role;
CREATE FUNCTION public.etmam_runtime() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT etmam.runtime()$$;
REVOKE ALL ON FUNCTION public.etmam_runtime() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.etmam_runtime() TO service_role;
