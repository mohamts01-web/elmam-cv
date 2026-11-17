import fs from 'node:fs';
import {pg} from './pg.mjs';
const read=p=>fs.readFileSync(p,'utf8').trim();
const key=read('E:/pas/PADDLE-ETMAM-SANDBOX.txt'),token=read('E:/pas/PADDLE-ETMAM-SANDBOX-PUBLIC.txt');
const destination='https://okwqqkcifvmaoarlemix.supabase.co/functions/v1/etmam-paddle-webhook';
async function api(path,body){const r=await fetch('https://sandbox-api.paddle.com'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});const j=await r.json();if(!r.ok)throw Error('Paddle '+r.status+' '+j.error?.code);return j.data;}
const list=await api('/notification-settings');
let n=list.find(x=>x.destination===destination);
if(!n)n=await api('/notification-settings',{description:'ETMAM CV sandbox payments',type:'url',destination,traffic_source:'platform',include_sensitive_fields:false,subscribed_events:['transaction.completed','subscription.created','subscription.updated','subscription.canceled','subscription.paused','subscription.resumed','subscription.past_due','adjustment.created','adjustment.updated']});
if(!n.endpoint_secret_key)n=await api('/notification-settings/'+n.id);
if(!n.endpoint_secret_key)throw Error('Missing webhook secret');
fs.writeFileSync('E:/pas/PADDLE-ETMAM-SANDBOX-WEBHOOK.txt',n.endpoint_secret_key);
const settings={ETMAM_PADDLE_ENVIRONMENT:'sandbox',ETMAM_PADDLE_TEST_EMAILS:'mohamts01@gmail.com',ETMAM_PADDLE_API_KEY:key,ETMAM_PADDLE_CLIENT_TOKEN:token,ETMAM_PADDLE_WEBHOOK_SECRET:n.endpoint_secret_key,ETMAM_WEB_URL:'https://etmam-cv.netlify.app'};
const lit=s=>"'"+s.replaceAll("'","''")+"'";
// Merge, never replace unrelated SMTP/OpenAI/bot settings.
pg(`DO $$DECLARE sid uuid;v jsonb;BEGIN SELECT id,decrypted_secret::jsonb INTO sid,v FROM vault.decrypted_secrets WHERE name='etmam-runtime-v1';IF sid IS NULL THEN RAISE EXCEPTION 'runtime_missing';END IF;PERFORM vault.update_secret(sid,(v||${lit(JSON.stringify(settings))}::jsonb)::text,'etmam-runtime-v1');END$$;`);
const offers=JSON.parse(read('private/paddle-sandbox-catalog.json'));
pg('BEGIN;'+offers.map(o=>`INSERT INTO etmam.billing_offers(environment,sku,price_id,title,kind,usd_cents,sar_target,interval,ai_operations,max_drafts,enabled) VALUES('sandbox',${lit(o.sku)},${lit(o.priceId)},${lit(o.title)},${lit(o.kind)},${o.usdCents},${o.sarTarget},${o.interval?lit(o.interval):'NULL'},${o.aiOperations},${o.drafts},true) ON CONFLICT(environment,sku) DO UPDATE SET price_id=excluded.price_id,title=excluded.title,usd_cents=excluded.usd_cents,sar_target=excluded.sar_target,enabled=true;`).join('')+'COMMIT;');
fs.writeFileSync('private/paddle-sandbox-settings.json',JSON.stringify({notificationId:n.id,destination,environment:'sandbox',configuredAt:new Date().toISOString()},null,2));
console.log('Paddle sandbox configured for owner test email only; secrets encrypted, 10 offers configured.');
