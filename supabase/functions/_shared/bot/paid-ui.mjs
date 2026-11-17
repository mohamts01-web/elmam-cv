import {createSession,get} from './conversation.mjs';
const b=(text,callback_data)=>({text,callback_data}),home=()=>b('القائمة الرئيسية','m:home');
const date=time=>new Date(time).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'medium'});
export function planText(a){
 if(!a||a.mode!=='paid')return 'باقة إلمام CV للسيرة الذاتية — 25 ريالًا\nمدة التحرير والذكاء الاصطناعي: 3 أشهر من تفعيل الكود.\nحتى مسودتين محفوظتين، و10 عمليات تحسين أو ترجمة ناجحة.\nبعد الانتهاء تبقى المسودات للعرض والنسخ المعتمدة للتنزيل.';
 return 'نوع الخدمة: مدفوعة\nالحالة: '+(a.active?'فعّالة':'انتهت مدة التحرير')+'\nتاريخ الانتهاء: '+date(a.expires)+'\nالمسودات: حتى '+a.maxDrafts+'\nرصيد الذكاء الاصطناعي المتبقي: '+a.aiRemaining+'\n\n'+(a.active?'يمكنك إنشاء المسودات وتعديلها وتنزيلها.':'يمكنك عرض مسوداتك وتنزيل النسخ المعتمدة. فعّل كودًا جديدًا لاستئناف التحرير والذكاء الاصطناعي.');
}
export function createPaidUI({paid,sessions,accessFor,sendMessage,sendDocument,renderPdf,show,mainMenuFor}){
 async function showPlan(id){const a=await accessFor(id);await sendMessage(id,planText(a),{inline_keyboard:[[b('تفعيل كود شراء أو تجديد','p:activate')],...(a.mode==='paid'?[[b('مسوداتي','p:drafts')]]:[]),[home()]]});}
 async function showDrafts(id){
  const a=await accessFor(id);if(a.mode!=='paid')return showPlan(id);
  const drafts=await paid.listDrafts(id),rows=drafts.map((d,i)=>[b((i+1)+'. '+d.label,'p:open:'+d.id),b('حذف','p:delete:'+d.id)]);
  if(a.active&&drafts.length<a.maxDrafts)rows.push([b('إنشاء مسودة جديدة ('+drafts.length+'/'+a.maxDrafts+')','m:new')]);
  rows.push([b('باقتي ورصيدي','p:plan')],[home()]);
  await sendMessage(id,'مسوداتك المحفوظة ('+drafts.length+'/'+a.maxDrafts+')\n'+(a.active?'اختر مسودة لمتابعتها.':'اختر مسودة لعرضها أو تنزيل نسختها المعتمدة.'),{inline_keyboard:rows});
 }
 async function showReadOnly(id,s,page=0){
  const fields=(s.steps||[]).filter(q=>q.path&&get(s.data,q.path)).map(q=>({label:q.label,value:s.listDraft?.field===q.path?s.listDraft.items:get(s.data,q.path)}));
  page=Math.max(0,Math.min(fields.length-1,page));const f=fields[page],value=f?Array.isArray(f.value)?f.value.join('\n'):String(f.value):'لا توجد بيانات مكتملة في المسودة.';
  const rows=[],nav=[];if(page>0)nav.push(b('السابق','p:view:'+s.id+':'+(page-1)));if(page+1<fields.length)nav.push(b('التالي','p:view:'+s.id+':'+(page+1)));if(nav.length)rows.push(nav);
  rows.push([b('تحميل النسخة المعتمدة PDF','p:download:'+s.id)],[b('مسوداتي','p:drafts')],[b('تجديد الخدمة بكود','p:activate')],[home()]);
  await sendMessage(id,'عرض المسودة — انتهت مدة التحرير\n\n'+(f?f.label+'\n\n':'')+value.slice(0,2700),{inline_keyboard:rows});
 }
 async function download(id,draftId){await sendDocument(id,await renderPdf(await paid.approvedData(id,draftId)),'ETMAM-CV.pdf');await sendMessage(id,'هذه النسخة المعتمدة المحفوظة من سيرتك.',{inline_keyboard:[[b('مسوداتي','p:drafts')],[home()]]});}
 async function handle({id,s,text,cb}){
  const key=cb?.data?.startsWith('p:')?cb.data.slice(2):null;
  if(key==='activate'){
   s??=createSession();s.activationPrompt=true;delete s.feedbackDraft;await sessions.set(id,s);
   await sendMessage(id,'أرسل كود الشراء الذي استلمته من زد.\nسيُربط الكود بحساب تيليجرام هذا، وتبدأ مدة 3 أشهر عند أول تفعيل.',{inline_keyboard:[[b('إلغاء','p:cancel')],[home()]]});return true;
  }
  if(key==='cancel'){if(s){delete s.activationPrompt;await sessions.set(id,s);}await mainMenuFor(id,s);return true;}
  if(s?.activationPrompt&&!cb&&!text.startsWith('/')&&text!=='القائمة الرئيسية'){
   try{
    const a=await paid.redeem(id,text);delete s.activationPrompt;await sessions.set(id,s);
    await sendMessage(id,a.alreadyActivated?'هذا الكود مفعّل لحسابك بالفعل. لم تتغير مدة الباقة.':'تم تفعيل الباقة المدفوعة ✅');
    await showPlan(id);
   }catch(e){await sendMessage(id,e.message,{inline_keyboard:[[b('المحاولة بكود آخر','p:activate')],[home()]]});}
   return true;
  }
  if(!key)return false;
  try{
   if(key==='plan'){await showPlan(id);return true;}
   if(key==='drafts'){await showDrafts(id);return true;}
   const a=await accessFor(id);
   if(a.mode!=='paid'){await showPlan(id);return true;}
   if(key.startsWith('open:')||key.startsWith('view:')){
    const parts=key.split(':'),opened=await paid.openDraft(id,parts[1]);
    if(a.active)await show(id,opened);else await showReadOnly(id,opened,Number(parts[2])||0);return true;
   }
   if(key.startsWith('download:')){await download(id,key.slice(9));return true;}
   if(key.startsWith('delete:')){
    const draftId=key.slice(7);if(!(await paid.listDrafts(id)).some(d=>d.id===draftId))throw Error('المسودة غير متاحة.');
    await sendMessage(id,'هل تريد حذف هذه المسودة نهائيًا؟',{inline_keyboard:[[b('حذف المسودة','p:confirm-delete:'+draftId)],[b('إلغاء','p:drafts')]]});return true;
   }
   if(key.startsWith('confirm-delete:')){await paid.removeDraft(id,key.slice(15));await showDrafts(id);return true;}
  }catch(e){await sendMessage(id,e.message,{inline_keyboard:[[b('مسوداتي','p:drafts')],[b('باقتي','p:plan')],[home()]]});return true;}
  return false;
 }
 return {handle,showPlan,showDrafts,showReadOnly,download};
}
