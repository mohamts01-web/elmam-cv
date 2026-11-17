// Local visual fixture; not referenced by the production entrypoint or build.
import React from 'react';import {createRoot} from 'react-dom/client';
import AIReview from './AIReview';import {sampleResume,defaultDesign} from '../shared/model.mjs';import type {Resume} from './types';
import './style.css';import './refinements.css';
const before=structuredClone(sampleResume) as Resume, after=structuredClone(before);
after.summary='أخصائية عمليات بخبرة في تنظيم الطلبات والتنسيق بين الفرق وإعداد التقارير الدورية. أطمح إلى دعم كفاءة التشغيل ضمن بيئة تقدّر الدقة والتطوير.';
after.experience[0].details=['متابعة الطلبات اليومية وتنظيم سير العمل بالتنسيق مع الأقسام المعنية.','إعداد تقارير دورية تساعد في متابعة المهام والعمليات.'];
createRoot(document.getElementById('root')!).render(<AIReview before={before} after={after} design={defaultDesign()} busy={false} onApply={()=>{}} onClose={()=>history.back()}/>);
