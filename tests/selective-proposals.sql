DO $$DECLARE actor uuid;d jsonb;j jsonb;r jsonb;BEGIN
 actor:=(public.etmam_command(NULL,'resolve','{"kind":"email","subject":"selective-proposal-test"}')#>>'{}')::uuid;
 INSERT INTO etmam.memberships VALUES(actor,now(),now()+interval '3 months',8,0);
 d:=public.etmam_command(actor,'drafts.create','{"title":"Selection test","content":{"name":"Original","summary":"Old summary","skills":["Skill"]},"design":{}}');
 j:=public.etmam_command(actor,'jobs.create',jsonb_build_object('draftId',d->>'id','revision',1,'kind','improve','consent',true,'idempotencyKey','selective-1'));
 PERFORM public.etmam_command(actor,'jobs.claim',jsonb_build_object('id',j->>'id'));
 PERFORM public.etmam_command(actor,'jobs.finish',jsonb_build_object('id',j->>'id','success',true,'result',jsonb_build_object('content',jsonb_build_object('name','Original','summary','New summary','skills',jsonb_build_array('Reworded skill')))));
 d:=public.etmam_command(actor,'jobs.apply',jsonb_build_object('id',j->>'id','revision',1,'keys',jsonb_build_array('summary')));
 IF d->'content'->>'summary'<>'New summary' OR d->'content'->'skills'->>0<>'Skill' THEN RAISE EXCEPTION 'partial_apply_overreach';END IF;
 r:=public.etmam_command(actor,'jobs.apply',jsonb_build_object('id',j->>'id','revision',1,'keys',jsonb_build_array('summary')));IF r->>'revision'<>d->>'revision' THEN RAISE EXCEPTION 'partial_replay_incremented';END IF;
 d:=public.etmam_command(actor,'jobs.apply',jsonb_build_object('id',j->>'id','revision',2,'keys',jsonb_build_array('skills')));IF d->'content'->'skills'->>0<>'Reworded skill' OR d->>'revision'<>'3' THEN RAISE EXCEPTION 'remaining_section_failed';END IF;
 IF (public.etmam_command(actor,'me')->'membership'->>'aiUsed')::integer<>1 THEN RAISE EXCEPTION 'section_apply_extra_charge';END IF;
 d:=public.etmam_command(actor,'drafts.save',jsonb_build_object('id',d->>'id','revision',3,'title','New title','content',d->'content','design','{}'::jsonb));
 BEGIN PERFORM public.etmam_command(actor,'jobs.apply',jsonb_build_object('id',j->>'id','revision',3,'keys',jsonb_build_array('name')));RAISE EXCEPTION 'stale_partial_allowed';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'revision_conflict' THEN RAISE;END IF;END;
 BEGIN PERFORM public.etmam_command(actor,'jobs.apply',jsonb_build_object('id',j->>'id','revision',4,'keys',jsonb_build_array('__proto__')));RAISE EXCEPTION 'invalid_selection_allowed';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'invalid_proposal_selection' THEN RAISE;END IF;END;
 RAISE NOTICE 'PASS: partial section approval, idempotency, one charge, stale proposal and key validation';
END$$;
