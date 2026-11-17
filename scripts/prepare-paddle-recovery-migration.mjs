import fs from 'node:fs';
const source=fs.readFileSync('supabase/migrations/20261031221628_etmam_paddle_billing.sql','utf8');
const extract=name=>{const start=source.indexOf('CREATE FUNCTION '+name+'(');if(start<0)throw Error(name);return source.slice(start,source.indexOf('END$$;',start)+7).replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ');};
let gateway=extract('public.etmam_billing');
gateway=gateway.replace(" ELSIF p_action='intent.bind' THEN",` ELSIF p_action='intent.release' THEN
  UPDATE etmam.billing_intents SET creating=false WHERE id=(p_payload->>'id')::uuid AND account_id=p_actor AND environment=p_environment AND transaction_id IS NULL;RETURN '{}';
 ELSIF p_action='intent.bind' THEN`);
gateway=gateway.replace("'transactionId',i.transaction_id);","'transactionId',i.transaction_id,'sku',i.sku);");
gateway=gateway.replace(",revoked=CASE WHEN p_payload->>'status'='paused' THEN true ELSE revoked END",'');
const membership=extract('etmam.billing_membership').replaceAll('AND NOT b.revoked','AND NOT b.revoked AND b.status<>\'paused\'');
const reserve=extract('etmam.billing_reserve').replaceAll('AND NOT b.revoked','AND NOT b.revoked AND b.status<>\'paused\'');
fs.writeFileSync('supabase/migrations/20261031224057_etmam_paddle_checkout_recovery.sql','-- Safe retry after definitive validation failure; preserve paid and refunded sources.\n'+gateway+'\n'+membership+'\n'+reserve+'\n');
