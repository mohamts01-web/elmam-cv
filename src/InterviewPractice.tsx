import { useState } from "react";
import type { Vacancy } from "./JobTarget";

const baseQuestions = [
  ["intro", "عرّفنا بنفسك. ما الذي يجعلك مهتمًا بهذه الوظيفة؟", "اربط خبرة أو مهارة لديك بمسؤولية من الإعلان، واذكر لماذا يهمك الدور."],
  ["example", "صف موقفًا استخدمت فيه مهارة تفيدك في هذه الوظيفة.", "يمكنك الاستعانة بموقف من العمل أو التدريب أو مشروع دراسي. اذكر ما فعلته أنت وكيف انتهى الموقف."],
  ["learn", "كيف ستتعامل مع مهمة جديدة عليك في هذا الدور؟", "اشرح كيف ستفهم المطلوب، ومتى ستطلب المساعدة، وكيف ستتحقق من جودة النتيجة."],
];

type Notes = Record<string, string>;
export const generalPractice: Vacancy = {
  id: 0, title: "تدريب عام للمقابلات", company: null, location: null,
  qualification: null, experience: null, description: "", aggregate: false,
};
const interviewPrefix = (owner: string) => `elmam.cv.interview.${owner}.`;

export function InterviewLibrary({ owner }: { owner: string }) {
  const [entries] = useState(() => {
    const prefix = interviewPrefix(owner);
    const saved: { vacancy: Vacancy; updated: number }[] = [];
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const id = key.slice(prefix.length);
        if (!/^\d+$/.test(id)) continue;
        try {
          const entry = JSON.parse(localStorage.getItem(key) ?? "null");
          if (entry?.vacancy?.id === Number(id) && typeof entry.vacancy.title === "string") saved.push(entry);
          else if (Object.values(readNotes(key)).some((answer) => answer.trim())) {
            saved.push({ updated: 0, vacancy: { id: Number(id), title: `إعلان #${id}`, company: null, location: null, qualification: null, experience: null, description: "", aggregate: false } });
          }
        } catch { /* Other sessions remain available. */ }
      }
    } catch { /* Storage can be disabled by the browser. */ }
    return saved.sort((a, b) => b.updated - a.updated);
  });

  return <section className="interview-library" aria-label="تحضير المقابلات المحفوظ">
    <h2>تحضير المقابلات</h2>
    <p>تدرّب على الأسئلة الشائعة واحفظ إجاباتك في هذا المتصفح.</p>
    {!entries.some(({ vacancy }) => vacancy.id === generalPractice.id) && <InterviewPractice vacancy={generalPractice} owner={owner} library />}
    {entries.map(({ vacancy }) => <InterviewPractice key={vacancy.id} vacancy={vacancy} owner={owner} library />)}
  </section>;
}

function readNotes(key: string): Notes {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      const notes = "notes" in stored ? stored.notes : stored;
      if (notes && typeof notes === "object" && !Array.isArray(notes)) {
        return Object.fromEntries(Object.entries(notes).filter(([, value]) => typeof value === "string"));
      }
    }
  } catch { /* Practice still works without saved answers. */ }
  return {};
}

export default function InterviewPractice({ vacancy, owner, library = false }: { vacancy: Vacancy; owner: string; library?: boolean }) {
  const storageKey = interviewPrefix(owner) + vacancy.id;
  const [notes, setNotes] = useState(() => readNotes(storageKey));
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState("");
  const general = vacancy.id === generalPractice.id;
  const qualification = vacancy.aggregate ? "" : vacancy.qualification?.trim();
  const requiredExperience = vacancy.aggregate ? "" : vacancy.experience?.trim();
  const questions = [...baseQuestions];
  if (qualification) questions.push(["qualification", "كيف أعدّك مؤهلك أو تدريبك لتنفيذ مهام الوظيفة؟", "اذكر مادة أو مشروعًا أو تدريبًا ذا صلة ووضّح كيف استفدت منه."]);
  if (requiredExperience) questions.push(["required-experience", "ما أقرب خبرة لديك للخبرة المطلوبة في الإعلان؟", "اذكر دورك ونطاق عملك والنتيجة. إذا كانت خبرتك في مجال مختلف، وضّح المهارات التي تستطيع نقلها إلى هذا الدور."]);
  const [id, question, guidance] = questions[Math.min(index, questions.length - 1)];
  const displayedQuestion = general ? ["عرّفنا بنفسك. ما المجال الذي ترغب في العمل فيه؟", "صف موقفًا استخدمت فيه مهارة تهمك في عملك القادم.", "كيف تتعامل مع مهمة جديدة عليك؟"][index] : question;
  const displayedGuidance = general && index === 0 ? "اذكر مجالك ومهارة أو تجربة توضح ما تستطيع تقديمه." : guidance;

  return <details className="interview-practice" id={library ? undefined : "interview-practice"} open={!library && location.hash === "#interview-practice" ? true : undefined}>
    <summary>{library || general ? [vacancy.title, vacancy.company].filter(Boolean).join(" · ") : "تدرّب على مقابلة هذه الوظيفة"}</summary>
    {!library && <p>{vacancy.title}{vacancy.company && ` · ${vacancy.company}`}</p>}
    {vacancy.aggregate && <p>اختر مسمى واحدًا من الإعلان المجمّع وابنِ إجاباتك حوله.</p>}
    {vacancy.description && <details><summary>ارجع إلى وصف الوظيفة أثناء التدريب</summary><p className="job-target-description">{vacancy.description}</p></details>}
    <fieldset>
      <legend>السؤال {index + 1} من {questions.length}</legend>
      <label htmlFor={`interview-answer-${vacancy.id}`}>{displayedQuestion}</label>
      {id === "qualification" && <p className="interview-requirement"><strong>المؤهل المذكور في الإعلان</strong><br /><bdi>{qualification}</bdi></p>}
      {id === "required-experience" && <p className="interview-requirement"><strong>الخبرة المذكورة في الإعلان</strong><br /><bdi>{requiredExperience}</bdi></p>}
      <p>{displayedGuidance}</p>
      <textarea id={`interview-answer-${vacancy.id}`} rows={5} maxLength={2500} value={notes[id] ?? ""} onChange={(event) => {
        const value = event.currentTarget.value;
        setNotes((previous) => ({ ...previous, [id]: value }));
        setStatus("");
      }} />
    </fieldset>
    <details><summary>راجع إجابتك</summary><ul>
      <li>هل أجبت عن السؤال مباشرة؟</li>
      <li>هل ذكرت مثالًا محددًا ودورك فيه؟</li>
      <li>هل وضّحت النتيجة أو ما تعلمته وربطته بالوظيفة؟</li>
    </ul></details>
    <div className="interview-actions">
      <button type="button" className="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>السابق</button>
      <button type="button" className="secondary" disabled={index === questions.length - 1} onClick={() => setIndex(index + 1)}>السؤال التالي</button>
      <button type="button" className="primary" onClick={() => {
        try {
          localStorage.setItem(storageKey, JSON.stringify({ vacancy, updated: Date.now(), notes }));
          setStatus("حُفظت الإجابات في هذا المتصفح.");
        } catch { setStatus("تعذّر الحفظ في هذا المتصفح."); }
      }}>حفظ على هذا الجهاز</button>
    </div>
    <p role="status">{status}</p>
  </details>;
}
