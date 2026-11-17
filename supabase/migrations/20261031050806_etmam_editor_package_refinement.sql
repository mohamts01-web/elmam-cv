-- Requested package: two drafts and eight successful AI operations. Existing drafts and usage are preserved.
DO $$DECLARE a record; BEGIN
 FOR a IN SELECT id FROM etmam.accounts ORDER BY id FOR UPDATE LOOP
  UPDATE etmam.memberships m SET ai_limit=greatest(m.ai_used+(SELECT count(*) FROM etmam.jobs j WHERE j.account_id=m.account_id AND j.kind<>'export' AND j.state IN ('queued','running')),least(m.ai_limit,8)) WHERE m.account_id=a.id;
 END LOOP;
END$$;
CREATE OR REPLACE FUNCTION etmam.access(p_actor uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',p_actor,'telegramLinked',EXISTS(SELECT 1 FROM etmam.identities WHERE account_id=p_actor AND kind='telegram'),'membership',(SELECT jsonb_build_object('active',m.expires>now(),'expires',m.expires,'activated',m.activated,'aiLimit',m.ai_limit,'aiUsed',m.ai_used,'aiRemaining',greatest(0,m.ai_limit-m.ai_used-(SELECT count(*) FROM etmam.jobs WHERE account_id=p_actor AND kind<>'export' AND state IN ('queued','running'))),'maxDrafts',2) FROM etmam.memberships m WHERE account_id=p_actor));
$$;


CREATE OR REPLACE FUNCTION public.etmam_command(p_actor uuid,p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
  INSERT INTO etmam.memberships VALUES(p_actor,CASE WHEN active THEN m.activated ELSE now() END,new_expiry,CASE WHEN active THEN m.ai_limit+8 ELSE 8 END,CASE WHEN active THEN m.ai_used ELSE 0 END)
  ON CONFLICT(account_id) DO UPDATE SET activated=excluded.activated,expires=excluded.expires,ai_limit=excluded.ai_limit,ai_used=excluded.ai_used;
  UPDATE etmam.codes SET state='redeemed',redeemed_account=p_actor,redeemed_at=now() WHERE secret_hash=c.secret_hash;
  RETURN etmam.access(p_actor);
 ELSIF p_action='drafts.list' THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)-'account_id'-'approved_content'-'approved_design' ORDER BY updated_at DESC) FROM etmam.drafts x WHERE account_id=p_actor),'[]');
 ELSIF p_action='drafts.create' THEN
  IF NOT active THEN RAISE EXCEPTION 'subscription_required';END IF;
  IF (SELECT count(*) FROM etmam.drafts WHERE account_id=p_actor)>=2 THEN RAISE EXCEPTION 'draft_limit';END IF;
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