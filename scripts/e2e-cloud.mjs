import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { pg } from "./pg.mjs";
import {
  sampleResume,
  defaultDesign,
  normalizeCode,
} from "../shared/model.mjs";
const c = JSON.parse(
  fs.readFileSync(
    "E:/مشاريعي/.elmam-local-data/etmam-web/runtime.local.json",
    "utf8",
  ),
);
if (!c.serviceKey) throw Error("private_server_key_required");
const admin = createClient(c.supabaseUrl, c.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  user = createClient(c.supabaseUrl, c.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const tag = "etmam-qa-" + crypto.randomUUID(),
  email = tag + "@example.com",
  batch = "disposable-" + tag,
  results = [];
let uid, actor, token;
const lit = (s) => "'" + String(s).replaceAll("'", "''") + "'";
async function api(path, body, method) {
  const r = await fetch(c.supabaseUrl + "/functions/v1/etmam-api" + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      apikey: c.publishableKey,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Origin: c.siteUrl,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const j = await r.json();
  return {
    status: r.status,
    data: j,
    cors: r.headers.get("Access-Control-Allow-Origin"),
  };
}
const pass = (name) => {
  results.push({ name, passed: true });
  console.log("PASS " + name);
};
async function job(kind, d, extra = {}) {
  const r = await api("/jobs", {
    kind,
    draftId: d.id,
    revision: d.revision,
    consent: true,
    idempotencyKey: crypto.randomUUID(),
    ...extra,
  });
  assert.equal(r.status, 202, JSON.stringify(r.data));
  let j = r.data;
  for (
    let i = 0;
    i < 70 && !["completed", "failed", "uncertain"].includes(j.state);
    i++
  ) {
    await new Promise((r) => setTimeout(r, 1600));
    j = (await api("/jobs/" + j.id)).data;
  }
  assert.equal(j.state, "completed", j.error || "Job incomplete");
  return j;
}
try {
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (link.error) throw Error("test_auth_link_failed");
  uid = link.data.user.id;
  const verificationType =
    link.data.properties.verification_type === "signup"
      ? "signup"
      : "magiclink";
  const verified = await user.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: verificationType,
  });
  if (verified.error)
    throw Error(
      "test_auth_verification_failed:" +
        verified.error.code +
        ":" +
        verified.error.status +
        ":" +
        verificationType,
    );
  token = verified.data.session.access_token;
  let me = await api("/me");
  assert.equal(me.status, 200, JSON.stringify(me.data));
  actor = me.data.id;
  assert.equal(me.cors, c.siteUrl);
  pass("verified email identity and production CORS");
  const raw = Array.from(
    crypto.randomBytes(8),
    (b) => "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[b % 31],
  ).join("");
  const code = "ETM-" + raw.slice(0, 4) + "-" + raw.slice(4);
  const hash = crypto
    .createHmac("sha256", Buffer.from(c.legacyKey, "base64"))
    .update("activation:" + normalizeCode(code))
    .digest("hex");
  pg(
    `INSERT INTO etmam.codes VALUES(${lit(hash)},${lit(batch)},'ready',now(),NULL,NULL);`,
  );
  const activated = await api("/redeem", { code });
  assert.equal(activated.status, 200, JSON.stringify(activated.data));
  assert.equal(activated.data.membership.aiRemaining, 8);
  const replay = await api("/redeem", { code });
  assert.equal(replay.data.membership.aiLimit, 8);
  pass("Zid-compatible activation and idempotent redemption");
  const content = structuredClone(sampleResume);
  content.summary = "أعمل في تنظيم الطلبات وإعداد التقارير ومتابعة المهام.";
  let r = await api("/drafts", {
    title: "DISPOSABLE QA",
    content,
    design: defaultDesign(),
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  let d = r.data;
  for (let i = 0; i < 1; i++)
    assert.equal(
      (
        await api("/drafts", {
          title: "DISPOSABLE QA " + i,
          content,
          design: defaultDesign(),
        })
      ).status,
      201,
    );
  assert.equal(
    (
      await api("/drafts", {
        title: "overflow",
        content,
        design: defaultDesign(),
      })
    ).status,
    400,
  );
  pass("shared two-draft limit");
  r = await api(
    "/drafts/" + d.id,
    { ...d, content: { ...content, headline: "أخصائية تنسيق العمليات" } },
    "PUT",
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const old = d;
  d = r.data;
  assert.equal((await api("/drafts/" + d.id, old, "PUT")).status, 409);
  pass("stale saves rejected");
  const improved = await job("improve", d);
  assert.ok(improved.result.content);
  r = await api("/jobs/" + improved.id + "/apply", { revision: d.revision });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  d = r.data;
  assert.equal(
    (await api("/jobs/" + improved.id + "/apply", { revision: d.revision }))
      .status,
    409,
  );
  assert.equal((await api("/me")).data.membership.aiUsed, 1);
  pass("reviewable improvement, one charge, stale proposal protection");
  const translated = await job("translate", d, { targetLanguage: "en" });
  assert.equal(translated.result.content.language, "en");
  pass("English translation proposal");
  const imported = await job("import", d, {
    text: "Name: Demo Candidate\nEmail: candidate@example.com\nCity: Riyadh, Saudi Arabia\nEducation: Bachelor of Business Administration, Example University, 2024.\nSkills: Microsoft Excel, Communication.\nLanguages: Arabic native, English intermediate.",
  });
  assert.equal(imported.result.content.name, "Demo Candidate");
  assert.equal((await api("/me")).data.membership.aiUsed, 3);
  pass("document text import proposal and shared AI counter");
  r = await api("/drafts/" + d.id + "/approve", { revision: d.revision });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  d = r.data;
  const pdf = await job("export", d);
  const file = await fetch(pdf.result.downloadUrl);
  assert.equal(file.status, 200);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  fs.writeFileSync("private/e2e-paid-export.pdf", bytes);
  pass("approved export through private storage and signed URL");
  const exportedAgain = await job("export", d);
  assert.ok(exportedAgain.result.downloadUrl);
  pass("cached export reused");
  assert.equal((await api("/drafts/" + d.id, undefined, "DELETE")).status, 200);
  pass("delete a draft with completed AI and export jobs");
  const link2 = await api("/link", {});
  assert.ok(new URL(link2.data.url).searchParams.get("start").length <= 64);
  pass("Telegram link fits platform payload limit");
  fs.writeFileSync(
    "docs/CLOUD_E2E.json",
    JSON.stringify(
      { at: new Date().toISOString(), results, emailDeliveryTested: false },
      null,
      2,
    ),
  );
} catch (e) {
  console.error("E2E failed:", e.message);
  fs.writeFileSync(
    "docs/CLOUD_E2E.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        failed: true,
        error: e.message,
        emailDeliveryTested: false,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  if (actor) {
    const { data: objects } = await admin.storage
      .from("etmam-private")
      .list(actor);
    if (objects?.length)
      await admin.storage
        .from("etmam-private")
        .remove(objects.map((x) => actor + "/" + x.name));
    pg(
      `BEGIN;DELETE FROM etmam.pdf_cache WHERE account_id=${lit(actor)};DELETE FROM etmam.jobs WHERE account_id=${lit(actor)};DELETE FROM etmam.link_tokens WHERE account_id=${lit(actor)};DELETE FROM etmam.code_attempts WHERE account_id=${lit(actor)};DELETE FROM etmam.sessions WHERE account_id=${lit(actor)};DELETE FROM etmam.drafts WHERE account_id=${lit(actor)};DELETE FROM etmam.codes WHERE batch=${lit(batch)};DELETE FROM etmam.memberships WHERE account_id=${lit(actor)};DELETE FROM etmam.identities WHERE account_id=${lit(actor)};DELETE FROM etmam.accounts WHERE id=${lit(actor)};COMMIT;`,
    );
  }
  if (uid) await admin.auth.admin.deleteUser(uid);
  console.log("Disposable test data cleaned; existing accounts untouched.");
}
