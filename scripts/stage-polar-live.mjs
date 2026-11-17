import fs from 'node:fs';
import { pg } from './pg.mjs';
const key=fs.readFileSync('E:/pas/POLAR-ETMAM-LIVE.txt','utf8').trim();
if(!key.startsWith('polar_oat_')) throw Error('Private Polar token required');
const catalog=JSON.parse(fs.readFileSync('private/polar-live-catalog.json','utf8'));
if(catalog.length!==10 || catalog.some(x=>x.visibility!=='draft')) throw Error('Unverified catalog');
const lit=s=>"'"+s.replaceAll("'","''")+"'";
// Merge only staged Polar keys. No deployed payment flags, offers or balances change.
const staged={ETMAM_POLAR_STAGED_LIVE_ACCESS_TOKEN:key,
  ETMAM_POLAR_STAGED_LIVE_ORGANIZATION_ID:'eceea63c-dffd-45f8-81a4-a22b35aa1493',
  ETMAM_POLAR_STAGED_LIVE_API_VERSION:'2026-10',
  ETMAM_POLAR_STAGED_LIVE_CATALOG:JSON.stringify(catalog),ETMAM_POLAR_LIVE_READY:'false'};
const exists=pg("SELECT count(*) FROM vault.decrypted_secrets WHERE name='etmam-runtime-v1';");
if(exists!=='1') throw Error('Expected one runtime secret');
pg(`DO $$DECLARE sid uuid;v jsonb;BEGIN PERFORM pg_advisory_xact_lock(hashtext('etmam-runtime-v1'));SELECT id,decrypted_secret::jsonb INTO sid,v FROM vault.decrypted_secrets WHERE name='etmam-runtime-v1';IF sid IS NULL THEN RAISE EXCEPTION 'runtime_missing';END IF;PERFORM vault.update_secret(sid,(v||${lit(JSON.stringify(staged))}::jsonb)::text,'etmam-runtime-v1');END$$;`);
const verified=pg("SELECT (decrypted_secret::jsonb ? 'ETMAM_POLAR_STAGED_LIVE_ACCESS_TOKEN') AND decrypted_secret::jsonb->>'ETMAM_POLAR_LIVE_READY'='false' FROM vault.decrypted_secrets WHERE name='etmam-runtime-v1';");
if(verified!=='t') throw Error('Staging verification failed');
console.log('Polar credentials and catalog staged in encrypted runtime; live readiness remains false.');
