import { client, env, optionalEnv } from "./runtime.ts";
import { dualPrice, validatePaidTransaction } from "../../../shared/paddle.mjs";
import {
  purchasedPriceId,
  checkedPurchase,
} from "../../../shared/paddle-upgrade.mjs";
export function paddleMode() {
  const mode = optionalEnv("ETMAM_PADDLE_ENVIRONMENT");
  if (!["sandbox", "live"].includes(mode))
    throw Error("configuration_required");
  return mode;
}
export function requirePaddleUser(email: string, requireReady = true) {
  if (requireReady && optionalEnv("ETMAM_DIRECT_BILLING_ENABLED") !== "true")
    throw Error("offer_unavailable");
  const mode = paddleMode();
  if (
    requireReady &&
    mode === "live" &&
    optionalEnv("ETMAM_PADDLE_LIVE_READY") !== "true"
  )
    throw Error("offer_unavailable");
  if (
    mode === "sandbox" &&
    !optionalEnv("ETMAM_PADDLE_TEST_EMAILS")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .includes(email.toLowerCase())
  )
    throw Error("offer_unavailable");
  return mode;
}
export async function billing<T = any>(
  actor: string | null,
  action: string,
  payload: unknown = {},
): Promise<T> {
  const { data, error } = await client().rpc("etmam_billing", {
    p_actor: actor,
    p_action: action,
    p_environment: paddleMode(),
    p_payload: payload,
  });
  if (error) throw Error(error.message);
  return data;
}
export class PaddleRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super("configuration_required");
  }
}
export async function paddleAPI(path: string, body?: unknown, method?: string) {
  const base =
    paddleMode() === "sandbox"
      ? "https://sandbox-api.paddle.com"
      : "https://api.paddle.com";
  const r = await fetch(base + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      Authorization: "Bearer " + env("ETMAM_PADDLE_API_KEY"),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(18000),
  });
  const j = await r.json();
  if (!r.ok) {
    console.error("paddle_request_failed", r.status, j.error?.code);
    throw new PaddleRequestError(r.status, j.error?.code || "unknown");
  }
  return j.data;
}
const offerView = (o: any) => ({
  sku: o.sku,
  title: o.title,
  kind: o.kind,
  priceId: o.price_id,
  usdCents: o.usd_cents,
  sarTarget: Number(o.sar_target),
  interval: o.interval,
  aiOperations: o.ai_operations,
  drafts: o.max_drafts,
  ...dualPrice(o.usd_cents),
});
export async function paddleCatalog(actor: string, email: string) {
  let mode: string;
  try {
    mode = requirePaddleUser(email);
  } catch {
    return { ready: false, offers: [] };
  }
  const offers = await billing<any[]>(actor, "catalog");
  return {
    ready: offers.length > 0,
    environment: mode,
    clientToken: env("ETMAM_PADDLE_CLIENT_TOKEN"),
    offers: offers.map(offerView),
  };
}
export async function paddleCheckout(
  actor: string,
  email: string,
  body: Record<string, unknown>,
) {
  requirePaddleUser(email);
  if (
    typeof body.sku !== "string" ||
    typeof body.idempotencyKey !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(body.idempotencyKey)
  )
    throw Error("offer_unavailable");
  const { intent, offer } = await billing(actor, "intent.create", {
    id: body.idempotencyKey,
    sku: body.sku,
  });
  if (intent.transaction_id)
    return { intentId: intent.id, transactionId: intent.transaction_id };
  // A crash after Paddle accepts the transaction leaves a visible pending intent;
  // do not automatically create another transaction for the same intent.
  const claimed = await billing(actor, "intent.claim", { id: intent.id });
  if (!claimed) {
    const recent = await paddleAPI(
      "/transactions?per_page=100&order_by=created_at[DESC]",
    );
    const matches = recent.filter(
      (x: any) => x.custom_data?.etmam_intent === intent.id,
    );
    if (
      matches.length === 1 &&
      matches[0].items?.[0]?.price?.id === offer.price_id
    ) {
      await billing(actor, "intent.bind", {
        id: intent.id,
        transactionId: matches[0].id,
      });
      return { intentId: intent.id, transactionId: matches[0].id };
    }
    throw Error("checkout_pending");
  }
  let tx;
  try {
    tx = await paddleAPI("/transactions", {
      items: [{ price_id: offer.price_id, quantity: 1 }],
      currency_code: "USD",
      collection_mode: "automatic",
      custom_data: { etmam_intent: intent.id },
      checkout: { url: env("ETMAM_WEB_URL") + "/documents" },
    });
  } catch (e) {
    if (
      e instanceof PaddleRequestError &&
      [400, 401, 403, 422].includes(e.status)
    )
      await billing(actor, "intent.release", { id: intent.id });
    throw e;
  }
  await billing(actor, "intent.bind", { id: intent.id, transactionId: tx.id });
  return { intentId: intent.id, transactionId: tx.id };
}
export async function paddlePortal(actor: string, email: string) {
  requirePaddleUser(email, false);
  const { customerId, subscriptionId } = await billing(actor, "portal");
  const p = await paddleAPI("/customers/" + customerId + "/portal-sessions", {
    subscription_ids: [subscriptionId],
  });
  return { url: p.urls.general.overview };
}
async function planChange(actor: string, action: string, payload: unknown) {
  const { data, error } = await client().rpc("etmam_billing_change", {
    p_actor: actor,
    p_action: action,
    p_environment: paddleMode(),
    p_payload: payload,
  });
  if (error) throw Error(error.message);
  return data;
}
export async function previewPlanChange(
  actor: string,
  email: string,
  sku: string,
) {
  requirePaddleUser(email);
  const offers = await billing<any[]>(actor, "catalog");
  const target = offers.find((x) => x.sku === sku && x.kind === "subscription");
  if (!target) throw Error("offer_unavailable");
  const { subscriptionId, customerId } = await billing(actor, "portal");
  const s = await paddleAPI("/subscriptions/" + subscriptionId);
  const old = offers.find((x) => x.price_id === s.items?.[0]?.price?.id);
  if (
    s.customer_id !== customerId ||
    s.status !== "active" ||
    s.scheduled_change ||
    s.items?.length !== 1 ||
    !old ||
    target.max_drafts <= old.max_drafts ||
    target.interval !== old.interval
  )
    throw Error("offer_unavailable");
  const body = {
    items: [{ price_id: target.price_id, quantity: 1 }],
    proration_billing_mode: "prorated_immediately",
    on_payment_failure: "prevent_change",
  };
  const preview = await paddleAPI(
    "/subscriptions/" + s.id + "/preview",
    body,
    "PATCH",
  );
  const totals = preview.immediate_transaction?.details?.totals;
  if (
    !totals ||
    totals.currency_code !== "USD" ||
    !Number.isSafeInteger(Number(totals.total)) ||
    Number(totals.total) < 0
  )
    throw Error("payment_mismatch");
  const stored = await planChange(actor, "create", {
    subscriptionId: s.id,
    sku: target.sku,
    preview: {
      body,
      updatedAt: s.updated_at,
      total: Number(totals.total),
      customerId,
    },
  });
  return {
    id: stored.id,
    title: target.title,
    usdCents: Number(totals.total),
    ...dualPrice(Number(totals.total)),
    recurringUsd: dualPrice(target.usd_cents).usd,
    interval: target.interval,
    drafts: target.max_drafts,
    aiMonthly: target.ai_operations,
  };
}
export async function confirmPlanChange(
  actor: string,
  email: string,
  id: string,
) {
  requirePaddleUser(email);
  const c = await planChange(actor, "claim", { id });
  let attempted = false;
  try {
    const s = await paddleAPI("/subscriptions/" + c.subscription_id);
    if (
      s.updated_at !== c.preview.updatedAt ||
      s.customer_id !== c.preview.customerId ||
      s.status !== "active" ||
      s.scheduled_change
    )
      throw Error("payment_mismatch");
    const preview = await paddleAPI(
      "/subscriptions/" + s.id + "/preview",
      c.preview.body,
      "PATCH",
    );
    const totals = preview.immediate_transaction?.details?.totals;
    if (
      totals?.currency_code !== "USD" ||
      Number(totals.total) > c.preview.total
    )
      throw Error("payment_mismatch");
    attempted = true;
    await paddleAPI("/subscriptions/" + s.id, c.preview.body, "PATCH");
    await planChange(actor, "finish", { id, state: "completed" });
    return { accepted: true };
  } catch (e) {
    await planChange(actor, "finish", {
      id,
      state:
        attempted && !(e instanceof PaddleRequestError && e.status < 500)
          ? "uncertain"
          : "failed",
    });
    throw e;
  }
}
export async function provisionPaddleTransaction(
  id: string,
  eventId: string,
  occurredAt: string,
) {
  if (!/^txn_[a-z0-9]{26}$/.test(id)) throw Error("payment_mismatch");
  const tx = await paddleAPI("/transactions/" + id);
  if (tx.status !== "completed") return;
  const info = await billing(null, "event.lookup", {
    transactionId: tx.id,
    intentId: tx.custom_data?.etmam_intent || null,
    subscriptionId: tx.subscription_id || null,
    priceId: purchasedPriceId(tx),
  });
  if (info?.alreadyProcessed) return;
  if (!info?.offer) throw Error("payment_mismatch");
  const offer = offerView(info.offer);
  const purchased = checkedPurchase(tx, offer, info.subscription);
  if (info.intent) {
    if (info.intent.transaction_id && info.intent.transaction_id !== tx.id)
      throw Error("payment_mismatch");
    validatePaidTransaction(
      purchased,
      { ...info.intent, transaction_id: tx.id },
      offer,
    );
  } else {
    if (info.subscription.customer_id !== tx.customer_id)
      throw Error("payment_mismatch");
    // A known, server-owned subscription is the renewal authority.
    validatePaidTransaction(
      purchased,
      { id: tx.custom_data?.etmam_intent, transaction_id: tx.id },
      offer,
    );
  }
  const period =
    tx.origin === "subscription_update" && info.subscription
      ? {
          starts_at: info.subscription.period_start,
          ends_at: info.subscription.paid_until,
        }
      : tx.billing_period;
  if (offer.kind === "subscription" && (!period?.starts_at || !period?.ends_at))
    throw Error("payment_mismatch");
  await billing(null, "event.complete", {
    accountId: info.accountId,
    intentId: info.intent?.id || null,
    transactionId: tx.id,
    priceId: offer.priceId,
    subscriptionId: tx.subscription_id || null,
    customerId: tx.customer_id,
    periodStart: period?.starts_at,
    periodEnd: period?.ends_at,
    paidAt: tx.billed_at || tx.updated_at,
    eventId,
    occurredAt,
  });
  if (offer.kind === "subscription") {
    const s = await paddleAPI("/subscriptions/" + tx.subscription_id);
    await billing(null, "event.subscription", {
      subscriptionId: s.id,
      status: s.status,
      occurredAt: s.updated_at,
    });
  }
}
