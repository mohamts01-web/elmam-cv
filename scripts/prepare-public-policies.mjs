import fs from 'node:fs';
const text=fs.readFileSync('docs/PADDLE_PUBLIC_POLICIES_DRAFT_AR.md','utf8');
const sections=text.split(/^## /m).slice(1).map((s,i)=>{const [title,...body]=s.trim().split('\n');return {slug:['terms','privacy','refunds'][i],title,paragraphs:body.join('\n').trim().split(/\n\s*\n/)};});
fs.writeFileSync('src/public-policies.json',JSON.stringify(sections,null,2));
