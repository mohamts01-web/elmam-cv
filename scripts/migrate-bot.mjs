import fs from "node:fs";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  validateResume,
  emptyResume,
  defaultDesign,
} from "../shared/model.mjs";
import { pg } from "./pg.mjs";
const db = new DatabaseSync("E:/مشاريعي/etmam-cv-bot/data/etmam.sqlite3", {
    readOnly: true,
  }),
  key = fs.readFileSync("E:/مشاريعي/etmam-cv-bot/data/encryption-key.local");
function unseal(value) {
  const b = Buffer.from(value, "base64"),
    c = crypto.createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
  c.setAuthTag(b.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([c.update(b.subarray(28)), c.final()]).toString(),
  );
}
const tables = [
  "sessions",
  "paid_codes",
  "paid_memberships",
  "paid_drafts",
  "paid_ai",
  "feedback",
];
const rows = Object.fromEntries(
  tables.map((t) => [t, db.prepare("SELECT * FROM " + t).all()]),
);
db.close();
const stats = Object.fromEntries(tables.map((t) => [t, rows[t].length]));
const hash = crypto
  .createHash("sha256")
  .update(JSON.stringify(rows))
  .digest("hex");
if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({ dryRun: true, stats, sourceDigest: hash }));
  process.exit(0);
}
const lit = (x) =>
  x === null || x === undefined
    ? "NULL"
    : "'" + String(x).replaceAll("'", "''") + "'";
const json = (x) => lit(JSON.stringify(x)) + "::jsonb";
const time = (x) =>
  x === null || x === undefined
    ? "NULL"
    : "to_timestamp(" + Number(x) + "/1000.0)";
const actor = (h) =>
  `(SELECT account_id FROM etmam.identities WHERE kind='legacy' AND subject=${lit(h)})`;
const owners = new Set([
  ...rows.paid_memberships.map((r) => r.owner),
  ...rows.paid_drafts.map((r) => r.owner),
  ...rows.sessions.map((r) => r.id),
  ...rows.feedback.map((r) => r.owner),
  ...rows.paid_codes.map((r) => r.redeemed_owner).filter(Boolean),
]);
const q = ["BEGIN;", "SELECT pg_advisory_xact_lock(6646131031);"];
for (const owner of owners)
  q.push(`SELECT etmam.resolve_identity('legacy',${lit(owner)});`);
for (const r of rows.paid_memberships)
  q.push(
    `INSERT INTO etmam.memberships VALUES(${actor(r.owner)},${time(r.activated)},${time(r.expires)},${r.ai_limit},${r.ai_used}) ON CONFLICT(account_id) DO UPDATE SET activated=excluded.activated,expires=excluded.expires,ai_limit=excluded.ai_limit,ai_used=excluded.ai_used;`,
  );
for (const r of rows.paid_codes)
  q.push(
    `INSERT INTO etmam.codes VALUES(${lit(r.secret_hash)},${lit(r.batch)},${lit(r.state)},${time(r.created)},${r.redeemed_owner ? actor(r.redeemed_owner) : "NULL"},${time(r.redeemed_at)}) ON CONFLICT(secret_hash) DO UPDATE SET state=excluded.state,redeemed_account=excluded.redeemed_account,redeemed_at=excluded.redeemed_at;`,
  );
for (const r of rows.paid_drafts) {
  const s = unseal(r.body),
    content = validateResume({
      ...emptyResume(),
      ...s.data,
      language: s.data?.language || "ar",
      profile: s.profile || s.data?.profile || "graduate",
    });
  const previousApproved = r.approved ? unseal(r.approved) : null;
  const approved = previousApproved
    ? validateResume({
        ...emptyResume(),
        ...previousApproved,
        language: previousApproved.language || "ar",
        profile: previousApproved.profile || s.profile || "graduate",
      })
    : null;
  const revision = Math.max(1, s.revision || 1);
  q.push(
    `INSERT INTO etmam.drafts(id,account_id,title,content,design,revision,approved_content,approved_design,approved_revision,updated_at) VALUES(${lit(r.id)},${actor(r.owner)},${lit((s.data?.headline || s.data?.name || "سيرتي الذاتية").slice(0, 120))},${json(content)},${json(defaultDesign())},${revision},${approved ? json(approved) : "NULL"},${approved ? json(defaultDesign()) : "NULL"},${approved && s.confirmedRevision === s.revision ? revision : "NULL"},${time(r.updated)}) ON CONFLICT(id) DO UPDATE SET content=excluded.content,revision=excluded.revision,approved_content=excluded.approved_content,approved_design=excluded.approved_design,approved_revision=excluded.approved_revision,updated_at=excluded.updated_at;`,
  );
}
for (const r of rows.sessions) {
  const s = unseal(r.body),
    m = rows.paid_memberships.find((m) => m.owner === r.id),
    active = rows.paid_drafts.find((d) => d.id === m?.active_draft);
  q.push(
    `INSERT INTO etmam.sessions(account_id,body,version,active_draft,base_revision) VALUES(${actor(r.id)},${json(s)},1,${active ? lit(active.id) : "NULL"},${active ? Math.max(1, unseal(active.body).revision || 1) : "NULL"}) ON CONFLICT(account_id) DO UPDATE SET body=excluded.body,version=etmam.sessions.version+1,active_draft=excluded.active_draft,base_revision=excluded.base_revision;`,
  );
}
for (const r of rows.feedback)
  q.push(
    `INSERT INTO etmam.feedback VALUES(${lit(r.id)},${actor(r.owner)},${json(unseal(r.body))},${time(r.created)}) ON CONFLICT(id) DO NOTHING;`,
  );
q.push(
  `INSERT INTO etmam.migration_ledger VALUES('telegram-sqlite-v1',${lit(hash)},now()) ON CONFLICT(source) DO UPDATE SET digest=excluded.digest,imported_at=now();`,
  "COMMIT;",
);
const existing = pg(
  "SELECT count(*) FROM etmam.migration_ledger WHERE source='telegram-sqlite-v1'",
);
if (Number(existing) > 0 && !process.argv.includes("--final-delta"))
  throw Error(
    "already_imported_use_final_delta_only_while_all_writers_stopped",
  );
pg(q.join("\n"));
console.log(
  JSON.stringify({
    applied: true,
    stats,
    sourceDigest: hash,
    verification: JSON.parse(
      pg(
        "SELECT json_build_object('memberships',(SELECT count(*) FROM etmam.memberships),'codes',(SELECT count(*) FROM etmam.codes),'drafts',(SELECT count(*) FROM etmam.drafts),'sessions',(SELECT count(*) FROM etmam.sessions))",
      ),
    ),
  }),
);
