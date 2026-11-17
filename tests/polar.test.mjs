import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPolarWebhook,polarCheckoutRequest} from '../shared/polar.mjs';
const now=Date.now();
const raw=JSON.stringify({type:'order.paid',data:{id:crypto.randomUUID()}});
const secretBytes=crypto.getRandomValues(new Uint8Array(32));
const secret='whsec_'+Buffer.from(secretBytes).toString('base64');
async function signed(){
  const id='msg_'+crypto.randomUUID();
  const timestamp=String(Math.floor(now/1000));
  const key=await crypto.subtle.importKey('raw',secretBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${id}.${timestamp}.${raw}`))).toString('base64');
  return new Headers({'webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':'v1,'+sig});
}
test('Polar signed webhook accepts exact bytes and supports signature rotation',async()=>{
  const h=await signed();
  assert.equal(await verifyPolarWebhook(raw,h,secret,now),true);
  h.set('webhook-signature','v1,'+Buffer.alloc(32).toString('base64')+' '+h.get('webhook-signature'));
  assert.equal(await verifyPolarWebhook(raw,h,secret,now),true);
});
test('Polar webhook rejects payload/header tampering and replay outside time window',async()=>{
  const h=await signed();
  assert.equal(await verifyPolarWebhook(raw+' ',h,secret,now),false);
  assert.equal(await verifyPolarWebhook(raw,h,secret,now+301000),false);
  assert.equal(await verifyPolarWebhook(raw,h,secret,now-301000),false);
  h.set('webhook-id','other_message');
  assert.equal(await verifyPolarWebhook(raw,h,secret,now),false);
});
test('Polar webhook rejects malformed signatures/secrets and oversized bodies',async()=>{
  const h=await signed();
  assert.equal(await verifyPolarWebhook(raw,h,'whsec_bad!',now),false);
  assert.equal(await verifyPolarWebhook('x'.repeat(1000001),h,secret,now),false);
  h.set('webhook-signature','v2,invalid');
  assert.equal(await verifyPolarWebhook(raw,h,secret,now),false);
});
test('Polar checkout ties identity and product to server intent with fixed return URLs',()=>{
  const args={accountId:crypto.randomUUID(),intentId:crypto.randomUUID(),productId:crypto.randomUUID(),email:'test@example.com',siteOrigin:'https://etmam-cv.netlify.app'};
  const r=polarCheckoutRequest(args);
  assert.equal(r.external_customer_id,args.accountId);
  assert.equal(r.metadata.etmam_intent_id,args.intentId);
  assert.deepEqual(r.products,[args.productId]);
  assert.equal(r.allow_trial,false);
  assert.equal(r.currency,'usd');
  assert.equal(polarCheckoutRequest({...args,currency:'sar'}).currency,'sar');
  assert.throws(()=>polarCheckoutRequest({...args,siteOrigin:'http://evil.example'}));
  assert.throws(()=>polarCheckoutRequest({...args,accountId:'user-supplied-alias'}));
  assert.throws(()=>polarCheckoutRequest({...args,currency:'eur'}));
});
