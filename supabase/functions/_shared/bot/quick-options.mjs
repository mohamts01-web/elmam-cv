export const COMMON_SKILLS=[
 ['التواصل الفعال','Effective communication'],['العمل ضمن فريق','Teamwork'],
 ['حل المشكلات','Problem solving'],['إدارة الوقت','Time management'],
 ['التكيف مع التغيير','Adaptability'],['خدمة العملاء','Customer service'],
 ['Microsoft Office','Microsoft Office'],['تنظيم العمل','Work organization']
];
export const LANGUAGE_OPTIONS={ar:['العربية','Arabic'],en:['الإنجليزية','English']};
export const LANGUAGE_LEVELS=[
 ['native','اللغة الأم','Native'],['beginner','مبتدئ','Beginner'],
 ['intermediate','متوسط','Intermediate'],['advanced','متقدم','Advanced'],['fluent','طلاقة','Fluent']
];
export const normalized=s=>String(s).normalize('NFKC').trim().toLowerCase();
export const skillValue=(s,index)=>COMMON_SKILLS[index]?.[s.data.language==='en'?1:0];
export const languageName=(s,code)=>LANGUAGE_OPTIONS[code]?.[s.data.language==='en'?1:0];
