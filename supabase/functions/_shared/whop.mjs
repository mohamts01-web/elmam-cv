const origins = {
  sandbox: ["https://sandbox-api.whop.com", "https://sandbox.whop.com"],
  live: ["https://api.whop.com", "https://whop.com"],
};
const apiVersion = "2026-11-07";
const intentPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const id = (value, prefix) => typeof value === "string" && new RegExp("^" + prefix + "_[a-zA-Z0-9]{3,64}$").test(value);

export const starterOffer = Object.freeze({
  sku: "whop-starter",
  amountMinor: 900,
  currency: "sar",
  days: 30,
  drafts: 1,
  aiOperations: 3,
});
export const liveStarterOffer = Object.freeze({ ...starterOffer, amountMinor: 1000 });

export function whopClient({ apiKey, companyId, planId, returnUrl, environment = "sandbox" }, fetcher = fetch) {
  if (environment !== "sandbox" && environment !== "live") throw Error("whop_config");
  const [apiOrigin, checkoutOrigin] = origins[environment];
  const offer = environment === "live" ? liveStarterOffer : starterOffer;
  if (!apiKey || !id(companyId, "biz") || !id(planId, "plan")) throw Error("whop_config");
  const target = new URL(returnUrl);
  if (target.protocol !== "https:" || target.username || target.password || target.hash) throw Error("whop_return");

  async function request(path, body, intentId) {
    const response = await fetcher(apiOrigin + "/api/v1/" + path, {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: "Bearer " + apiKey,
        "Api-Version-Date": apiVersion,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json", "Idempotency-Key": intentId } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error("whop_http_" + response.status);
    }
    return await response.json();
  }

  async function reconcilePaid(paymentId, findIntent) {
    if (!id(paymentId, "pay")) throw Error("whop_intent");
    const payment = await request("payments/" + paymentId);
    const configurationId = payment.checkout_configuration_id;
    const line = payment.line_items?.[0];
    // Whop can settle in a different currency from the one shown at checkout.
    const total = payment.presentment_total ?? payment.total;
    const amount = String(total?.amount ?? "");
    if (
      payment.id !== paymentId ||
      payment.status !== "paid" || payment.substatus !== "succeeded" ||
      payment.account_id !== companyId || !id(configurationId, "ch") ||
      !intentPattern.test(payment.metadata?.etmam_intent_id) || payment.metadata?.etmam_offer !== starterOffer.sku ||
      payment.line_items?.length !== 1 || line?.variant_id !== planId || line.quantity !== 1 ||
      total?.currency !== starterOffer.currency || payment.auto_refunded || payment.refunded_at ||
      !/^\d{1,8}(?:\.\d{1,2})?$/.test(amount) || Math.round(Number(amount) * 100) !== offer.amountMinor ||
      !Number.isFinite(Date.parse(payment.paid_at))
    ) throw Error("whop_payment_mismatch");

    const intentId = await findIntent(configurationId);
    if (intentId !== payment.metadata.etmam_intent_id) throw Error("whop_payment_mismatch");
    return { intentId, configurationId, paymentId, paidAt: new Date(payment.paid_at).toISOString(), environment };
  }

  return {
    reconcilePaid,
    async createCheckout(intentId) {
      if (!intentPattern.test(intentId)) throw Error("whop_intent");
      const result = await request("checkout_configurations", {
        account_id: companyId,
        variant_id: planId,
        mode: "payment",
        redirect_url: target.href,
        metadata: { etmam_intent_id: intentId, etmam_offer: starterOffer.sku },
      }, intentId);
      if (typeof result.purchase_url !== "string" || !id(result.id, "ch") ||
          result.account_id !== companyId || result.mode !== "payment" ||
          result.variant?.id !== planId || result.variant.billing_type !== "one_time" ||
          result.variant.currency !== starterOffer.currency ||
          result.variant.expiration_days !== starterOffer.days ||
          Math.round(Number(result.variant.initial_price) * 100) !== offer.amountMinor) {
        throw Error("whop_checkout");
      }
      const purchase = new URL(result.purchase_url, checkoutOrigin);
      if (purchase.origin !== checkoutOrigin || purchase.username || purchase.password ||
          purchase.pathname.replace(/\/$/, "") !== "/checkout/" + result.id) throw Error("whop_checkout");
      return { configurationId: result.id, url: purchase.href };
    },
  };
}
