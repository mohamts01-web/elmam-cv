// Polar API 2026-10. This module does not grant access or alter balances.
export const POLAR_API_VERSION = '2026-10';
const encoder = new TextEncoder();
const bytes = s => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
export async function verifyPolarWebhook(raw, headers, secret, now=Date.now()) {
  const id=headers.get('webhook-id') || '';
  const stamp=headers.get('webhook-timestamp') || '';
  const signatures=headers.get('webhook-signature') || '';
  if(typeof raw!=='string' || encoder.encode(raw).length>1000000 ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(id) || !/^\d{10,12}$/.test(stamp) ||
    Math.abs(now/1000-Number(stamp))>300 || signatures.length>2000 ||
    !secret?.startsWith('whsec_')) return false;
  // New secrets (after 2026-09-08) follow the Standard Webhooks specification.
  try {
    const key=await crypto.subtle.importKey('raw',bytes(secret.slice(6)),
      {name:'HMAC',hash:'SHA-256'},false,['verify']);
    const content=encoder.encode(`${id}.${stamp}.${raw}`);
    for(const part of signatures.split(/\s+/)) {
      const [version,signature]=part.split(',');
      if(version==='v1' && signature &&
        await crypto.subtle.verify('HMAC',key,bytes(signature),content)) return true;
    }
  } catch { return false; }
  return false;
}

export function polarCheckoutRequest({accountId,intentId,productId,email,currency='usd',siteOrigin}) {
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if(![accountId,intentId,productId].every(x=>typeof x==='string'&&uuid.test(x)) ||
    !['usd','sar'].includes(currency) || typeof email!=='string' || !email.includes('@'))
    throw Error('invalid_checkout');
  const origin=new URL(siteOrigin);
  if(origin.protocol!=='https:' || origin.origin!==siteOrigin) throw Error('invalid_origin');
  // All arguments come from an authenticated server and server-owned product map.
  // A browser return is informational; a verified paid order must provision access.
  return {products:[productId],currency,locale:'ar',allow_trial:false,
    allow_discount_codes:false,customer_email:email,external_customer_id:accountId,
    metadata:{etmam_intent_id:intentId,etmam_account_id:accountId},
    success_url:siteOrigin+'/membership?polar=return&checkout_id={CHECKOUT_ID}',
    return_url:siteOrigin+'/plans'};
}
