import { useState } from "react";
import { Plus, Trash2, Check, ChevronDown } from "lucide-react";
import {
  COMMON_SKILLS,
  COMMON_SKILLS_EN,
  LANGUAGE_LEVELS,
  languageValue,
} from "../shared/model.mjs";
import type { Resume, Entry } from "./types";
import { parseCourse, courseText } from "../shared/editor.mjs";
type Props = {
  data: Resume;
  section: string;
  onChange: (data: Resume) => void;
  disabled?: boolean;
};
export function Field({
  label,
  value = "",
  onChange,
  area = false,
  type = "text",
  placeholder = "",
  hint = "",
}: {
  label: string;
  value?: string;
  onChange: (s: string) => void;
  area?: boolean;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          placeholder={placeholder}
        />
      ) : (
        <input
          dir={["email", "tel", "url"].includes(type) ? "ltr" : "auto"}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}{" "}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function CourseFields({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [year, setYear] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const clear = () => {
    setName("");
    setOrg("");
    setYear("");
    setDescription("");
    setEditing(null);
  };
  return (
    <div className="course-editor">
      <p className="muted">
        أضف اسم الدورة والجهة المانحة والتاريخ، ويمكنك وصف ما تعلمته أو طبّقته
        فيها.
      </p>
      <div className="course-list">
        {value.map((v, i) => (
          <article key={i}>
            <span className="entry-number">{i + 1}</span>
            <div>
              <strong dir="auto">{parseCourse(v).name}</strong>
              <small dir="auto">
                {[parseCourse(v).issuer, parseCourse(v).date]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
              {parseCourse(v).description && (
                <p className="course-description">
                  {parseCourse(v).description}
                </p>
              )}
            </div>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                const c = parseCourse(v);
                setEditing(i);
                setName(c.name);
                setOrg(c.issuer);
                setYear(c.date);
                setDescription(c.description);
              }}
            >
              تعديل
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={"حذف الدورة " + (i + 1)}
              onClick={() => {
                onChange(value.filter((_, j) => j !== i));
                clear();
              }}
            >
              <Trash2 size={16} />
            </button>
          </article>
        ))}
      </div>
      <div className="structured-entry">
        <h4>{editing === null ? "دورة جديدة" : "تعديل الدورة"}</h4>
        <Field
          label="اسم الدورة *"
          value={name}
          onChange={setName}
          placeholder="مثل: تحليل البيانات باستخدام Excel"
        />
        <Field
          label="الجهة المانحة أو مقدم الدورة"
          value={org}
          onChange={setOrg}
          placeholder="اسم المعهد أو المنصة"
        />
        <Field
          label="التاريخ"
          value={year}
          onChange={setYear}
          placeholder="مثل: نوفمبر 2025 أو 2025-11"
        />
        <Field
          label="الوصف"
          value={description}
          onChange={setDescription}
          area
          placeholder="الموضوعات أو المهارات التي تعلمتها، وأي تطبيق عملي أنجزته فعلًا"
        />
        <div className="entry-actions">
          <button
            type="button"
            className="secondary"
            disabled={!name.trim()}
            onClick={() => {
              const item = courseText({
                name,
                issuer: org,
                date: year,
                description,
              });
              onChange(
                editing === null
                  ? [...value, item]
                  : value.map((x, i) => (i === editing ? item : x)),
              );
              clear();
            }}
          >
            <Plus size={16} />
            {editing === null ? "إضافة الدورة" : "حفظ التعديل"}
          </button>
          {editing !== null && (
            <button type="button" className="text-btn" onClick={clear}>
              إلغاء
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function LanguageFields({
  value,
  onChange,
  language,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  language: string;
}) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState("متوسط");
  const [editing, setEditing] = useState<number | null>(null);
  const save = () => {
    if (!name.trim()) return;
    const item = languageValue(name.trim(), level, language);
    const duplicate = value.findIndex(
      (v, i) =>
        i !== editing &&
        v.split(/[:：]/)[0].trim().toLowerCase() ===
          String(item).split(":")[0].trim().toLowerCase(),
    );
    const index = editing ?? (duplicate >= 0 ? duplicate : null);
    onChange(
      index === null
        ? [...value, item]
        : value.map((v, i) => (i === index ? item : v)),
    );
    setName("");
    setEditing(null);
  };
  const levelMap: Record<string, string> = {
    Native: "اللغة الأم",
    Beginner: "مبتدئ",
    Intermediate: "متوسط",
    Advanced: "متقدم",
    Fluent: "طلاقة",
  };
  return (
    <div className="language-editor">
      <p className="muted">
        اختر لغة وحدد مستواك الفعلي، ويمكنك تعديل المستوى في أي وقت.
      </p>
      <div className="course-list">
        {value.map((v, i) => (
          <article key={i}>
            <div>
              <strong dir="auto">{v.split(/[:：]/)[0]}</strong>
              <small dir="auto">
                {v.split(/[:：]/).slice(1).join(":").trim() || "حدّد المستوى"}
              </small>
            </div>
            <button
              className="text-btn"
              type="button"
              onClick={() => {
                const [n, l] = v.split(/[:：]/);
                setName(n);
                setLevel(levelMap[l?.trim()] || l?.trim() || "متوسط");
                setEditing(i);
              }}
            >
              تعديل
            </button>
            <button
              className="icon-btn"
              type="button"
              aria-label={"حذف اللغة " + (i + 1)}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <Trash2 size={16} />
            </button>
          </article>
        ))}
      </div>
      <div className="structured-entry">
        <h4>{editing === null ? "إضافة لغة" : "تعديل اللغة"}</h4>
        <div className="chips">
          <button
            type="button"
            onClick={() => {
              setName("العربية");
              setLevel("اللغة الأم");
            }}
          >
            العربية
          </button>
          <button
            type="button"
            onClick={() => {
              setName("الإنجليزية");
              setLevel("متوسط");
            }}
          >
            الإنجليزية
          </button>
        </div>
        <Field
          label="اللغة"
          value={name}
          onChange={setName}
          placeholder="اختر من الأعلى أو اكتب لغة أخرى"
        />
        <label className="field">
          <span>مستوى اللغة</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {LANGUAGE_LEVELS.map((s: string) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <div className="entry-actions">
          <button
            type="button"
            className="secondary"
            disabled={!name.trim()}
            onClick={save}
          >
            <Plus size={16} />
            {editing === null ? "إضافة اللغة" : "حفظ المستوى"}
          </button>
          {editing !== null && (
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                setEditing(null);
                setName("");
              }}
            >
              إلغاء
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function Lines({
  value,
  onChange,
  label,
}: {
  value: string[];
  onChange: (x: string[]) => void;
  label: string;
}) {
  const [text, setText] = useState("");
  function add() {
    if (text.trim()) {
      onChange([...value, text.trim()]);
      setText("");
    }
  }
  return (
    <div className="lines">
      <div className="list-items">
        {value.map((x, i) => (
          <div key={i}>
            <span>{x}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label={"حذف " + x}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="add-line">
        <input
          aria-label={label}
          value={text}
          placeholder={label}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          className="icon-btn"
          type="button"
          aria-label="إضافة العنصر"
          onClick={add}
        >
          <Plus size={19} />
        </button>
      </div>
      <small>اكتب عنصرًا ثم اضغط + لإضافته. لا تحتاج إلى أسطر متعددة.</small>
    </div>
  );
}
export default function Fields({
  data: d,
  section,
  onChange,
  disabled,
}: Props) {
  const put = (key: string, value: unknown) => onChange({ ...d, [key]: value });
  const skill = (s: string) =>
    d.language === "en" ? COMMON_SKILLS_EN[COMMON_SKILLS.indexOf(s)] : s;
  const entries = ["education", "experience", "projects"].includes(section)
    ? d[section as "education"]
    : null;
  const update = (index: number, key: string, value: unknown) =>
    put(
      section,
      entries!.map((x, i) => (i === index ? { ...x, [key]: value } : x)),
    );
  return (
    <fieldset disabled={disabled} className="fields-reset">
      {section === "identity" && (
        <>
          <div className="split">
            <Field
              label="الاسم الكامل *"
              value={d.name}
              onChange={(v) => put("name", v)}
              placeholder="الاسم كما تود ظهوره في السيرة"
            />
            <Field
              label="المسمى الوظيفي المستهدف"
              value={d.headline}
              onChange={(v) => put("headline", v)}
              placeholder="مثال: أخصائي عمليات"
            />
          </div>
          <Field
            label="البريد الإلكتروني"
            type="email"
            value={d.email}
            onChange={(v) => put("email", v)}
          />
          <Field
            label="رقم الجوال"
            type="tel"
            value={d.phone}
            onChange={(v) => put("phone", v)}
            placeholder="+9665XXXXXXXX"
          />
          <div className="split">
            <Field
              label="الدولة"
              value={d.country}
              onChange={(v) => put("country", v)}
            />
            <Field
              label="المدينة"
              value={d.city}
              onChange={(v) => put("city", v)}
            />
          </div>
          <Field
            label="رابط LinkedIn"
            type="url"
            value={d.linkedin}
            onChange={(v) => put("linkedin", v)}
          />
          <Field
            label="رابط GitHub"
            type="url"
            value={d.github}
            onChange={(v) => put("github", v)}
          />
        </>
      )}
      {section === "summary" && (
        <>
          <div className="tip">
            ابدأ بخبرتك أو تخصصك، ثم اذكر ما تجيده والفرصة التي تستهدفها.
          </div>
          <Field
            label="الملخص المهني"
            area
            value={d.summary}
            onChange={(v) => put("summary", v)}
            placeholder="اكتب نبذة قصيرة وصادقة عن مسيرتك…"
          />
        </>
      )}
      {entries && (
        <>
          {entries.map((x: Entry, i) => (
            <details className="entry-card" key={i} open>
              <summary>
                <span>{x.title || "إضافة " + (i + 1)}</span>
                <ChevronDown size={16} />
              </summary>
              <div className="entry-fields">
                <Field
                  label={
                    section === "education"
                      ? "الدرجة العلمية"
                      : section === "experience"
                        ? "المسمى الوظيفي"
                        : "اسم المشروع أو التدريب"
                  }
                  value={x.title}
                  onChange={(v) => update(i, "title", v)}
                />
                {section === "education" && (
                  <Field
                    label="التخصص"
                    value={x.major}
                    onChange={(v) => update(i, "major", v)}
                  />
                )}
                <Field
                  label={
                    section === "education"
                      ? "الجامعة أو المؤسسة التعليمية"
                      : "الجهة"
                  }
                  value={x.organization}
                  onChange={(v) => update(i, "organization", v)}
                />
                {section === "education" ? (
                  <>
                    <label className="field">
                      <span>حالة الدراسة</span>
                      <select
                        value={x.status || "graduated"}
                        onChange={(e) => update(i, "status", e.target.value)}
                      >
                        <option value="graduated">تخرجت</option>
                        <option value="studying">ما زلت أدرس</option>
                      </select>
                    </label>
                    <div className="split">
                      <label className="field">
                        <span>التقويم</span>
                        <select
                          value={x.calendar || "gregorian"}
                          onChange={(e) =>
                            update(i, "calendar", e.target.value)
                          }
                        >
                          <option value="gregorian">ميلادي</option>
                          <option value="hijri">هجري</option>
                        </select>
                      </label>
                      <Field
                        label={
                          x.status === "studying"
                            ? "سنة التخرج المتوقعة"
                            : "سنة التخرج"
                        }
                        value={x.end}
                        onChange={(v) => update(i, "end", v)}
                        placeholder={x.calendar === "hijri" ? "1447" : "2026"}
                      />
                    </div>
                    <div className="split">
                      <Field
                        label="شهر التخرج (اختياري)"
                        value={x.month}
                        onChange={(v) => update(i, "month", v)}
                        placeholder="01–12"
                      />
                      <Field
                        label="المعدل (اختياري)"
                        value={x.gpa}
                        onChange={(v) => update(i, "gpa", v)}
                        placeholder="4.5 / 5"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="split">
                      <Field
                        label="من"
                        value={x.start}
                        onChange={(v) => update(i, "start", v)}
                        placeholder="2023-01"
                      />
                      <Field
                        label="إلى"
                        value={x.end}
                        onChange={(v) => update(i, "end", v)}
                        placeholder="حتى الآن"
                      />
                    </div>
                    <span className="field-title">
                      {section === "experience"
                        ? "المهام والمسؤوليات"
                        : "ما الذي أنجزته؟"}
                    </span>
                    <Lines
                      value={x.details || []}
                      onChange={(v) => update(i, "details", v)}
                      label="أضف نقطة واحدة"
                    />
                    {section === "experience" && (
                      <>
                        <span className="field-title">الإنجازات (اختياري)</span>
                        <Lines
                          value={x.achievements || []}
                          onChange={(v) => update(i, "achievements", v)}
                          label="أضف إنجازًا حقيقيًا"
                        />
                      </>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className="text-btn danger"
                  onClick={() =>
                    put(
                      section,
                      entries.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 size={14} />
                  حذف الإضافة
                </button>
              </div>
            </details>
          ))}
          {entries.length < 5 && (
            <button
              type="button"
              className="add-card"
              onClick={() =>
                put(section, [
                  ...entries,
                  {
                    title: "",
                    organization: "",
                    ...(section === "education"
                      ? { status: "graduated", calendar: "gregorian" }
                      : { details: [], achievements: [] }),
                  },
                ])
              }
            >
              <Plus size={18} />{" "}
              {section === "education"
                ? "إضافة مؤهل"
                : section === "experience"
                  ? "إضافة خبرة"
                  : "إضافة مشروع أو تدريب"}
            </button>
          )}
        </>
      )}
      {section === "skills" && (
        <>
          <p className="muted">اختر ما تتقنه فعلًا، أو أضف مهاراتك الخاصة.</p>
          <div className="chips">
            {COMMON_SKILLS.map((s) => (
              <button
                type="button"
                className={d.skills.includes(skill(s)) ? "selected" : ""}
                key={s}
                onClick={() =>
                  put(
                    "skills",
                    d.skills.includes(skill(s))
                      ? d.skills.filter((x) => x !== skill(s))
                      : [...d.skills, skill(s)],
                  )
                }
              >
                {d.skills.includes(skill(s)) ? (
                  <Check size={14} />
                ) : (
                  <Plus size={14} />
                )}{" "}
                {s}
              </button>
            ))}
          </div>
          <Lines
            value={d.skills}
            onChange={(v) => put("skills", v)}
            label="مهارة أخرى"
          />
        </>
      )}
      {section === "languages" && (
        <LanguageFields
          value={d.languages}
          onChange={(v) => put("languages", v)}
          language={d.language}
        />
      )}
      {section === "courses" && (
        <CourseFields value={d.courses} onChange={(v) => put("courses", v)} />
      )}
      {["certifications", "volunteering"].includes(section) && (
        <Lines
          value={d[section as "courses"]}
          onChange={(v) => put(section, v)}
          label={
            section === "courses"
              ? "اسم الدورة، الجهة والسنة"
              : section === "certifications"
                ? "اسم الشهادة، الجهة والسنة"
                : "الدور التطوعي والجهة"
          }
        />
      )}
    </fieldset>
  );
}
