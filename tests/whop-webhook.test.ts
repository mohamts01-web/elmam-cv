import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

Deno.test("Whop webhook verifies signature and rechecks the payment before activation", async () => {
  const secret = "ws_test_signing_secret";
  const intent = "c1b0d1d0-c1b0-41d0-81b0-c1b0d1d0c1b0";
  const payment = "pay_testwhop";
  const configuration = "ch_testwhop";
  const metadata = { etmam_intent_id: intent, etmam_offer: "whop-starter" };
  const paidAt = new Date().toISOString();
  const settings = {
    SUPABASE_URL: "https://fixture.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
    ETMAM_WHOP_SANDBOX_ENABLED: "false",
    ETMAM_WHOP_SANDBOX_API_KEY: "test-whop-key",
    ETMAM_WHOP_SANDBOX_COMPANY_ID: "biz_fixture",
    ETMAM_WHOP_SANDBOX_PLAN_ID: "plan_fixture",
    ETMAM_WHOP_SANDBOX_RETURN_URL: "https://etmam-cv.netlify.app/plans",
    ETMAM_WHOP_SANDBOX_WEBHOOK_SECRET: secret,
  };
  const previous = Object.keys(settings).map((key) => [key, Deno.env.get(key)] as const);
  const fetchBefore = globalThis.fetch;
  const serveBefore = Deno.serve;
  let handle: Deno.ServeHandler | undefined;
  const requests: string[] = [];
  let amount = "9.00";
  try {
    for (const [key, value] of Object.entries(settings)) Deno.env.set(key, value);
    Deno.serve = ((handler: Deno.ServeHandler) => {
      handle = handler;
    }) as typeof Deno.serve;
    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input));
      const resource = url.pathname.split("/").at(-1)!;
      requests.push(resource);
      if (resource === "etmam_runtime") return Response.json(null);
      if (url.origin === "https://sandbox-api.whop.com" && resource === payment) {
        return Response.json({
          id: payment, account_id: "biz_fixture", checkout_configuration_id: configuration,
          status: "paid", substatus: "succeeded", paid_at: paidAt, metadata,
          total: { amount, currency: "sar" },
          line_items: [{ variant_id: "plan_fixture", quantity: 1 }],
        });
      }
      if (resource === "etmam_whop_find_intent") {
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_environment: "sandbox", p_configuration: configuration,
        });
        return Response.json(intent);
      }
      if (resource === "etmam_whop_activate") {
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_environment: "sandbox", p_intent: intent, p_configuration: configuration,
          p_payment: payment, p_paid_at: paidAt,
        });
        return Response.json(true);
      }
      throw Error("unexpected request");
    }) as typeof fetch;
    await import("../supabase/functions/etmam-whop-webhook/index.ts");
    assert.ok(handle);
    const invoke = handle as (request: Request) => Promise<Response>;
    const body = JSON.stringify({ type: "payment.succeeded", data: { id: payment, metadata } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const delivery = "msg_whop_fixture";
    const signature = createHmac("sha256", secret).update([delivery, timestamp, body].join(".")).digest("base64");
    const headers = {
      "webhook-id": delivery, "webhook-timestamp": timestamp, "webhook-signature": "v1," + signature,
    };
    const send = (payload: string) =>
      invoke(new Request("https://fixture.test/whop", { method: "POST", headers, body: payload }));

    assert.equal((await send(body.replace(payment, "pay_tampered"))).status, 401);
    assert.deepEqual(requests, ["etmam_runtime"]);
    amount = "8.00";
    assert.equal((await send(body)).status, 503);
    assert.deepEqual(requests, ["etmam_runtime", payment]);
    amount = "9.00";
    assert.equal((await send(body)).status, 204);
    assert.deepEqual(requests, [
      "etmam_runtime", payment, payment, "etmam_whop_find_intent", "etmam_whop_activate",
    ]);
  } finally {
    globalThis.fetch = fetchBefore;
    Deno.serve = serveBefore;
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
