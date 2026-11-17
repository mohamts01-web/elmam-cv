import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
const folder = "E:/مشاريعي/etmam-cv-bot/data",
  c = JSON.parse(
    fs.readFileSync(
      "E:/مشاريعي/.elmam-local-data/etmam-web/runtime.local.json",
      "utf8",
    ),
  );
if (fs.existsSync(folder + "/cloud-mode.local.json"))
  throw Error("cloud_mode_already_active_do_not_reimport");
if ((await tg("getWebhookInfo")).url)
  throw Error("webhook_already_active_do_not_reimport");
if (fs.existsSync(folder + "/polling.lock")) {
  const pid = Number(fs.readFileSync(folder + "/polling.lock", "utf8"));
  let live = false;
  try {
    process.kill(pid, 0);
    live = true;
  } catch {}
  if (live) throw Error("old_poller_running_stop_before_cutover");
}
const delta = spawnSync(
  process.execPath,
  ["scripts/migrate-bot.mjs", "--apply", "--final-delta"],
  { encoding: "utf8", timeout: 40000 },
);
if (delta.status !== 0) throw Error("final_delta_failed");
console.log(delta.stdout.trim());
async function tg(method, body = {}) {
  const r = await fetch(
    "https://api.telegram.org/bot" + c.telegramToken + "/" + method,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    },
  );
  const j = await r.json();
  if (!r.ok || !j.ok) throw Error("telegram_" + method + "_failed");
  return j.result;
}
const me = await tg("getMe");
if (me.username !== "etmam_cv_bot") throw Error("wrong_bot");
const db = new DatabaseSync(folder + "/etmam.sqlite3", { readOnly: true });
const offset = Number(
  db.prepare("SELECT value FROM settings WHERE key='offset'").get()?.value || 0,
);
db.close();
// Acknowledge only the prefix already handled by the old poller. Returned new updates stay pending.
const pending = await tg("getUpdates", {
  offset,
  timeout: 0,
  limit: 100,
  allowed_updates: ["message", "callback_query"],
});
console.log(JSON.stringify({ pendingUpdatesPreserved: pending.length }));
const url = c.supabaseUrl + "/functions/v1/etmam-telegram";
await tg("setWebhook", {
  url,
  secret_token: c.webhookSecret,
  max_connections: 1,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: false,
});
const info = await tg("getWebhookInfo");
if (info.url !== url) throw Error("webhook_verification_failed");
fs.writeFileSync(
  folder + "/cloud-mode.local.json",
  JSON.stringify(
    {
      activatedAt: new Date().toISOString(),
      webhook: url,
      source: "E:/مشاريعي/etmam-cv-web",
      oldOffset: offset,
    },
    null,
    2,
  ),
);
fs.writeFileSync(
  "docs/BOT_CUTOVER.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      bot: me.username,
      webhook: url,
      pendingUpdatesPreserved: pending.length,
      pendingUpdateCount: info.pending_update_count,
      localPollerRunning: false,
    },
    null,
    2,
  ),
);
console.log("ETMAM_WEBHOOK_ACTIVE; old polling remains off.");
