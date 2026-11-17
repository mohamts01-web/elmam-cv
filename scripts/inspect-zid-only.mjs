import fs from 'node:fs';
import {pg} from './pg.mjs';
const definition=pg("SELECT pg_get_functiondef('public.etmam_command(uuid,text,jsonb)'::regprocedure);");
fs.writeFileSync('private/zid-command-before.sql',definition);
console.log(definition.split('\n').filter(x=>/memberships VALUES|ai_limit|codes.*UPDATE|UPDATE.*codes|activated|redeemed/.test(x)).join('\n'));
console.log(pg("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='etmam' AND (table_name LIKE '%code%' OR table_name='memberships') ORDER BY table_name,ordinal_position;"));
console.log(pg("SELECT count(*) AS total,count(*) FILTER(WHERE expires>now()) AS active,min(ai_limit) AS min_limit,max(ai_limit) AS max_limit FROM etmam.memberships;"));
