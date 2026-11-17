import fs from "node:fs";
import { BILLING_OFFERS } from "../shared/billing-offers.mjs";
const mode = process.argv.includes("--live") ? "live" : "sandbox";
const key = fs
  .readFileSync(`E:/pas/PADDLE-ETMAM-${mode.toUpperCase()}.txt`, "utf8")
  .replace(/^\uFEFF/, "")
  .trim();
const base =
  mode === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
async function api(path, body) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json();
  if (!r.ok) throw Error("Paddle " + r.status + " " + j.error?.code);
  return j.data;
}
const products = await api("/products?per_page=200");
const result = [];
for (const kind of ["subscription", "ai"]) {
  let p = products.find(
    (x) =>
      x.custom_data?.etmam_product === kind ||
      (mode === "live" &&
        kind === "subscription" &&
        x.id === "pro_01m6a0dvftrg7g2a08413y6ryn"),
  );
  if (!p)
    p = await api("/products", {
      name:
        kind === "subscription" ? "ETMAM CV membership" : "ETMAM CV AI credits",
      tax_category: "saas",
      description:
        kind === "subscription"
          ? "Arabic and English resume builder. Monthly AI allowance; shared web and Telegram access."
          : "Optional AI operation credits for ETMAM CV. Active membership required to use credits.",
      custom_data: { etmam_product: kind },
    });
  const prices = await api("/prices?product_id=" + p.id + "&per_page=200");
  for (const o of BILLING_OFFERS.filter((x) => x.kind === kind)) {
    let q = prices.find((x) => x.custom_data?.etmam_sku === o.sku);
    if (!q)
      q = await api("/prices", {
        product_id: p.id,
        description: o.sku,
        name: o.title,
        billing_cycle: o.interval
          ? { interval: o.interval, frequency: 1 }
          : null,
        unit_price: { amount: String(o.usdCents), currency_code: "USD" },
        tax_mode: "internal",
        quantity: { minimum: 1, maximum: 1 },
        custom_data: { etmam_sku: o.sku },
      });
    if (
      Number(q.unit_price.amount) !== o.usdCents ||
      q.unit_price.currency_code !== "USD"
    )
      throw Error("Existing price mismatch: " + o.sku);
    result.push({ ...o, priceId: q.id, productId: p.id });
  }
}
fs.writeFileSync(
  `private/paddle-${mode}-catalog.json`,
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    result.map(({ sku, priceId, sarTarget, usdCents }) => ({
      sku,
      priceId,
      sarTarget,
      usdCents,
    })),
  ),
);
