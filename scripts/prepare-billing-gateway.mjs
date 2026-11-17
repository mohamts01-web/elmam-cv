import fs from 'node:fs';
const file='supabase/migrations/20261031221628_etmam_paddle_billing.sql';
let base=fs.readFileSync('supabase/migrations/20261031055723_etmam_selective_cv_proposals.sql','utf8').replaceAll('\r\n','\n');
function replace(a,b){if(!base.includes(a))throw Error('Gateway source changed: '+a.slice(0,50));base=base.replaceAll(a,b);}
replace('tok etmam.link_tokens;selected_keys','tok etmam.link_tokens;membership jsonb;selected_keys');
replace("active:=coalesce(m.expires>now(),false);","membership:=etmam.billing_membership(p_actor);active:=coalesce((membership->>'active')::boolean,false);");
// Zid redemption remains based on the original Zid term and balance.
replace('CASE WHEN active THEN m.',"CASE WHEN coalesce(m.expires>now(),false) THEN m.");
replace(">=2 THEN RAISE EXCEPTION 'draft_limit'",">=coalesce((membership->>'maxDrafts')::integer,2) THEN RAISE EXCEPTION 'draft_limit'");
replace("IF m.ai_used+pending>=m.ai_limit THEN RAISE EXCEPTION 'ai_limit';END IF;","IF coalesce((membership->>'aiRemaining')::integer,0)<=0 THEN RAISE EXCEPTION 'ai_limit';END IF;");
replace("RETURNING * INTO j;\n  RETURN to_jsonb(j)-'source'-'input'-'account_id';","RETURNING * INTO j;\n  IF j.kind<>'export' THEN PERFORM etmam.billing_reserve(p_actor,j.id);END IF;\n  RETURN to_jsonb(j)-'source'-'input'-'account_id';");
replace('UPDATE etmam.memberships SET ai_used=ai_used+1 WHERE account_id=p_actor AND activated<=j.created_at;','PERFORM etmam.billing_charge(p_actor,j.id);');
replace('EXISTS(SELECT 1 FROM etmam.memberships WHERE account_id=p_actor)','(EXISTS(SELECT 1 FROM etmam.memberships WHERE account_id=p_actor) OR EXISTS(SELECT 1 FROM etmam.billing_orders WHERE account_id=p_actor))');
replace('EXISTS(SELECT 1 FROM etmam.memberships WHERE account_id=other)','(EXISTS(SELECT 1 FROM etmam.memberships WHERE account_id=other) OR EXISTS(SELECT 1 FROM etmam.billing_orders WHERE account_id=other))');
const text=fs.readFileSync(file,'utf8').split('-- Shared gateway with payment entitlements')[0];
fs.writeFileSync(file,text+'\n-- Shared gateway with payment entitlements\n'+base);
console.log('Prepared gateway; Zid code rules preserved.');
