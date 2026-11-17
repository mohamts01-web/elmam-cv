// Preserve the approved Arabic conversation UX; persistence and entitlements are replaced by cloud adapters.
import fs from "node:fs";
import crypto from "node:crypto";
const source = "E:/مشاريعي/etmam-cv-bot/",
  dest = new URL("../supabase/functions/_shared/bot/", import.meta.url);
fs.mkdirSync(dest, { recursive: true });
const provenance = {};
for (const file of [
  "conversation.mjs",
  "quick-options.mjs",
  "telegram-adapter.mjs",
  "paid-ui.mjs",
]) {
  let body = fs.readFileSync(source + file, "utf8");
  provenance[file] = crypto.createHash("sha256").update(body).digest("hex");
  body = body.replace(
    "import {randomUUID} from 'node:crypto';",
    "const randomUUID=()=>crypto.randomUUID();",
  );
  if (file === "telegram-adapter.mjs") {
    body = body.replace(
      "s=paid.createDraft(id,createSession())",
      "s=await paid.createDraft(id,createSession())",
    );
    body = body.replace(
      "const rows=[[button('إنشاء سيرة ذاتية','m:new')]];",
      "const rows=[[button('إنشاء سيرة ذاتية','m:new')],[{text:'المحرر المتقدم على موقع إتمام',url:'https://etmam-cv.netlify.app/'}]];if(access?.mode==='paid')rows.push([button('قالب السيرة','m:templates')]);",
    );
  }
  if (file === "paid-ui.mjs") {
    body = body.replace('حتى 3 مسودات محفوظة، و20 عملية','حتى مسودتين محفوظتين، و10 عمليات').replace('المسودات: حتى 3','المسودات: حتى 2').replace('drafts.length<3','drafts.length<a.maxDrafts').replaceAll("drafts.length+'/3)","drafts.length+'/'+a.maxDrafts+')");
    body = body
      .replace(
        "const drafts=paid.listDrafts(id)",
        "const drafts=await paid.listDrafts(id)",
      )
      .replace(
        "renderPdf(paid.approvedData(id,draftId))",
        "renderPdf(await paid.approvedData(id,draftId))",
      )
      .replace(
        "const a=paid.redeem(id,text)",
        "const a=await paid.redeem(id,text)",
      )
      .replace(
        "opened=paid.openDraft(id,parts[1])",
        "opened=await paid.openDraft(id,parts[1])",
      )
      .replace(
        "if(!paid.listDrafts(id).some(d=>d.id===draftId))",
        "if(!(await paid.listDrafts(id)).some(d=>d.id===draftId))",
      )
      .replace(
        "paid.removeDraft(id,key.slice(15))",
        "await paid.removeDraft(id,key.slice(15))",
      );
  }
  fs.writeFileSync(new URL(file, dest), body);
}
const original = fs.readFileSync(source + "ai.mjs", "utf8");
fs.writeFileSync(
  new URL("ai.mjs", dest),
  original.slice(original.indexOf("export function applyProposal")),
);
fs.writeFileSync(
  new URL("../docs/BOT_SOURCE_PROVENANCE.json", import.meta.url),
  JSON.stringify(provenance, null, 2),
);
