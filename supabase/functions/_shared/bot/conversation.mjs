const randomUUID=()=>crypto.randomUUID();
export const BRAND={name:'إلمام CV',description:'أنشئ سيرتك الذاتية بالعربية أو الإنجليزية، وراجعها ونزّلها بصيغة PDF. اربط حسابك لتكمل مسوداتك عبر موقع إلمام CV.'};
const STATUS=[['graduate','طالب أو حديث تخرج'],['experienced','موظف ولدي خبرة'],['no_experience','باحث عن عمل بدون خبرة']];
const step=(path,label,options={})=>({id:path,path,label,...options});
const common=()=>[
 step('language','اختر لغة السيرة الذاتية.',{choices:[['ar','العربية'],['en','الإنجليزية']]}),
 step('name','اكتب اسمك الكامل ليظهر في أعلى السيرة.'),
 step('phone','اكتب رقم الجوال مع رمز الدولة، مثل +9665XXXXXXXX. يمكنك تخطيه إذا ستضيف بريدًا إلكترونيًا.',{kind:'phone',optional:true}),
 step('email','اكتب بريدك الإلكتروني المهني. يمكنك تخطيه إذا أضفت رقم جوال.',{kind:'email',optional:true}),
 step('country','ما الدولة التي تقيم فيها؟ مثال: السعودية.',{optional:true}),
 step('city','ما المدينة التي تقيم فيها؟ مثال: الرياض.',{optional:true}),
 step('linkedin','رابط ملفك على LinkedIn، إن وجد.',{kind:'linkedin',optional:true}),
 step('github','رابط GitHub، إن وجد. مناسب للمشاريع التقنية والبرمجية.',{kind:'github',optional:true}),
 step('headline','ما الوظيفة التي ترغب في التقديم عليها؟ مثال: محاسب أو أخصائي دعم فني.',{optional:true}),
];
function educationFields(i){
 const p='education.'+i;
 return [
  step(p+'.title','المؤهل رقم '+(i+1)+': ما درجتك العلمية؟ مثال: بكالوريوس، دبلوم، ماجستير أو ثانوية.',{optional:true,skipGroup:'education'}),
  step(p+'.major','ما تخصصك الدراسي؟ مثال: المحاسبة أو نظم المعلومات.',{optional:true}),
  step(p+'.organization','ما اسم الجامعة أو المعهد أو جهة التعليم؟'),
  step(p+'.status','ما حالة هذا المؤهل؟',{choices:[['graduated','تخرجت'],['studying','ما زلت أدرس']]}),
  step(p+'.calendar','بأي تقويم ستكتب سنة التخرج؟',{choices:[['gregorian','ميلادي'],['hijri','هجري']]}),
  step(p+'.end','اكتب سنة التخرج بأربعة أرقام، مثل 2026 ميلادي أو 1448 هجري حسب التقويم الذي اخترته. إذا ما زلت تدرس فاكتب سنة التخرج المتوقعة.',{kind:'year',calendarPath:p+'.calendar',optional:true}),
  step(p+'.month','ما شهر التخرج؟ اختر الشهر من الأزرار، أو اضغط «تخطي» إذا لا تعرفه.',{kind:'month',calendarPath:p+'.calendar',optional:true}),
  step(p+'.gpa','ما معدلك الدراسي؟ اكتب المعدل ومقياسه، مثل 4.3 من 5، أو اختر «تخطي».',{optional:true}),
 ];
}
function entry(kind,i){
 const p=kind+'.'+i,number=i+1;
 const experience=[
  step(p+'.title','الخبرة رقم '+number+': ما المسمى الوظيفي؟',{optional:true,skipGroup:kind}),
  step(p+'.organization','ما اسم جهة العمل؟'),
  step(p+'.start','متى بدأت العمل؟ اكتب السنة الميلادية فقط مثل 2023، أو السنة والشهر مثل 2023-01.',{kind:'workdate',optional:true}),
  step(p+'.end','متى انتهى العمل؟ اكتب السنة أو السنة والشهر. إذا ما زلت تعمل هنا اضغط «أعمل هنا حاليًا».',{kind:'workdate',currentJob:true,optional:true}),
  step(p+'.details','ما أبرز مهامك في هذه الوظيفة؟ اكتب مهمة واحدة، ثم أضف بقية المهام.',{kind:'lines',itemLabel:'مسؤولية'}),
  step(p+'.achievements','ما أبرز إنجازاتك في هذه الوظيفة؟ اكتب إنجازًا واحدًا، أو اختر «تخطي».',{kind:'lines',itemLabel:'إنجاز',optional:true})
 ];
 const project=[
  step(p+'.title','المشروع أو التدريب رقم '+number+': ما اسمه ونوعه؟',{optional:true,skipGroup:kind}),
  step(p+'.organization','ما جهة المشروع أو التدريب؟ مثال: الجامعة أو جهة التدريب، أو اكتب «مشروع شخصي».',{optional:true}),
  step(p+'.details','ماذا أنجزت في هذا المشروع أو التدريب؟ اكتب نقطة واحدة، ثم أضف المزيد.',{kind:'lines',itemLabel:'نقطة'})
 ];
 const body=kind==='education'?educationFields(i):kind==='experience'?experience:project;
 return [...body,{id:p+'.more',repeat:kind,index:i,label:kind==='education'?'هل تريد إضافة مؤهل آخر؟':kind==='experience'?'هل تريد إضافة خبرة أخرى؟':'هل تريد إضافة مشروع أو تدريب آخر؟',choices:[['yes','نعم، أضف آخر'],['no','لا، متابعة']]}];
}
const tail=()=>[
 step('skills','ما المهارات التي تجيدها؟ اختر من الأزرار أو اكتب مهارة أخرى.',{kind:'lines',itemLabel:'مهارة',optional:true}),
 step('certifications','هل لديك شهادة مهنية؟ اكتب اسم الشهادة والجهة والسنة، أو اختر «تخطي».',{kind:'lines',itemLabel:'شهادة',optional:true}),
 step('courses','ما الدورات التي أكملتها؟ اكتب اسم دورة واحدة، مع الجهة والسنة إن توفرتا.',{kind:'lines',itemLabel:'دورة',optional:true}),
 step('volunteering','هل لديك تجربة تطوعية؟ اكتب دورك والجهة والمهام التي قمت بها، أو اختر «تخطي».',{kind:'lines',itemLabel:'تجربة',optional:true}),
 step('languages','ما اللغات التي تتحدثها؟ اختر العربية أو الإنجليزية، أو اكتب اسم لغة أخرى، ثم حدد مستواك.',{kind:'lines',itemLabel:'لغة',optional:true}),
 step('summary','اكتب نبذة قصيرة عن دراستك أو خبرتك والوظيفة التي تستهدفها، أو اختر «تخطي».',{optional:true}),
];
export function createSession(){return {id:randomUUID(),schemaVersion:4,profile:null,steps:[],index:0,edit:null,data:{education:[],experience:[],projects:[]},history:[],revision:0,confirmedRevision:null,createdAt:Date.now(),updatedAt:Date.now()};}
function set(data,path,value){const keys=path.split('.');let at=data;for(const key of keys.slice(0,-1)){if(at[key]===undefined)at[key]={};at=at[key];}at[keys.at(-1)]=value;}
export function get(data,path){return path.split('.').reduce((v,k)=>v?.[k],data);}
const digits=s=>s.normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
function valid(q,value,data){
 if(typeof value!=='string'||value.length>6000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw Error('اكتب نصًا صالحًا لا يتجاوز 6000 حرف.');
 let v=value.trim();if(!v&&!q.optional)throw Error('هذا الحقل مطلوب.');
 if(v&&q.kind==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw Error('راجع صيغة البريد الإلكتروني.');
 if(v&&q.kind==='phone'&&!/^\+?[\d\s()-]{8,24}$/.test(digits(v)))throw Error('راجع رقم الجوال مع رمز الدولة.');
 if(v&&q.kind==='linkedin'&&!/^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9%_-]+\/?$/.test(v))throw Error('استخدم رابط ملف LinkedIn الذي يبدأ بـ https://www.linkedin.com/in/');
 if(v&&q.kind==='github'&&!/^https:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/.test(v))throw Error('استخدم رابط ملف GitHub مثل https://github.com/username');
 if(v&&['year','month','workdate'].includes(q.kind)){
  v=digits(v);
  if(q.kind==='year'){const hijri=get(data,q.calendarPath)==='hijri';if(!/^\d{4}$/.test(v)||Number(v)<(hijri?1300:1900)||Number(v)>(hijri?1600:2100))throw Error('اكتب سنة صحيحة بأربعة أرقام وفق التقويم الذي اخترته.');}
  if(q.kind==='month'&&(!/^\d{1,2}$/.test(v)||Number(v)<1||Number(v)>12))throw Error('اكتب رقم شهر من 1 إلى 12، أو اضغط «تخطي».');
  if(q.kind==='month')v=String(Number(v)).padStart(2,'0');
  if(q.kind==='workdate'&&v!=='حتى الآن'&&v!=='Present'&&!/^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$/.test(v))throw Error('اكتب السنة مثل 2023 أو السنة والشهر مثل 2023-01.');
 }
 if(q.choices&&!q.choices.some(([key])=>key===v))throw Error('اختر أحد الأزرار المعروضة.');
 return q.kind==='lines'?v.split(/\r?\n/).map(x=>x.replace(/^[•*\-]\s*/, '').trim()).filter(Boolean):v;
}
function checkpoint(s){const {history,...snapshot}=s;s.history.push(structuredClone(snapshot));if(s.history.length>150)s.history.shift();}
// Extend older drafts without overwriting values or moving their current question.
export function upgradeSession(s){
 if(!s||s.schemaVersion>=4)return s;
 if(s.profile){
  const oldId=s.edit||s.steps[s.index]?.id,wasReview=s.index>=s.steps.length;
  for(const [i,x]of (s.data.education||[]).entries()){
   if(!x?.title)continue;
   const existing=new Set(s.steps.map(q=>q.id));
   for(const q of educationFields(i)){
    if(existing.has(q.id))continue;
    const more=s.steps.findIndex(v=>v.id==='education.'+i+'.more');
    s.steps.splice(more<0?s.steps.length:more,0,q);
   }
  }
  s.index=wasReview?s.steps.length:Math.max(0,s.steps.findIndex(q=>q.id===oldId));
  const refreshed=[...common(),...tail()];
  for(const kind of ['education','experience','projects'])for(let i=0;i<5;i++)refreshed.push(...entry(kind,i));
  const definitions=new Map(refreshed.map(q=>[q.id,q]));
  s.steps=s.steps.map(q=>definitions.has(q.id)?{...q,...definitions.get(q.id)}:q);
 }
 s.schemaVersion=4;return s;
}
export function current(s){
 if(!s.profile)return {stage:'question',id:'profile',label:'وش وضعك المهني حاليًا؟',choices:STATUS,optional:false,brand:BRAND.name};
 const q=s.edit?s.steps.find(x=>x.id===s.edit):s.steps[s.index];
 if(q)return {stage:'question',id:q.id,label:q.label,kind:q.kind,calendar:q.calendarPath?get(s.data,q.calendarPath):undefined,itemLabel:q.itemLabel,currentJob:!!q.currentJob,choices:q.choices||[],optional:!!q.optional,value:q.path?get(s.data,q.path):'',progress:Math.round(s.index/s.steps.length*100),editing:!!s.edit};
 return {stage:'review',label:'راجع سيرتك قبل إنشاء الملف.',data:s.data,profile:s.profile,revision:s.revision,confirmed:s.confirmedRevision===s.revision,fields:s.steps.filter(x=>x.path&&(!x.skipGroup||get(s.data,x.path))&&(get(s.data,x.path)!==undefined||x.id.startsWith('education.')&&get(s.data,x.id.split('.').slice(0,2).join('.')+'.title'))).map(x=>({id:x.id,label:x.label,value:get(s.data,x.path)})),progress:100};
}
export function answer(s,value){
 if(!s.profile){if(!STATUS.some(([id])=>id===value))throw Error('اختر حالتك المهنية.');checkpoint(s);s.profile=value;s.data.profile=value;
  const groups=value==='experienced'?[...entry('experience',0),...entry('education',0),...entry('projects',0)]:[...entry('education',0),...entry('projects',0)];s.steps=[...common(),...groups,...tail()];
 }else{
  const q=s.edit?s.steps.find(x=>x.id===s.edit):s.steps[s.index];if(!q)throw Error('اكتملت الأسئلة. اختر المراجعة أو التعديل.');const v=valid(q,value,s.data);checkpoint(s);
  if(q.repeat){if(v==='yes'){if(q.index>=4)throw Error('الحد في هذه النسخة خمس إضافات لكل قسم.');s.steps.splice(s.index+1,0,...entry(q.repeat,q.index+1));}s.index++;}
  else{if(s.edit&&q.skipGroup&&!String(v).trim())throw Error('اكتب عنوان الإضافة؛ حذف الإضافة كاملة سيكون بإجراء مستقل.');set(s.data,q.path,v);if(s.edit)s.edit=null;else if(q.skipGroup&&!String(v).trim()){const group=q.path.split('.').slice(0,2).join('.');while(s.steps[s.index]?.id.startsWith(group+'.'))s.index++;}else s.index++;}
 }
 s.revision++;s.confirmedRevision=null;s.updatedAt=Date.now();return current(s);
}
export function back(s){if(!s.history.length)return current(s);const prev=s.history.pop(),history=s.history;Object.assign(s,prev,{history,confirmedRevision:null,updatedAt:Date.now()});delete s.listDraft;return current(s);}
export function edit(s,id){if(s.index<s.steps.length||!s.steps.some(x=>x.id===id&&x.path))throw Error('اختر حقلًا قابلًا للتعديل من المراجعة.');s.edit=id;s.confirmedRevision=null;delete s.listDraft;return current(s);}
export function confirm(s){if(s.index<s.steps.length||s.edit||s.listDraft)throw Error('أكمل السؤال الحالي أولًا.');if(!s.data.name||!s.data.language||(!s.data.phone&&!s.data.email))throw Error('الاسم ولغة السيرة ووسيلة تواصل واحدة على الأقل مطلوبة.');s.confirmedRevision=s.revision;return current(s);}
export function resumeData(s){if(s.confirmedRevision!==s.revision||s.edit||s.listDraft)throw Error('راجع البيانات واعتمد النسخة الحالية أولًا.');return structuredClone(s.data);}
export function cleanEntries(items=[]){return items.filter(x=>x?.title?.trim());}
