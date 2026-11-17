import { useState } from "react";

const examples = [
  { role: "منسّق مشاريع", requirement: "متابعة مواعيد التسليم والتنسيق بين الفرق", after: "نسّقت بين الفرق وتابعت مواعيد تسليم المهام لضمان وضوح الأولويات." },
  { role: "أخصائي عمليات", requirement: "إعداد التقارير ومتابعة سير العمل", after: "أعددت تقارير المتابعة ونظّمت مهام الفرق لتوضيح حالة العمل." },
];

export default function TailoringExample() {
  const [index, setIndex] = useState(0);
  const example = examples[index];
  return (
    <section className="container tailoring-example" aria-labelledby="tailoring-example-title">
      <h2 id="tailoring-example-title">شاهد كيف تتغيّر صياغة السيرة للوظيفة</h2>
      <p>مثال توضيحي يبرز التفاصيل المناسبة من الخبرة نفسها.</p>
      <div className="tailoring-options" role="group" aria-label="اختر وظيفة للمعاينة">
        {examples.map(({ role }, i) => <button key={role} type="button" className="secondary" aria-pressed={i === index} onClick={() => setIndex(i)}>{role}</button>)}
      </div>
      <div className="tailoring-columns" aria-live="polite">
        <article><h3>متطلب الوظيفة</h3><p><mark key={example.role}>{example.requirement}</mark></p></article>
        <article><h3>قبل التخصيص</h3><p>نسّقت بين الفرق، وتابعت مواعيد التسليم، وأعددت تقارير سير العمل.</p></article>
        <article><h3>بعد التخصيص</h3><p>{example.after}</p></article>
      </div>
    </section>
  );
}
