import test from "node:test";
import assert from "node:assert/strict";
import { starterOffer, whopClient } from "../supabase/functions/_shared/whop.mjs";

const intentId = "c1b0d1d0-c1b0-41d0-81b0-c1b0d1d0c1b0";
const configurationId = "ch_abc123";
const paymentId = "pay_abc123";
const config = { apiKey:"test", companyId:"biz_abc123", planId:"plan_abc123", returnUrl:"https://etmam-cv.netlify.app/plans" };
const paid = {
  id: paymentId, account_id: config.companyId, checkout_configuration_id: configurationId,
  status:"paid", substatus:"succeeded", currency:"sar", paid_at:"2026-11-10T10:00:00Z",
  metadata:{etmam_intent_id:intentId,etmam_offer:starterOffer.sku},
  subtotal:{amount:"7.83",currency:"sar"},total:{amount:"9.00",currency:"sar"},
  line_items:[{variant_id:config.planId,quantity:1}],
};

test("live checkout only accepts the production API and checkout hosts", async () => {
  const checkout = {
    id: configurationId,
    account_id: config.companyId,
    mode: "payment",
    purchase_url: "https://whop.com/checkout/" + configurationId,
    variant: { id: config.planId, billing_type: "one_time", currency: "sar", initial_price: 10, expiration_days: 30 },
  };
  const live = whopClient({ ...config, environment: "live" }, async (url) => {
    assert.equal(url, "https://api.whop.com/api/v1/checkout_configurations");
    return Response.json(checkout);
  });
  assert.equal((await live.createCheckout(intentId)).url, checkout.purchase_url);
  const wrongHost = whopClient({ ...config, environment: "live" }, async () =>
    Response.json({ ...checkout, purchase_url: "https://sandbox.whop.com/checkout/" + configurationId }));
  await assert.rejects(wrongHost.createCheckout(intentId), /whop_checkout/);
  const stalePrice = whopClient({ ...config, environment: "live" }, async () =>
    Response.json({ ...checkout, variant: { ...checkout.variant, initial_price: 9 } }));
  await assert.rejects(stalePrice.createCheckout(intentId), /whop_checkout/);
});

test("live settlement accepts a total of 10 SAR and rejects additional tax on top", async () => {
  const paymentFor = (amount) => whopClient({ ...config, environment: "live" }, async (url) => {
    assert.equal(url, "https://api.whop.com/api/v1/payments/" + paymentId);
    return Response.json({ ...paid, total: { amount, currency: "sar" } });
  });
  const findIntent = () => intentId;
  assert.equal((await paymentFor("10.00").reconcilePaid(paymentId, findIntent)).environment, "live");
  await assert.rejects(paymentFor("9.00").reconcilePaid(paymentId, findIntent), /whop_payment_mismatch/);
  await assert.rejects(paymentFor("11.50").reconcilePaid(paymentId, findIntent), /whop_payment_mismatch/);
});

test("checkout uses only the sandbox API and returns a sandbox URL", async () => {
  const checkout = {
    id:configurationId, account_id:config.companyId, mode:"payment",
    purchase_url:"https://sandbox.whop.com/checkout/"+configurationId,
    variant:{id:config.planId,billing_type:"one_time",currency:"sar",initial_price:9,expiration_days:30},
  };
  const sandbox=whopClient(config,async (url,options)=>{
    assert.equal(url,"https://sandbox-api.whop.com/api/v1/checkout_configurations");
    assert.equal(options.headers["Idempotency-Key"],intentId);
    assert.equal(options.headers["Api-Version-Date"],"2026-11-07");
    const body=JSON.parse(options.body);
    assert.deepEqual(body.metadata,paid.metadata);
    assert.equal(body.account_id,config.companyId);
    assert.equal(body.variant_id,config.planId);
    return Response.json(checkout);
  });
  assert.equal((await sandbox.createCheckout(intentId)).configurationId,configurationId);
  for (const changes of [
    {purchase_url:"https://whop.com/checkout/"+configurationId},
    {account_id:"biz_wrong"},
    {variant:{...checkout.variant,billing_type:"renewal"}},
    {variant:{...checkout.variant,initial_price:19}},
  ]) {
    const wrong=whopClient(config,async()=>Response.json({...checkout,...changes}));
    await assert.rejects(wrong.createCheckout(intentId),/whop_checkout/);
  }
});

test("verification rejects the wrong amount, company, plan, session, intent and refund", async () => {
  const provider=data=>whopClient(config,async url=>{
    assert.equal(url,"https://sandbox-api.whop.com/api/v1/payments/"+paymentId);
    return Response.json(data);
  });
  const findIntent = (id) => id === configurationId ? intentId : null;
  assert.equal((await provider(paid).reconcilePaid(paymentId,findIntent)).environment,"sandbox");
  await assert.rejects(provider(paid).reconcilePaid(paymentId,()=>null),/whop_payment_mismatch/);
  await assert.rejects(provider(paid).reconcilePaid(paymentId,()=>"b2b0d1d0-c1b0-41d0-81b0-c1b0d1d0c1b0"),/whop_payment_mismatch/);
  const converted = {...paid,currency:"usd",total:{amount:"2.40",currency:"usd"},presentment_total:paid.total};
  assert.equal((await provider(converted).reconcilePaid(paymentId,findIntent)).paymentId,paymentId);
  for(const changes of [
    {total:{amount:"9.00",currency:"usd"}},{total:{amount:"1.00",currency:"sar"}},
    {presentment_total:{amount:"9.00",currency:"usd"}},
    {total:{amount:"10.35",currency:"sar"}},
    {account_id:"biz_wrong"},{checkout_configuration_id:"ch_wrong"},
    {metadata:{...paid.metadata,etmam_intent_id:"other"}},
    {line_items:[{variant_id:"plan_wrong",quantity:1}]},
    {substatus:"refunded"},{substatus:"partially_refunded"},{auto_refunded:true},
    {refunded_at:"2026-11-10T11:00:00Z"},{status:"pending"},
  ])await assert.rejects(provider({...paid,...changes}).reconcilePaid(paymentId,findIntent),/whop_payment_mismatch/);
});
