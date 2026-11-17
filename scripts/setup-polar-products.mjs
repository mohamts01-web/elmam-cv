import fs from 'node:fs';
import { BILLING_OFFERS } from '../shared/billing-offers.mjs';

// Deliberately creates DRAFT products. No live checkout is enabled by this script.
const organizationId = 'eceea63c-dffd-45f8-81a4-a22b35aa1493';
const key = fs.readFileSync('E:/pas/POLAR-ETMAM-LIVE.txt','utf8').trim();
if (!key.startsWith('polar_oat_')) throw Error('Invalid private organization token');
async function api(path, body) {
  const r = await fetch('https://api.polar.sh/v1'+path, {
    method:body?'POST':'GET',
    headers:{Authorization:'Bearer '+key,'Polar-Version':'2026-10','Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}), signal:AbortSignal.timeout(25000),
  });
  const j=await r.json();
  if(!r.ok) {
    fs.writeFileSync('private/polar-setup-error.json',JSON.stringify({status:r.status,path,detail:j.detail},null,2));
    throw Error('Polar request failed: '+r.status+'; inspect private error report');
  }
  return j;
}
const org=await api('/organizations/'+organizationId);
if(org.id!==organizationId || org.slug!=='qalva') throw Error('Wrong organization');
const existing=[];
for(let page=1;;page++){
  const result=await api('/products/?limit=100&page='+page);
  existing.push(...result.items);
  if(page >= result.pagination.max_page) break;
  if(page >= 20) throw Error('Unexpected product pagination');
}
const catalog=[];
for(const o of BILLING_OFFERS){
  const matches=existing.filter(p=>p.metadata?.etmam_sku===o.sku && p.metadata?.etmam_app==='cv');
  if(matches.length>1) throw Error('Duplicate SKU '+o.sku);
  const description = o.kind==='subscription'
    ? `اشتراك إتمام للسير الذاتية بالعربية والإنجليزية. حتى ${o.drafts} مسودات و${o.aiOperations} عمليات ذكاء اصطناعي ناجحة شهريًا للتحسين والترجمة والاستيراد. ${o.interval==='year'?'فوترة سنوية وتجدد الحصة شهريًا دون تراكم.':'فوترة شهرية متجددة.'} مقترحات الذكاء الاصطناعي قابلة للمراجعة ولا تختلق خبرات. بعد الانتهاء تبقى المشاهدة وتنزيل النسخ المعتمدة. السعر الإرشادي ${o.sarTarget} ريال؛ التحصيل ${(o.usdCents/100).toFixed(2)} دولار، مع بيان الإجمالي في صفحة الدفع. الدعم: cvsira.sa@gmail.com.`
    : `إضافة ${o.aiOperations} عمليات ذكاء اصطناعي ناجحة لرصيد إتمام. الرصيد الإضافي لا ينتهي، ويتطلب اشتراكًا فعالًا لاستخدامه. الطلب الفاشل لا يخصم عملية. لا تزيد هذه الحزمة حد المسودات ولا تمنح اشتراكًا. السعر الإرشادي ${o.sarTarget} ريال؛ التحصيل ${(o.usdCents/100).toFixed(2)} دولار. الدعم: cvsira.sa@gmail.com.`;
  const p=matches[0] || await api('/products/',{
    name:o.title+(o.interval==='month'?' — شهري':o.interval==='year'?' — سنوي':''),
    description,visibility:'draft',
    recurring_interval:o.interval, ...(o.interval?{recurring_interval_count:1}:{}),
    prices:[
      {amount_type:'fixed',price_amount:o.sarTarget*100,price_currency:'sar',tax_behavior:'inclusive'},
      {amount_type:'fixed',price_amount:o.usdCents,price_currency:'usd',tax_behavior:'inclusive'},
    ],
    metadata:{etmam_app:'cv',etmam_sku:o.sku,ai_operations:o.aiOperations,max_drafts:o.drafts,sar_target:o.sarTarget},
  });
  const price=p.prices.find(x=>x.amount_type==='fixed' && x.price_currency==='usd' && !x.is_archived);
  const sarPrice=p.prices.find(x=>x.amount_type==='fixed' && x.price_currency==='sar' && !x.is_archived);
  if(p.organization_id!==organizationId || p.visibility!=='draft' || p.is_archived ||
     p.recurring_interval!==o.interval || price?.price_amount!==o.usdCents || sarPrice?.price_amount!==o.sarTarget*100)
    throw Error('Existing product differs from approved draft offer: '+o.sku);
  catalog.push({...o,productId:p.id,priceId:price.id,sarPriceId:sarPrice.id,visibility:p.visibility});
  fs.writeFileSync('private/polar-live-catalog.json',JSON.stringify(catalog,null,2));
  console.log(o.sku+': draft verified');
}
fs.writeFileSync('private/polar-setup-status.json',JSON.stringify({organizationId,apiVersion:'2026-10',productCount:catalog.length,organizationStatus:org.status,capabilities:org.capabilities,liveReady:false,preparedAt:new Date().toISOString()},null,2));
console.log('Draft catalog prepared; live payments remain disabled.');
