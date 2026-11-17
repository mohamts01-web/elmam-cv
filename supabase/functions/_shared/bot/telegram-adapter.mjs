import {createSession,current,answer,back,edit,confirm,resumeData,upgradeSession} from './conversation.mjs';
import {applyProposal} from './ai.mjs';
const randomUUID=()=>crypto.randomUUID();
import {COMMON_SKILLS,LANGUAGE_OPTIONS,LANGUAGE_LEVELS,normalized,skillValue,languageName} from './quick-options.mjs';
import {createPaidUI} from './paid-ui.mjs';
const button=(text,data)=>({text,callback_data:data});
const action=(s,text,command)=>button(text,'c:'+s.revision+':'+command);
export const SERVICE_TYPE='تجريبية';
export const SUPPORT_URL='https://t.me/mohamdto21';
const homeButton=()=>button('القائمة الرئيسية','m:home');
export function mainMenu(s,admin=false,access=null){
 const rows=[[button('إنشاء سيرة ذاتية','m:new')],[{text:'المحرر المتقدم على موقع إلمام CV',url:'https://cv.cvsira.com/'}]];if(access?.mode==='paid')rows.push([button('قالب السيرة','m:templates')]);
 if(s)rows.push([button('متابعة سيرتي الحالية','m:resume')]);
 if(access?.mode==='paid')rows.push([button('مسوداتي ('+access.maxDrafts+')','p:drafts')]);
 rows.push([button('تفعيل كود شراء','p:activate'),button('باقتي ورصيدي','p:plan')]);
 rows.push([button('عن الخدمة','m:about'),button('طريقة الاستخدام','m:guide')],[button('نوع الخدمة: '+(access?.mode==='paid'?'مدفوعة':SERVICE_TYPE),'m:type')],[button('رسائل واقتراحات','m:feedback')],[{text:'التواصل مع الدعم الفني',url:SUPPORT_URL}]);
 if(admin)rows.push([button('صندوق الوارد','m:inbox:0')]);
 return {text:'أهلًا بك في إلمام CV ✨\n\nنوع الخدمة: '+(access?.mode==='paid'?'مدفوعة'+(access.active?' — فعّالة':' — للعرض والتنزيل'):SERVICE_TYPE)+'\nأنشئ سيرتك الذاتية بالعربية أو الإنجليزية، خطوة بخطوة، ثم حمّلها بصيغة PDF.\n\nلتجربة أوسع: افتح موقع إلمام CV لمعاينة سيرتك مباشرة، ومقارنة اقتراحات المساعد، وتنسيقها بسهولة. مسوداتك وباقتك مشتركة بعد ربط الحساب.\n\nاختر ما تحتاجه من القائمة:',reply_markup:{inline_keyboard:rows}};
}
export function telegramReply(view,revision=0){
 const rows=view.choices?.length?view.choices.map(([value,label])=>[button(label,'a:'+view.id+':'+value)]):[];
 if(view.kind==='month'){
  const months=view.calendar==='hijri'?['محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة']:['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  for(let i=0;i<12;i+=3)rows.push(months.slice(i,i+3).map((label,j)=>button(label,'a:'+view.id+':'+(i+j+1))));
 }
 if(view.currentJob)rows.push([button('أعمل هنا حاليًا','a:'+view.id+':__current__')]);
 if(view.optional&&!view.choices?.length)rows.push([button('تخطي','a:'+view.id+':__skip__')]);
 if(view.progress>0||view.editing)rows.push([button('رجوع','c:'+revision+':back')]);
 rows.push([homeButton()]);
 return {text:view.label,reply_markup:rows.length?{inline_keyboard:rows}:undefined};
}
const displayValue=f=>{
 if(f.id==='language')return f.value==='ar'?'العربية':'الإنجليزية';
 const translations={graduated:'تخرجت',studying:'ما زلت أدرس',gregorian:'ميلادي',hijri:'هجري'};
 if(/\.(status|calendar)$/.test(f.id)&&translations[f.value])return translations[f.value];
 return Array.isArray(f.value)?f.value.join('\n'):String(f.value||'لم يُضف — يمكنك إضافته من زر التعديل');
};
const clip=text=>text.length>3000?text.slice(0,2950)+'\n… النص أطول؛ يمكنك مراجعته كاملًا عند التعديل أو في ملف السيرة.':text;
export function reviewCard(s,index=0){
 const view=current(s),fields=view.fields;
 index=Math.max(0,Math.min(fields.length,index));
 const f=fields[index-1];
 const text=index===0?'اكتملت الإجابات ✅\n\nالاسم: '+(s.data.name||'—')+'\nلغة السيرة: '+(s.data.language==='ar'?'العربية':'الإنجليزية')+'\n\nراجع إجاباتك واحدة تلو الأخرى، أو اختر «تخطي المراجعة واعتماد البيانات» إذا كانت جاهزة.':'مراجعة الإجابة '+index+' من '+fields.length+'\n\n'+f.label+'\n\n'+clip(displayValue(f))+(index===fields.length?'\n\nوصلت إلى نهاية المراجعة. إذا كانت البيانات صحيحة اضغط زر الاعتماد أدناه.':'');
 const rows=[],nav=[];
 if(index>0)nav.push(button('السابق','r:'+s.revision+':'+(index-1)));
 if(index<fields.length)nav.push(button(index===0?'بدء المراجعة':'التالي','r:'+s.revision+':'+(index+1)));
 if(nav.length)rows.push(nav);
 if(f)rows.push([button('تعديل هذه الإجابة','e:'+s.revision+':'+f.id)]);
 if(index===fields.length)rows.push([action(s,'إنهاء المراجعة واعتماد السيرة','confirm')]);
 else if(!view.confirmed)rows.push([action(s,'تخطي المراجعة واعتماد البيانات','confirm')]);
 if(view.confirmed)rows.push([action(s,'تحميل السيرة PDF','pdf')]);
 rows.push([homeButton()]);
 return {text,reply_markup:{inline_keyboard:rows}};
}
export function proposalCard(s,index=0){
 const p=s.proposal,items=p.rewrites;index=Math.max(0,Math.min(items.length-1,index));
 const item=items[index],original=p.facts.find(x=>x.id===item.id)?.text||'';
 const rows=[],nav=[];if(index>0)nav.push(button('السابق','ai:r:'+p.id+':'+(index-1)));if(index+1<items.length)nav.push(button('التالي','ai:r:'+p.id+':'+(index+1)));if(nav.length)rows.push(nav);
 if(index===items.length-1)rows.push([button('تطبيق بعد مراجعتي','ai:apply:'+p.id)]);
 rows.push([button('الاحتفاظ بالأصل','ai:discard:'+p.id)],[homeButton()]);
 return {text:'اقتراح '+(index+1)+' من '+items.length+'\n\nقبل:\n'+clip(original).slice(0,1400)+'\n\nالاقتراح:\n'+clip(item.text).slice(0,1400),reply_markup:{inline_keyboard:rows}};
}
function listCard(s){
 const q=current(s),draft=s.listDraft,items=draft.items;
 let text=items.length?'تمت الإضافة ✅\n\n'+q.label+'\n\nالمضاف حتى الآن ('+items.length+'):\n'+clip(items.map((x,i)=>(i+1)+'. '+x).join('\n'))+'\n\nيمكنك إضافة عنصر آخر أو الانتقال للخطوة التالية.':q.label;
 if(draft.awaiting&&items.length)text='اكتب الإضافة التالية في رسالة واحدة.\nستُضاف إلى القائمة الحالية.';
 const rows=[];
 if(q.id==='skills'){
  for(let i=0;i<COMMON_SKILLS.length;i+=2)rows.push(COMMON_SKILLS.slice(i,i+2).map(([label],j)=>{
   const index=i+j,selected=items.some(x=>normalized(x)===normalized(skillValue(s,index)));
   return button((selected?'✓ ':'')+label,'q:'+s.revision+':skill:'+index);
  }));
 }
 if(q.id==='languages'){
  if(draft.languagePending){
   text='ما مستواك في '+draft.languagePending.label+'؟';
   for(const [code,label]of LANGUAGE_LEVELS)rows.push([button(label,'q:'+s.revision+':level:'+code)]);
   rows.push([button('اختيار لغة أخرى','q:'+s.revision+':cancel:language')],[homeButton()]);
   return {text,reply_markup:{inline_keyboard:rows}};
  }
  rows.push(Object.entries(LANGUAGE_OPTIONS).map(([code,[label]])=>button(label,'q:'+s.revision+':language:'+code)));
 }
 if(items.length){
  rows.push([button('إضافة أخرى','l:'+s.revision+':add'),button('انتهيت، متابعة','l:'+s.revision+':done')]);
  rows.push([button('حذف آخر إضافة','l:'+s.revision+':remove')]);
 }else if(q.optional)rows.push([button('تخطي','l:'+s.revision+':done')]);
 rows.push([action(s,'رجوع','back')]);
 rows.push([homeButton()]);
 return {text,reply_markup:{inline_keyboard:rows}};
}
export function createTelegramHandler({sessions,seen,entitled,accessFor,paid,isAdmin=async()=>false,saveFeedback,listFeedback,sendMessage,editMessage,sendDocument,renderPdf,improve,translate,reserveAI,finishAI}){
 if(!entitled)throw Error('entitlement_provider_required');
 const rightsFor=accessFor||async function(id){const allowed=await entitled(id);return {mode:allowed?'trial':'none',active:allowed,readable:allowed};};
 let paidUi;
 async function show(id,s){
  const rights=await rightsFor(id);if(paidUi&&rights.mode==='paid'&&!rights.active)return paidUi.showReadOnly(id,s);
  const q=current(s);let r;
  if(q.stage==='review'){delete s.listDraft;r=reviewCard(s);}
  else if(q.kind==='lines'){
   if(s.listDraft?.field!==q.id)s.listDraft={field:q.id,items:q.editing&&Array.isArray(q.value)?[...q.value]:[],awaiting:!q.editing};
   r=listCard(s);
  }else{delete s.listDraft;r=telegramReply(q,s.revision);}
  await sessions.set(id,s);await sendMessage(id,r.text,r.reply_markup);
 }
 if(paid)paidUi=createPaidUI({paid,sessions,accessFor:rightsFor,sendMessage,sendDocument,renderPdf,show,mainMenuFor:async(id,s)=>{const r=mainMenu(s,await isAdmin(id),await rightsFor(id));await sendMessage(id,r.text,r.reply_markup);}});
 return async function handle(update){
  const cb=update.callback_query,m=cb?.message||update.message,from=cb?.from||m?.from;
  if(!m||m.chat?.type!=='private'||String(m.chat.id)!==String(from?.id)||!Number.isSafeInteger(update.update_id))return {ignored:true};
  if(await seen.has(update.update_id))return {duplicate:true};
  const id=String(from.id);
  const admin=await isAdmin(id);
  const access=await rightsFor(id);
  let s=upgradeSession(await sessions.get(id)),text=m.text||'';
  const menu=cb?.data?.startsWith('m:')?cb.data.slice(2):text==='/start'||text==='/menu'||text==='القائمة الرئيسية'?'home':text==='متابعة سيرتي الحالية'?'resume':text==='/help'?'guide':null;
  if(paidUi&&await paidUi.handle({id,s,text,cb})){await seen.add(update.update_id);return {paid_action:true};}
  if(menu){
   if(menu==='home'){
    if(s){delete s.activationPrompt;await sessions.set(id,s);}
    if(text==='/start')await sendMessage(id,'مرحبًا بك في إلمام CV ✨\nيمكنك العودة إلى القائمة في أي وقت من الزر أسفل المحادثة.',{keyboard:[[{text:'القائمة الرئيسية'}]],resize_keyboard:true,is_persistent:true});
    const r=mainMenu(s,admin,access);await sendMessage(id,r.text,r.reply_markup);await seen.add(update.update_id);return {menu:true};
   }
   if(menu==='feedback'){
    await sendMessage(id,'ماذا تريد إرسالَه إلى فريق إلمام CV؟',{inline_keyboard:[[button('رسالة','m:feedback:message'),button('اقتراح','m:feedback:suggestion')],[homeButton()]]});await seen.add(update.update_id);return {feedback_menu:true};
   }
   if(menu==='feedback:message'||menu==='feedback:suggestion'){
    s??=createSession();delete s.activationPrompt;s.feedbackDraft={kind:menu.endsWith('suggestion')?'suggestion':'message',nonce:randomUUID()};
    await sessions.set(id,s);await sendMessage(id,'اكتب '+(s.feedbackDraft.kind==='suggestion'?'اقتراحك':'رسالتك')+' في رسالة واحدة. ستراجعها قبل إرسالها إلى فريق إلمام CV.\nتُحفظ الرسائل لدى الدعم لمدة 30 يومًا.',{inline_keyboard:[[button('إلغاء','m:feedback:cancel')],[homeButton()]]});await seen.add(update.update_id);return {feedback_composing:true};
   }
   if(menu==='feedback:cancel'){
    if(s){delete s.feedbackDraft;await sessions.set(id,s);}const r=mainMenu(s,admin,access);await sendMessage(id,'أُلغي إرسال الرسالة. يمكنك متابعة سيرتك.',r.reply_markup);await seen.add(update.update_id);return {feedback_cancelled:true};
   }
   if(menu.startsWith('feedback:send:')){
    if(!s?.feedbackDraft?.body||menu!=='feedback:send:'+s.feedbackDraft.nonce){await sendMessage(id,'هذه الرسالة غير جاهزة للإرسال. افتح «رسائل واقتراحات» من القائمة.',{inline_keyboard:[[homeButton()]]});return {stale_feedback:true};}
    try{
     if(!saveFeedback)throw Error('الصندوق غير متاح حاليًا. يمكنك التواصل مباشرة مع الدعم.');
     const receipt=await saveFeedback(id,{id:s.feedbackDraft.nonce,kind:s.feedbackDraft.kind,text:s.feedbackDraft.body,username:from.username||null});
     delete s.feedbackDraft;await sessions.set(id,s);await seen.add(update.update_id);
     await sendMessage(id,'تم إرسال رسالتك إلى صندوق إلمام CV ✅\nرقم الرسالة: '+receipt.slice(0,8),{inline_keyboard:[[homeButton()],[{text:'التواصل مع الدعم الفني',url:SUPPORT_URL}]]});return {feedback_sent:true};
    }catch(e){await sendMessage(id,/^[\u0600-\u06ff]/.test(e.message)?e.message:'تعذّر حفظ الرسالة الآن. جرّب لاحقًا.',{inline_keyboard:[[homeButton()],[{text:'التواصل مع الدعم الفني',url:SUPPORT_URL}]]});return {feedback_error:true};}
   }
   if(menu.startsWith('inbox:')){
    if(!admin||!listFeedback){await sendMessage(id,'صندوق الوارد متاح لإدارة إلمام CV فقط.',{inline_keyboard:[[homeButton()]]});return {admin_required:true};}
    const page=Math.max(0,Math.floor(Number(menu.slice(6))||0)),result=await listFeedback(page),item=result.item,rows=[];
    if(page>0)rows.push([button('الأحدث','m:inbox:'+(page-1))]);if(page+1<result.total)rows.push([button('الأقدم','m:inbox:'+(page+1))]);rows.push([homeButton()]);
    const info=item?'صندوق الوارد — '+(page+1)+' من '+result.total+'\n'+(item.kind==='suggestion'?'اقتراح':'رسالة')+' | '+new Date(item.created).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'})+'\n'+(item.username?'@'+item.username+'\n':'')+'\n'+item.text:'صندوق الوارد فارغ حاليًا.';
    await sendMessage(id,info,{inline_keyboard:rows});await seen.add(update.update_id);return {inbox:true};
   }
   if(['about','guide','type'].includes(menu)){
    if(menu==='type'&&paidUi&&access.mode==='paid'){await paidUi.showPlan(id);await seen.add(update.update_id);return {plan:true};}
    const info=menu==='about'?'عن إلمام CV ✨\nنساعدك في إنشاء سيرة ذاتية بالعربية أو الإنجليزية بأسئلة تناسب حالتك المهنية، وتحسين الصياغة بعد موافقتك، ثم تنزيل PDF.\nلا نختلق خبرات أو مؤهلات.':menu==='guide'?'طريقة الاستخدام 📄\n١. اختر «إنشاء سيرة ذاتية» أو تابع سيرتك الحالية.\n٢. أجب عن سؤال واحد في كل خطوة، وأضف المهارات والدورات واحدة تلو الأخرى.\n٣. راجع الإجابات، أو تخطَّ المراجعة واعتمد بياناتك.\n٤. اضغط «تحميل السيرة PDF».\n\nيمكنك الرجوع للقائمة دون فقدان مسودتك. '+(access.mode==='paid'?'مسودات الباقة المدفوعة محفوظة، وبعد انتهاء المدة تبقى للعرض وتنزيل النسخ المعتمدة.':'مسودة التجربة مؤقتة لمدة 24 ساعة.'):'نوع الخدمة: '+SERVICE_TYPE+'\nالخدمة في مرحلة التجربة حاليًا. هذا الوصف لا يعني وجود اشتراك مدفوع أو تفعيل شراء.';
    await sendMessage(id,info,{inline_keyboard:[[homeButton()],[{text:'التواصل مع الدعم الفني',url:SUPPORT_URL}]]});await seen.add(update.update_id);return {information:true};
   }
   if(!await entitled(id)){await sendMessage(id,'إنشاء السير متاح حاليًا لحساب التجربة فقط. يمكنك الاطلاع على الخدمة أو التواصل مع الدعم.',{inline_keyboard:[[homeButton()],[{text:'التواصل مع الدعم الفني',url:SUPPORT_URL}]]});await seen.add(update.update_id);return {activation_required:true};}
   if(menu==='resume'){
    if(s){delete s.feedbackDraft;delete s.activationPrompt;}
    if(paidUi&&access.mode==='paid'&&!access.activeDraft){await paidUi.showDrafts(id);await seen.add(update.update_id);return {draft_picker:true};}
    if(s)await show(id,s);else{const r=mainMenu(s);await sendMessage(id,'لا توجد مسودة حالية. اختر «إنشاء سيرة ذاتية» للبدء.',r.reply_markup);}
    await seen.add(update.update_id);return {resumed:!!s};
   }
   if(menu==='new'&&paid&&access.mode==='paid'){
    try{s=await paid.createDraft(id,createSession());await show(id,s);}catch(e){await sendMessage(id,e.message,{inline_keyboard:[[button('مسوداتي','p:drafts')],[button('باقتي','p:plan')],[homeButton()]]});}
    await seen.add(update.update_id);return {paid_draft:true};
   }
   if(menu==='new'&&s?.profile){
    await sendMessage(id,'لديك مسودة حالية. إنشاء سيرة جديدة سيستبدلها.\nهل تريد بدء سيرة جديدة أم متابعة الحالية؟',{inline_keyboard:[[button('بدء سيرة جديدة بدل الحالية','m:replace:'+s.id+':'+s.revision)],[button('متابعة سيرتي الحالية','m:resume')],[homeButton()]]});await seen.add(update.update_id);return {replace_requested:true};
   }
   if(menu==='new'||s&&menu==='replace:'+s.id+':'+s.revision){
    s=createSession();await show(id,s);await seen.add(update.update_id);return {started:true};
   }
   await sendMessage(id,'هذه القائمة قديمة. افتح القائمة الرئيسية للمتابعة.',{inline_keyboard:[[homeButton()]]});await seen.add(update.update_id);return {stale_menu:true};
  }
  if(s?.feedbackDraft&&!cb&&!text.startsWith('/')){
   if(!text.trim()||text.length>1800){await sendMessage(id,'اكتب رسالة نصية لا تتجاوز 1800 حرف.');return {feedback_invalid:true};}
   s.feedbackDraft.body=text.trim();s.feedbackDraft.nonce=randomUUID();await sessions.set(id,s);
   await sendMessage(id,'راجع الرسالة قبل إرسالها:\n\n'+s.feedbackDraft.body,{inline_keyboard:[[button('إرسال إلى إلمام CV','m:feedback:send:'+s.feedbackDraft.nonce)],[button('إلغاء','m:feedback:cancel')]]});await seen.add(update.update_id);return {feedback_preview:true};
  }
  if(!await entitled(id)){await sendMessage(id,'فعّل كود الشراء للاستفادة من الباقة المدفوعة.',{inline_keyboard:[[button('تفعيل كود شراء','p:activate')],[homeButton()],[{text:'التواصل مع الدعم الفني',url:SUPPORT_URL}]]});return {activation_required:true};}
  if(text==='/delete'&&paidUi&&access.mode==='paid'){await paidUi.handle({id,s,text:'',cb:{data:'p:delete:'+access.activeDraft}});await seen.add(update.update_id);return {delete_confirmation:true};}
  if(text==='/delete'){await sessions.delete(id);await seen.add(update.update_id);await sendMessage(id,'حُذفت مسودة السيرة من الخدمة. حذف المحادثة من تيليجرام يتم من تطبيقك.');return {deleted:true};}
   if(!s){const r=mainMenu(s,admin);await sendMessage(id,r.text,r.reply_markup);await seen.add(update.update_id);return {menu:true};}
  try{
   if(cb?.data?.startsWith('c:')){
    const match=/^c:(\d+):(back|confirm|pdf|review|ai|current)$/.exec(cb.data);
    if(!match||Number(match[1])!==s.revision)throw Error('هذا الزر من خطوة سابقة. استخدم آخر رسالة من البوت.');
    text='/'+match[2];
   }
   if(paidUi&&access.mode==='paid'&&!access.active){
    if(text==='/pdf')await paidUi.download(id,access.activeDraft);
    else if(['/review','/current'].includes(text))await paidUi.showReadOnly(id,s);
    else await sendMessage(id,'انتهت مدة التحرير والذكاء الاصطناعي. مسوداتك محفوظة للعرض وتنزيل النسخ المعتمدة.',{inline_keyboard:[[button('مسوداتي','p:drafts')],[button('تجديد الخدمة','p:activate')],[homeButton()]]});
    await seen.add(update.update_id);return {read_only:true};
   }
   if(paidUi&&access.mode==='paid'&&!access.activeDraft){await paidUi.showDrafts(id);await seen.add(update.update_id);return {draft_picker:true};}
   if(text==='/current'){await show(id,s);await seen.add(update.update_id);return {current_step:true};}
   if(cb?.data?.startsWith('r:')){
    const match=/^r:(\d+):(\d+)$/.exec(cb.data);
    if(!match||Number(match[1])!==s.revision||current(s).stage!=='review')throw Error('هذه مراجعة قديمة. استخدم آخر بطاقة مراجعة.');
    const r=reviewCard(s,Number(match[2]));
    if(editMessage)await editMessage(id,m.message_id,r.text,r.reply_markup);else await sendMessage(id,r.text,r.reply_markup);
    await sessions.set(id,s);await seen.add(update.update_id);return {review_page:true};
   }
   if(cb?.data?.startsWith('ai:r:')){
    const match=/^ai:r:([a-f0-9-]+):(\d+)$/.exec(cb.data);
    if(!match||s.proposal?.id!==match[1]||s.proposal.baseRevision!==s.revision)throw Error('هذه اقتراحات قديمة. افتح تحسين الصياغة من جديد.');
    const r=proposalCard(s,Number(match[2]));if(editMessage)await editMessage(id,m.message_id,r.text,r.reply_markup);else await sendMessage(id,r.text,r.reply_markup);await seen.add(update.update_id);return {proposal_page:true};
   }
   if(cb?.data==='ai:improve'||cb?.data==='ai:translate:en'||cb?.data==='ai:translate:ar'){
    s.aiRequest={id:randomUUID(),baseRevision:s.revision,kind:cb.data==='ai:improve'?'improve':'translate',targetLanguage:cb.data.endsWith(':ar')?'ar':'en'};text='/request_ai_consent';
   }
   if(cb?.data?.startsWith('ai:consent:')){
    if(cb.data!=='ai:consent:'+s.aiRequest?.id||s.aiRequest.baseRevision!==s.revision)throw Error('تغيرت البيانات. افتح الذكاء الاصطناعي من جديد.');
    text='/ai_consent';
   }else if(cb?.data==='ai:consent'){
    if(s.aiRequest?.id)throw Error('استخدم زر الموافقة في آخر رسالة.');text='/ai_consent';
   }
   if(cb?.data?.startsWith('ai:apply:')||cb?.data?.startsWith('ai:discard:')){
    const parts=cb.data.split(':');if(s.proposal?.id!==parts[2])throw Error('هذا الاقتراح قديم.');
    if(parts[1]==='apply')text='/apply_ai';else{delete s.proposal;text='/review';}
   }else if(cb?.data==='ai:apply'){if(s.proposal?.id)throw Error('استخدم زر التطبيق في آخر اقتراح.');text='/apply_ai';}
   else if(cb?.data==='ai:discard'){if(s.proposal?.id)throw Error('استخدم زر الاحتفاظ بالأصل في آخر اقتراح.');delete s.proposal;text='/review';}
   if(text==='/ai'){
    if(current(s).stage!=='review')throw Error('أكمل بيانات السيرة أولًا.');
    await sendMessage(id,'كيف تريد الاستفادة من الذكاء الاصطناعي؟'+(access.mode==='paid'?'\nالمتبقي في باقتك: '+access.aiRemaining+' عملية.':''),{inline_keyboard:[[button('تحسين الصياغة','ai:improve')],[button('ترجمة السيرة إلى الإنجليزية','ai:translate:en')],[button('ترجمة السيرة إلى العربية','ai:translate:ar')],[homeButton()]]});
    await seen.add(update.update_id);return {ai_menu:true};
   }
   if(text==='/request_ai_consent'){
    if(current(s).stage!=='review')throw Error('أكمل بيانات السيرة أولًا.');
    await sessions.set(id,s);
    const translating=s.aiRequest.kind==='translate';
    await sendMessage(id,translating?'سنرسل نصوص السيرة المهنية، بما فيها التعليم والخبرة والمهارات، إلى OpenAI للترجمة. لن نرسل حقول الاسم أو الهاتف أو البريد أو روابط الحسابات. ستراجع الترجمة قبل تطبيقها، ويبقى اسمك كما كتبته.\nتُخصم عملية واحدة عند نجاح الترجمة.':'سنرسل النبذة وتفاصيل الخبرات والمشاريع إلى OpenAI لتحسين الصياغة. لن نرسل حقول الاسم أو الهاتف أو البريد أو روابط الحسابات. ستراجع الاقتراحات قبل تطبيقها.\nتُخصم عملية واحدة عند نجاح التحسين.',{inline_keyboard:[[button('أوافق على هذه العملية','ai:consent:'+s.aiRequest.id)],[action(s,'العودة للمراجعة','review')]]});
    await seen.add(update.update_id);return {consent_requested:true};
   }
   if(text==='/ai_consent'){
    if(current(s).stage!=='review'||!improve||!reserveAI)throw Error('الذكاء الاصطناعي غير متاح الآن.');
    const request=s.aiRequest||{kind:'improve'},ticket=await reserveAI(id,request.kind);
    try{
     const result=request.kind==='translate'?await translate(s.data,request.targetLanguage):await improve(s.data);
     s.proposal={...result,id:randomUUID(),baseRevision:s.revision};delete s.aiRequest;await sessions.set(id,s);
     const r=proposalCard(s);await sendMessage(id,r.text,r.reply_markup);
     if(finishAI)await finishAI(id,ticket,true);
     await seen.add(update.update_id);return {proposal_ready:true};
    }catch(e){if(finishAI)await finishAI(id,ticket,false);throw e;}
   }
   if(text==='/back'){if(s.edit){s.edit=null;delete s.listDraft;}else back(s);}
   else if(text==='/apply_ai')applyProposal(s);
   else if(text==='/review'||text==='/edit'){if(current(s).stage!=='review')throw Error('أكمل السؤال الحالي أولًا، أو اضغط «رجوع».');}
   else if(text==='/confirm'){
    confirm(s);await sessions.set(id,s);await seen.add(update.update_id);
    await sendMessage(id,'تم اعتماد السيرة ✅\nاضغط «تحميل السيرة PDF» للحصول على ملفك.\nأي تعديل لاحق يحتاج اعتمادًا جديدًا.',{inline_keyboard:[[action(s,'تحميل السيرة PDF','pdf')],[action(s,'مراجعة وتعديل البيانات','review')],[action(s,'تحسين الصياغة','ai')],[homeButton()]]});
    return {confirmed:true};
   }
   else if(text==='/pdf'){
    const data=resumeData(s);await sendDocument(id,await renderPdf(data),'ETMAM-CV.pdf');await seen.add(update.update_id);
    await sendMessage(id,'سيرتك جاهزة 📄\nيمكنك مراجعة بياناتك وتعديلها متى احتجت.',{inline_keyboard:[[action(s,'مراجعة وتعديل البيانات','review')],[action(s,'تحميل السيرة مجددًا','pdf')],[homeButton()]]});return {pdf_sent:true};
   }
   else if(cb?.data?.startsWith('e:')){
    const match=/^e:(\d+):(.+)$/.exec(cb.data);if(!match||Number(match[1])!==s.revision)throw Error('هذه قائمة تعديل قديمة. استخدم آخر بطاقة مراجعة.');edit(s,match[2]);
   }
   else if(current(s).kind==='lines'){
    const q=current(s);
    if(s.listDraft?.field!==q.id)s.listDraft={field:q.id,items:q.editing&&Array.isArray(q.value)?[...q.value]:[],awaiting:true};
    const draft=s.listDraft;
    if(cb?.data?.startsWith('q:')){
     const match=/^q:(\d+):(skill|language|level|cancel):([a-z0-9]+)$/.exec(cb.data);
     if(!match||Number(match[1])!==s.revision)throw Error('هذا الاختيار من خطوة سابقة. استخدم آخر قائمة.');
     const kind=match[2],value=match[3];
     if(kind==='skill'&&q.id==='skills'){
      const item=skillValue(s,Number(value));if(!item)throw Error('اختر مهارة من القائمة.');
      const index=draft.items.findIndex(x=>normalized(x)===normalized(item));
      if(index>=0)draft.items.splice(index,1);else{if(draft.items.length>=30)throw Error('يمكنك إضافة 30 مهارة كحد أقصى.');draft.items.push(item);}
     }else if(kind==='language'&&q.id==='languages'){
      if(!LANGUAGE_OPTIONS[value])throw Error('اختر لغة من القائمة.');
      draft.languagePending={label:LANGUAGE_OPTIONS[value][0],name:languageName(s,value),aliases:LANGUAGE_OPTIONS[value]};
     }else if(kind==='level'&&q.id==='languages'&&draft.languagePending){
      const level=LANGUAGE_LEVELS.find(x=>x[0]===value);if(!level)throw Error('اختر مستوى من القائمة.');
      const pending=draft.languagePending,item=pending.name+' — '+level[s.data.language==='en'?2:1];
      const index=draft.items.findIndex(x=>pending.aliases.some(a=>normalized(x.split(/[—:|\-]/)[0])===normalized(a)));
      if(index>=0)draft.items[index]=item;else{if(draft.items.length>=30)throw Error('يمكنك إضافة 30 لغة كحد أقصى.');draft.items.push(item);}
      delete draft.languagePending;
     }else if(kind==='cancel'&&q.id==='languages')delete draft.languagePending;
     else throw Error('هذا الاختيار لا يناسب السؤال الحالي.');
     s.revision++;s.confirmedRevision=null;
    }else if(cb?.data?.startsWith('l:')){
     const match=/^l:(\d+):(add|done|remove)$/.exec(cb.data);
     if(!match||Number(match[1])!==s.revision)throw Error('هذا الزر قديم. استخدم آخر رسالة من القائمة.');
     if(match[2]==='done'){
      if(!draft.items.length&&!q.optional)throw Error('أضف عنصرًا واحدًا على الأقل قبل المتابعة.');
      const value=draft.items.join('\n');delete s.listDraft;answer(s,value);
     }else if(match[2]==='remove'){draft.items.pop();draft.awaiting=!draft.items.length;s.revision++;s.confirmedRevision=null;}
     else draft.awaiting=true;
    }else if(cb?.data==='a:'+q.id+':__skip__'){
     if(draft.items.length)throw Error('اختر «انتهيت، متابعة» للاحتفاظ بالإضافات.');delete s.listDraft;answer(s,'');
    }else if(cb)return {stale_button:true};
    else{
     if(!text.trim()||text.startsWith('/'))throw Error('اكتب عنصرًا واحدًا أو استخدم الأزرار الظاهرة.');
     if(q.id==='languages'&&!/[\n—:|\-]/.test(text)){
      if(text.trim().length>60)throw Error('اكتب اسم اللغة فقط، ثم اختر المستوى.');
      const code=Object.keys(LANGUAGE_OPTIONS).find(code=>LANGUAGE_OPTIONS[code].some(name=>normalized(name)===normalized(text)));
      draft.languagePending={label:code?LANGUAGE_OPTIONS[code][0]:text.trim(),name:code?languageName(s,code):text.trim(),aliases:code?LANGUAGE_OPTIONS[code]:[text.trim()]};
      s.revision++;s.confirmedRevision=null;await show(id,s);await seen.add(update.update_id);return {language_level_requested:true};
     }
     const items=text.split(/\r?\n/).map(x=>x.replace(/^[•*\-]\s*/,'').trim()).filter(Boolean);
     if(items.some(x=>x.length>1000)||draft.items.length+items.length>30||[...draft.items,...items].join('\n').length>6000)throw Error('اختصر كل عنصر إلى 1000 حرف، وبحد أقصى 30 عنصرًا و6000 حرف للقائمة.');
     draft.items.push(...items);draft.awaiting=false;s.revision++;s.confirmedRevision=null;
    }
   }
   else if(cb?.data?.startsWith('a:')){
    const match=/^a:([^:]+):([^:]+)$/.exec(cb.data);if(!match||match[1]!==current(s).id)return {stale_button:true};
    answer(s,match[2]==='__skip__'?'':match[2]==='__current__'?(s.data.language==='en'?'Present':'حتى الآن'):match[2]);
   }
   else if(cb)return {stale_button:true};
   else{if(text.startsWith('/'))throw Error('اختر من الأزرار أو اكتب إجابة السؤال الحالي.');answer(s,text);}
   await seen.add(update.update_id);await show(id,s);return {ok:true};
  }catch(e){
   await sessions.set(id,s);await seen.add(update.update_id);
   await sendMessage(id,e.message,{inline_keyboard:[[action(s,'عرض الخطوة الحالية','current')]]});return {validation_error:true};
  }
 };
}
