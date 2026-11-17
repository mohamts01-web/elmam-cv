import fs from 'node:fs';
import {pg} from './pg.mjs';
const source=pg("SELECT pg_get_functiondef('public.etmam_billing(uuid,text,text,jsonb)'::regprocedure);");
fs.writeFileSync('private/polar-billing-baseline.sql',source);
console.log('Current billing definition saved privately; '+source.length+' characters.');
try { console.log('Local DB check: '+pg('SELECT 1',{local:true})); }
catch { console.log('Local DB unavailable'); }
