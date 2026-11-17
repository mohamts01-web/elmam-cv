// Prices and entitlements are configured on the server after commercial approval.
// No amount, account ID or entitlement is accepted from checkout return parameters.
export function validatePaddleCatalog(value) {
  if (!Array.isArray(value) || value.length > 12)
    throw Error("invalid_catalog");
  const seen = new Set();
  return value.map((item) => {
    if (!item || typeof item !== "object") throw Error("invalid_catalog");
    const {
      sku,
      title,
      kind,
      priceId,
      usdCents,
      aiOperations,
      drafts,
      interval,
    } = item;
    if (
      !/^[a-z][a-z0-9_-]{1,39}$/.test(sku) ||
      seen.has(sku) ||
      typeof title !== "string" ||
      !title.trim() ||
      title.length > 100 ||
      !["subscription", "ai", "drafts"].includes(kind) ||
      !/^pri_[a-z0-9]{26}$/.test(priceId) ||
      !Number.isSafeInteger(usdCents) ||
      usdCents < 50 ||
      usdCents > 100000 ||
      !Number.isSafeInteger(aiOperations) ||
      aiOperations < 0 ||
      aiOperations > 10000 ||
      !Number.isSafeInteger(drafts) ||
      drafts < 0 ||
      drafts > 100 ||
      (kind === "subscription"
        ? !["month", "year"].includes(interval)
        : interval !== null) ||
      (kind === "subscription" && drafts < 1) ||
      (kind === "ai" && (aiOperations < 1 || drafts !== 0)) ||
      (kind === "drafts" && (drafts < 1 || aiOperations !== 0))
    )
      throw Error("invalid_catalog");
    seen.add(sku);
    return {
      sku,
      title: title.trim(),
      kind,
      priceId,
      usdCents,
      aiOperations,
      drafts,
      interval,
    };
  });
}

export function dualPrice(usdCents) {
  if (!Number.isSafeInteger(usdCents) || usdCents < 0)
    throw Error("invalid_amount");
  // Indicative SAR equivalent. Checkout remains authoritative for taxes and total.
  return {
    usd: (usdCents / 100).toFixed(2),
    sar: ((usdCents * 375) / 10000).toFixed(2),
    rate: 3.75,
  };
}

export async function verifyPaddleSignature(
  raw,
  signature,
  secret,
  nowSeconds = Date.now() / 1000,
) {
  if (typeof raw !== "string" || raw.length > 1000000 || !secret || !signature)
    return false;
  const ts = signature.match(/(?:^|;)\s*ts=(\d+)(?:;|$)/)?.[1];
  const hashes = [
    ...signature.matchAll(/(?:^|;)\s*h1=([a-f0-9]{64})(?=;|$)/g),
  ].map((x) => x[1]);
  if (!ts || !hashes.length || Math.abs(nowSeconds - Number(ts)) > 5)
    return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(ts + ":" + raw)),
  );
  const expected = [...bytes]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  let matched = 0;
  for (const h of hashes) {
    let diff = 0;
    for (let i = 0; i < 64; i++)
      diff |= h.charCodeAt(i) ^ expected.charCodeAt(i);
    matched |= Number(diff === 0);
  }
  return matched === 1;
}

export function validatePaidTransaction(transaction, intent, offer) {
  if (
    transaction?.id !== intent.transaction_id ||
    transaction?.status !== "completed" ||
    transaction?.currency_code !== "USD" ||
    transaction?.custom_data?.etmam_intent !== intent.id ||
    !Array.isArray(transaction.items) ||
    transaction.items.length !== 1 ||
    transaction.items[0]?.price?.id !== offer.priceId ||
    transaction.items[0]?.quantity !== 1 ||
    transaction.items[0]?.price?.unit_price?.currency_code !== "USD" ||
    Number(transaction.items[0]?.price?.unit_price?.amount) !== offer.usdCents
  )
    throw Error("payment_mismatch");
  const recurring = transaction.items[0].price.billing_cycle;
  if (offer.kind === "subscription") {
    if (
      recurring?.interval !== offer.interval ||
      recurring?.frequency !== 1 ||
      !/^sub_[a-z0-9]{26}$/.test(transaction.subscription_id)
    )
      throw Error("payment_mismatch");
  } else if (recurring) throw Error("payment_mismatch");
  return true;
}
