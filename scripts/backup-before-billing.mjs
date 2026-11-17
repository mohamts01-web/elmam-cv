import fs from 'node:fs';import {pg} from './pg.mjs';
const result=pg("select jsonb_build_object('at',now(),'memberships',coalesce((select jsonb_agg(to_jsonb(m)) from etmam.memberships m),'[]'),'gateway',pg_get_functiondef('public.etmam_command(uuid,text,jsonb)'::regprocedure),'access',pg_get_functiondef('etmam.access(uuid)'::regprocedure),'draftCount',(select count(*) from etmam.drafts));");
const path='E:/مشاريعي/.elmam-local-data/etmam-web/backups/before-paddle-'+new Date().toISOString().replaceAll(':','-')+'.json';
fs.writeFileSync(path,result,{flag:'wx'});console.log('Private membership and gateway snapshot saved.');
