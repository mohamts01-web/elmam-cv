import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  dualPrice,
  validatePaddleCatalog,
  verifyPaddleSignature,
  validatePaidTransaction,
} from "../shared/paddle.mjs";
import {purchasedPriceId,checkedPurchase} from '../shared/paddle-upgrade.mjs';
import {BILLING_OFFERS} from '../shared/billing-offers.mjs';

test('approved topup ladder rewards larger purchases and annual prices retain monthly allowances',()=>{
 const packs=BILLING_OFFERS.filter(x=>x.kind==='ai');let rate=0;
 for(const p of packs){assert.ok(p.aiOperations/p.sarTarget>=rate);rate=p.aiOperations/p.sarTarget;}
 assert.equal(packs[0].sarTarget,10);assert.equal(packs.at(-1).aiOperations,600);
 for(const name of ['basic','plus']){const m=BILLING_OFFERS.find(x=>x.sku===name+'_month'),y=BILLING_OFFERS.find(x=>x.sku===name+'_year');assert.equal(y.aiOperations,m.aiOperations);assert.equal(y.sarTarget,m.sarTarget*10);}
});
test('upgrade permits only the owned prior-plan credit and the purchased plan',()=>{
 const tx={origin:'subscription_update',items:[{price:{id:'new'},quantity:1},{price:{id:'old'},quantity:1}],details:{line_items:[{price_id:'new',totals:{total:'1040'}},{price_id:'old',totals:{total:'-507'}}]}};
 assert.equal(purchasedPriceId(tx),'new');assert.equal(checkedPurchase(tx,{priceId:'new'},{price_id:'old'}).items.length,1);
 assert.throws(()=>checkedPurchase(tx,{priceId:'new'},null));assert.throws(()=>checkedPurchase(tx,{priceId:'new'},{price_id:'other'}));
});
const offer = {
  sku: "monthly",
  title: "اشتراك شهري تجريبي",
  kind: "subscription",
  priceId: "pri_" + "a".repeat(26),
  usdCents: 1000,
  aiOperations: 8,
  drafts: 2,
  interval: "month",
};
test("Paddle catalog refuses free-form prices, duplicate SKUs and invalid grants", () => {
  assert.deepEqual(validatePaddleCatalog([offer]), [offer]);
  for (const bad of [
    { ...offer, usdCents: -1 },
    { ...offer, interval: "week" },
    { ...offer, drafts: 0 },
    { ...offer, priceId: "untrusted" },
  ])
    assert.throws(() => validatePaddleCatalog([bad]));
  assert.throws(() => validatePaddleCatalog([offer, offer]));
  assert.deepEqual(dualPrice(1000), { usd: "10.00", sar: "37.50", rate: 3.75 });
});
test("Paddle signature uses exact body, validates timestamp, supports rotation and rejects tampering", async () => {
  const raw = '{"event_id":"evt_test"}',
    ts = 1800000000,
    secret = "test-webhook-secret";
  const h = createHmac("sha256", secret)
    .update(ts + ":" + raw)
    .digest("hex");
  assert.equal(
    await verifyPaddleSignature(raw, `ts=${ts};h1=${h}`, secret, ts),
    true,
  );
  assert.equal(
    await verifyPaddleSignature(
      raw,
      `ts=${ts};h1=${"0".repeat(64)};h1=${h}`,
      secret,
      ts,
    ),
    true,
  );
  assert.equal(
    await verifyPaddleSignature(raw + " ", `ts=${ts};h1=${h}`, secret, ts),
    false,
  );
  assert.equal(
    await verifyPaddleSignature(raw, `ts=${ts};h1=${h}`, secret, ts + 6),
    false,
  );
  assert.equal(
    await verifyPaddleSignature(raw, `ts=${ts};h1=${h}`, "other", ts),
    false,
  );
});
test("granting a purchase requires trusted matching transaction, price, currency and checkout intent", () => {
  const intent = { id: "server-intent", transaction_id: "txn_test" };
  const tx = {
    id: "txn_test",
    status: "completed",
    currency_code: "USD",
    custom_data: { etmam_intent: intent.id },
    subscription_id: "sub_" + "b".repeat(26),
    items: [
      {
        quantity: 1,
        price: {
          id: offer.priceId,
          unit_price: { currency_code: "USD", amount: "1000" },
          billing_cycle: { interval: "month", frequency: 1 },
        },
      },
    ],
  };
  assert.equal(validatePaidTransaction(tx, intent, offer), true);
  for (const bad of [
    { ...tx, status: "paid" },
    { ...tx, custom_data: { etmam_intent: "other" } },
    { ...tx, currency_code: "SAR" },
    { ...tx, items: [{ ...tx.items[0], quantity: 2 }] },
  ])
    assert.throws(() => validatePaidTransaction(bad, intent, offer));
});
