import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { Resume } from "./types";

const hasText = (value?: string) => Boolean(value?.trim());

export default function ResumeDiagnosis({ data, onSection }: {
  data: Resume;
  onSection: (section: string) => void;
}) {
  const checks = [
    { section: "identity", label: "الاسم ووسيلة التواصل", met: hasText(data.name) && (hasText(data.email) || hasText(data.phone)), tip: "أضف اسمك ووسيلة تواصل واحدة على الأقل." },
    { section: "summary", label: "الملخص المهني", met: hasText(data.summary), tip: "اكتب سطرين عن مجالك وما تستطيع تقديمه." },
    { section: "education", label: "المؤهل والجهة التعليمية", met: data.education.some((entry) => hasText(entry.title) && hasText(entry.organization)), tip: "أضف المؤهل والجهة التعليمية إذا كانا مناسبين لسيرتك." },
    { section: "skills", label: "المهارات", met: data.skills.some(hasText), tip: "أضف المهارات التي تستخدمها فعلًا في مجالك." },
  ];
  if (data.profile === "experienced") {
    checks.push({ section: "experience", label: "تفاصيل الخبرة العملية", met: data.experience.some((entry) => hasText(entry.title) && [...(entry.details ?? []), ...(entry.achievements ?? [])].some(hasText)), tip: "أضف مسمى الدور ومسؤولية أو إنجازًا يوضح مساهمتك." });
  }
  const complete = checks.filter((check) => check.met);
  const remaining = checks.filter((check) => !check.met);

  return (
    <details className="resume-diagnosis">
      <summary>فحص محتوى السيرة <span>{complete.length} من {checks.length}</span></summary>
      <p>يتحقق الفحص من وجود بيانات أساسية في المسودة.</p>
      {remaining.length > 0 && <>
        <h3>بيانات تستحق المراجعة</h3>
        {remaining.map((check) => (
          <button type="button" key={check.section} onClick={(event) => {
            event.currentTarget.closest("details")?.removeAttribute("open");
            onSection(check.section);
          }}>
            <span><strong>{check.label}</strong><small>{check.tip}</small></span>
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
        ))}
      </>}
      {complete.length > 0 && <>
        <h3>موجود في المسودة</h3>
        <ul>{complete.map((check) => <li key={check.section}><CheckCircle2 size={15} aria-hidden="true" />{check.label}</li>)}</ul>
      </>}
    </details>
  );
}
