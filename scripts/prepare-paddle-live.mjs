import fs from "node:fs";
import { pg } from "./pg.mjs";
const read = (p) =>
  fs
    .readFileSync(p, "utf8")
    .replace(/^\uFEFF/, "")
    .trim();
const key = read("E:/pas/PADDLE-ETMAM-LIVE.txt");
const token = read("E:/pas/PADDLE-ETMAM-LIVE-PUBLIC.txt");
if (!key.startsWith("pdl_live_") || !token.startsWith("live_"))
  throw Error("Live credentials required");
const destination =
  "https://okwqqkcifvmaoarlemix.supabase.co/functions/v1/etmam-paddle-webhook";
async function api(path, body, method) {
  const r = await fetch("https://api.paddle.com" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(25000),
  });
  const j = await r.json();
  if (!r.ok) throw Error("Paddle " + r.status + " " + j.error?.code);
  return j.data;
}
let n = (await api("/notification-settings")).find(
  (x) => x.destination === destination,
);
if (!n)
  n = await api("/notification-settings", {
    description: "ETMAM CV live payments — staged",
    type: "url",
    destination,
    traffic_source: "platform",
    include_sensitive_fields: false,
    subscribed_events: [
      "transaction.completed",
      "subscription.created",
      "subscription.updated",
      "subscription.canceled",
      "subscription.paused",
      "subscription.resumed",
      "subscription.past_due",
      "adjustment.created",
      "adjustment.updated",
    ],
  });
// No live transactions are accepted while business/domain approval is pending.
await api("/notification-settings/" + n.id, { active: false }, "PATCH");
if (!n.endpoint_secret_key) n = await api("/notification-settings/" + n.id);
if (!n.endpoint_secret_key) throw Error("Missing webhook secret");
fs.writeFileSync("E:/pas/PADDLE-ETMAM-LIVE-WEBHOOK.txt", n.endpoint_secret_key);
const staged = {
  ETMAM_PADDLE_STAGED_LIVE_API_KEY: key,
  ETMAM_PADDLE_STAGED_LIVE_CLIENT_TOKEN: token,
  ETMAM_PADDLE_STAGED_LIVE_WEBHOOK_SECRET: n.endpoint_secret_key,
  ETMAM_PADDLE_STAGED_LIVE_NOTIFICATION_ID: n.id,
};
const lit = (s) => "'" + s.replaceAll("'", "''") + "'";
pg(
  `DO $$DECLARE sid uuid;v jsonb;BEGIN SELECT id,decrypted_secret::jsonb INTO sid,v FROM vault.decrypted_secrets WHERE name='etmam-runtime-v1';IF sid IS NULL THEN RAISE EXCEPTION 'runtime_missing';END IF;PERFORM vault.update_secret(sid,(v||${lit(JSON.stringify(staged))}::jsonb)::text,'etmam-runtime-v1');END$$;`,
);
const offers = JSON.parse(read("private/paddle-live-catalog.json"));
pg(
  "BEGIN;" +
    offers
      .map(
        (o) =>
          `INSERT INTO etmam.billing_offers(environment,sku,price_id,title,kind,usd_cents,sar_target,interval,ai_operations,max_drafts,enabled) VALUES('live',${lit(o.sku)},${lit(o.priceId)},${lit(o.title)},${lit(o.kind)},${o.usdCents},${o.sarTarget},${o.interval ? lit(o.interval) : "NULL"},${o.aiOperations},${o.drafts},false) ON CONFLICT(environment,sku) DO UPDATE SET price_id=excluded.price_id,title=excluded.title,usd_cents=excluded.usd_cents,sar_target=excluded.sar_target,enabled=false;`,
      )
      .join("") +
    "COMMIT;",
);
fs.writeFileSync(
  "private/paddle-live-settings.json",
  JSON.stringify(
    {
      notificationId: n.id,
      destination,
      environment: "live",
      active: false,
      preparedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  "Live catalog and credentials staged privately. Live destination/offers disabled; Sandbox configuration preserved.",
);
