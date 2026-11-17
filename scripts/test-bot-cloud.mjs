import fs from "node:fs";
import crypto from "node:crypto";
import { pg } from "./pg.mjs";
const c = JSON.parse(
  fs.readFileSync(
    "E:/مشاريعي/.elmam-local-data/etmam-web/runtime.local.json",
    "utf8",
  ),
);
const id = -Number(Date.now());
const owner = 7446648364;
const r = await fetch(c.supabaseUrl + "/functions/v1/etmam-telegram", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Telegram-Bot-Api-Secret-Token": c.webhookSecret,
  },
  body: JSON.stringify({
    update_id: id,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      from: { id: owner, is_bot: false, first_name: "Owner" },
      chat: { id: owner, type: "private" },
      text: "/menu",
    },
  }),
});
if (r.status !== 200) throw Error("webhook_test_rejected");
let state;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 1200));
  state = JSON.parse(
    pg(
      `SELECT json_build_object('state',state,'error',error) FROM etmam.telegram_updates WHERE id=${id}`,
    ),
  );
  if (["done", "uncertain"].includes(state.state)) break;
}
console.log(JSON.stringify({ testUpdate: id, ...state }));
if (state.state !== "done") process.exitCode = 1;
