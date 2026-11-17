import { unwrapWebhook } from "npm:@whop/sdk@2.7.0/helpers";
import { client } from "../_shared/runtime.ts";
import { activateWhopPayment, whopProvider, whopWebhookSecret } from "../_shared/whop-billing.ts";
import { starterOffer } from "../_shared/whop.mjs";

type PaymentEvent = {
  type: string;
  data?: { id?: string; metadata?: { etmam_offer?: string } };
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const environment = new URL(request.url).searchParams.get("environment") ?? "sandbox";
  if (environment !== "sandbox" && environment !== "live") return new Response(null, { status: 404 });
  const secret = whopWebhookSecret(environment);
  if (!secret) return new Response(null, { status: 503 });
  if (Number(request.headers.get("content-length")) > 256_000)
    return new Response(null, { status: 413 });

  let event: PaymentEvent;
  try {
    const body = await request.text();
    if (body.length > 256_000) return new Response(null, { status: 413 });
    event = unwrapWebhook<PaymentEvent>(body, {
      headers: Object.fromEntries(request.headers),
      key: secret,
    });
  } catch {
    return new Response(null, { status: 401 });
  }
  if (event.type !== "payment.succeeded" || event.data?.metadata?.etmam_offer !== starterOffer.sku)
    return new Response(null, { status: 204 });
  const paymentId = event.data.id;
  if (typeof paymentId !== "string") return new Response(null, { status: 400 });

  try {
    const paid = await whopProvider(environment).reconcilePaid(paymentId, async (configurationId: string) => {
      const { data, error } = await client().rpc("etmam_whop_find_intent", {
        p_environment: environment,
        p_configuration: configurationId,
      });
      if (error) throw Error(error.message);
      return data;
    });
    await activateWhopPayment(paid);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 503 });
  }
});
