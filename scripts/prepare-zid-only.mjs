import fs from 'node:fs';
const file='supabase/migrations/20261102172356_etmam_zid_only_ten_operations.sql';
let command=fs.readFileSync('private/zid-command-before.sql','utf8');
const old='THEN m.ai_limit+8 ELSE 8 END';
if(command.split(old).length!==2) throw Error('Unexpected redemption definition');
command=command.replace(old,'THEN m.ai_limit+10 ELSE 10 END').trim().replace(/;?$/, ';');
fs.writeFileSync(file,`-- Zid-only offer: ten successful AI operations per activation; preserve usage.
${command}
UPDATE etmam.memberships SET ai_limit=10 WHERE expires>now() AND ai_limit=8;
UPDATE etmam.billing_offers SET enabled=false WHERE enabled;
DO $$DECLARE sid uuid;v jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('etmam-runtime-v1'));
 SELECT id,decrypted_secret::jsonb INTO sid,v FROM vault.decrypted_secrets WHERE name='etmam-runtime-v1';
 IF sid IS NULL THEN RAISE EXCEPTION 'runtime_missing';END IF;
 PERFORM vault.update_secret(sid,(v||'{"ETMAM_DIRECT_BILLING_ENABLED":"false","ETMAM_POLAR_LIVE_READY":"false","ETMAM_PADDLE_LIVE_READY":"false"}'::jsonb)::text,'etmam-runtime-v1');
END$$;
`);
for(const path of ['supabase/functions/_shared/bot/paid-ui.mjs','scripts/vendor-bot.mjs']){
  const t=fs.readFileSync(path,'utf8').replaceAll('و8 عمليات','و10 عمليات');
  fs.writeFileSync(path,t);
}
console.log('Prepared Zid-only migration and bot description.');
