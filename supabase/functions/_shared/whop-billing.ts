import { client, env, optionalEnv } from "./runtime.ts";
import { liveStarterOffer, starterOffer, whopClient } from "./whop.mjs";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const paymentIdPattern = /^pay_[a-zA-Z0-9]{3,64}$/;
export type WhopEnvironment = "sandbox" | "live";
const prefix = (environment: WhopEnvironment) => "ETMAM_WHOP_" + environment.toUpperCase() + "_";

export function whopEnabled(environment: WhopEnvironment) {
  const name = prefix(environment);
  return optionalEnv(name + "ENABLED") === "true" &&
    ["API_KEY", "COMPANY_ID", "PLAN_ID", "RETURN_URL"].every((key) => Boolean(optionalEnv(name + key))) &&
    (environment === "sandbox" || Boolean(optionalEnv(name + "WEBHOOK_SECRET")));
}

export function whopWebhookSecret(environment: WhopEnvironment) {
  return optionalEnv(prefix(environment) + "WEBHOOK_SECRET");
}

export function whopProvider(environment: WhopEnvironment, returnUrl?: string) {
  const name = prefix(environment);
  return whopClient({
    environment,
    apiKey: env(name + "API_KEY"),
    companyId: env(name + "COMPANY_ID"),
    planId: env(name + "PLAN_ID"),
    returnUrl: returnUrl ?? env(name + "RETURN_URL"),
  });
}

export async function activateWhopPayment(paid: {
  environment: string; intentId: string; configurationId: string; paymentId: string; paidAt: string;
}) {
  const { error } = await client().rpc("etmam_whop_activate", {
    p_environment: paid.environment,
    p_intent: paid.intentId,
    p_configuration: paid.configurationId,
    p_payment: paid.paymentId,
    p_paid_at: paid.paidAt,
  });
  if (error) throw Error(error.code === "23505" ? "payment_mismatch" : error.message);
}

type Intent = {
  intentId: string;
  configurationId: string | null;
  url: string | null;
  completed: boolean;
};

function availableEnvironment(email: string): WhopEnvironment | null {
  if (!email) return null;
  const sandboxUser = optionalEnv("ETMAM_WHOP_SANDBOX_EMAILS").split(",")
    .some((value) => value.trim().toLowerCase() === email.toLowerCase());
  if (sandboxUser && whopEnabled("sandbox")) return "sandbox";
  return whopEnabled("live") ? "live" : null;
}

async function checkoutIntent(environment: WhopEnvironment, actor: string, intentId: string, action: "create" | "get" | "bind", checkout?: {
  configurationId: string;
  url: string;
}): Promise<Intent> {
  const { data, error } = await client().rpc("etmam_whop_checkout", {
    p_actor: actor,
    p_environment: environment,
    p_intent: intentId,
    p_action: action,
    ...(checkout ? { p_configuration: checkout.configurationId, p_url: checkout.url } : {}),
  });
  if (error) throw Error(error.message);
  return data;
}

export async function whopBilling(
  actor: string,
  email: string,
  path: string,
  method: string,
  body: Record<string, unknown>,
  returnUrl?: string,
) {
  const environment = availableEnvironment(email);
  if (path === "/billing/whop/catalog" && method === "GET")
    return {
      ready: Boolean(environment),
      environment,
      offer: environment === "live" ? liveStarterOffer : environment === "sandbox" ? starterOffer : null,
    };
  if (!environment) throw Error("offer_unavailable");
  if (method !== "POST") throw Error("not_found");

  const { intentId, paymentId } = body;
  if (typeof intentId !== "string" || !uuid.test(intentId)) throw Error("not_found");
  if (path === "/billing/whop/status") {
    const intent = await checkoutIntent(environment, actor, intentId, "get");
    return { completed: intent.completed };
  }

  if (path === "/billing/whop/checkout") {
    const intent = await checkoutIntent(environment, actor, intentId, "create");
    if (intent.completed || intent.url) return intent;
    const referredJob = body.referralJobId;
    if (environment === "live" && typeof referredJob === "number" &&
        Number.isSafeInteger(referredJob) && referredJob > 0 && referredJob <= 999999999999) {
      try {
        const listing = await fetch("https://jobs.cvsira.com/api/cv-job/" + referredJob, {
          signal: AbortSignal.timeout(1800),
          redirect: "error",
        });
        if (listing.ok) {
          const { error } = await client().rpc("etmam_whop_attribute_job", {
            p_actor: actor, p_intent: intentId, p_job: referredJob,
          });
          if (error) console.warn("whop_referral_write_failed");
        }
        await listing.body?.cancel();
      } catch { console.warn("whop_referral_check_failed"); }
    }
    const checkout = await whopProvider(environment, returnUrl).createCheckout(intentId);
    return await checkoutIntent(environment, actor, intentId, "bind", checkout);
  }
  if (path === "/billing/whop/confirm") {
    if (typeof paymentId !== "string" || !paymentIdPattern.test(paymentId)) throw Error("payment_mismatch");
    const intent = await checkoutIntent(environment, actor, intentId, "get");
    if (!intent.configurationId) throw Error("checkout_pending");
    const paid = await whopProvider(environment).reconcilePaid(paymentId, (configurationId: string) =>
      configurationId === intent.configurationId ? intentId : null);
    await activateWhopPayment(paid);
    return { completed: true };
  }
  throw Error("not_found");
}
