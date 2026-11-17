// Upgrade transactions may include a negative credit for the prior price.
// Extract the purchased price from authoritative Paddle line totals, not client metadata.
export function purchasedPriceId(tx) {
  const lines = tx?.details?.line_items || [];
  const positive = [
    ...new Set(
      lines.filter((x) => Number(x.totals?.total) > 0).map((x) => x.price_id),
    ),
  ];
  if (positive.length === 1) return positive[0];
  if (tx?.items?.length === 1) return tx.items[0].price.id;
  throw Error("payment_mismatch");
}
export function checkedPurchase(tx, offer, known) {
  const purchased = tx.items.filter((x) => x.price?.id === offer.priceId);
  if (purchased.length !== 1) throw Error("payment_mismatch");
  if (tx.items.length > 1) {
    if (!known || tx.origin !== "subscription_update")
      throw Error("payment_mismatch");
    const ids = new Set([offer.priceId, known.price_id]);
    if (tx.items.some((x) => !ids.has(x.price?.id)))
      throw Error("payment_mismatch");
    for (const l of tx.details?.line_items || [])
      if (
        l.price_id !== offer.priceId &&
        (l.price_id !== known.price_id || Number(l.totals?.total) > 0)
      )
        throw Error("payment_mismatch");
  }
  return { ...tx, items: purchased };
}
