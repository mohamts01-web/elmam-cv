import fs from 'node:fs';
const source=fs.readFileSync('supabase/migrations/20261031224057_etmam_paddle_checkout_recovery.sql','utf8');
let gateway=source.slice(source.indexOf('CREATE OR REPLACE FUNCTION public.etmam_billing('),source.indexOf('END$$;')+7);
gateway=gateway.replace(" ELSIF p_action='event.lookup' THEN",` ELSIF p_action='event.lookup' THEN
  IF EXISTS(SELECT 1 FROM etmam.billing_orders WHERE environment=p_environment AND transaction_id=p_payload->>'transactionId') THEN RETURN jsonb_build_object('alreadyProcessed',true);END IF;`);
const file='supabase/migrations/20261031225530_etmam_paddle_plan_changes.sql';
const sourceSQL=fs.readFileSync(file,'utf8').split('-- Extend event replay lookup')[0];
fs.writeFileSync(file,sourceSQL+'\n-- Extend event replay lookup\n'+gateway+'\n');
