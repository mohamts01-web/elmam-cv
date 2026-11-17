import { env } from "../_shared/runtime.ts";
import {
  billing,
  paddleAPI,
  provisionPaddleTransaction,
} from "../_shared/paddle.ts";
import { verifyPaddleSignature } from "../../../shared/paddle.mjs";
Deno.serve(async (req) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  try {
    const reader = req.body?.getReader();
    if (!reader) return new Response("Missing body", { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1000000) {
        await reader.cancel();
        return new Response("Too large", { status: 413 });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    const raw = new TextDecoder().decode(bytes);
    if (
      !(await verifyPaddleSignature(
        raw,
        req.headers.get("Paddle-Signature"),
        env("ETMAM_PADDLE_WEBHOOK_SECRET"),
      ))
    )
      return new Response("Invalid signature", { status: 401 });
    const e = JSON.parse(raw);
    if (
      !/^evt_[a-z0-9]{26}$/.test(e.event_id) ||
      !Number.isFinite(Date.parse(e.occurred_at))
    )
      return new Response("Invalid event", { status: 400 });
    if (e.event_type === "transaction.completed")
      await provisionPaddleTransaction(e.data.id, e.event_id, e.occurred_at);
    else if (String(e.event_type).startsWith("subscription.")) {
      if (!/^sub_[a-z0-9]{26}$/.test(e.data.id))
        return new Response("Invalid subscription", { status: 400 });
      const s = await paddleAPI("/subscriptions/" + e.data.id);
      await billing(null, "event.subscription", {
        subscriptionId: s.id,
        status: s.status,
        occurredAt: s.updated_at,
      });
    } else if (
      ["adjustment.created", "adjustment.updated"].includes(e.event_type)
    ) {
      if (!/^adj_[a-z0-9]{26}$/.test(e.data.id))
        return new Response("Invalid adjustment", { status: 400 });
      const a = await paddleAPI("/adjustments/" + e.data.id);
      if (
        a.status === "approved" &&
        ["refund", "chargeback"].includes(a.action) &&
        a.type === "full"
      )
        await billing(null, "event.refund", {
          transactionId: a.transaction_id,
        });
    }
    return new Response("OK");
  } catch (e) {
    console.error(
      "paddle_webhook_failed",
      e instanceof Error ? e.message.slice(0, 100) : "unknown",
    );
    return new Response("Retry later", { status: 503 });
  }
});
