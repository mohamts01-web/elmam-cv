import { useState } from "react";
import { Copy } from "lucide-react";
import type { Resume } from "./types";

export default function LinkedInKit({ resume }: { resume: Resume }) {
  const [status, setStatus] = useState("");
  const experience = resume.experience.filter((entry) => entry.title?.trim()).map((entry) => {
    const heading = [entry.title, entry.organization, [entry.start, entry.end].filter(Boolean).join(" – ")].filter(Boolean).join(" | ");
    const bullets = [...(entry.details ?? []), ...(entry.achievements ?? [])].filter((line) => line.trim());
    return [heading, ...bullets.map((line) => `• ${line}`)].join("\n");
  }).join("\n\n");
  const sections = [
    { label: "العنوان المهني", value: resume.headline?.trim() || "", rows: 2 },
    { label: "النبذة", value: resume.summary?.trim() || "", rows: 4 },
    { label: "الخبرات", value: experience, rows: 5 },
    { label: "المهارات", value: resume.skills.filter((skill) => skill.trim()).join("\n"), rows: 4 },
  ].filter(({ value }) => value);

  return <details className="linkedin-kit">
    <summary>جهّز ملفك على LinkedIn</summary>
    <p>راجع النصوص المستخرجة من مسودتك وانسخها إلى الأقسام المناسبة في LinkedIn.</p>
    {sections.length === 0 && <p>أضف عنوانًا مهنيًا أو نبذة أو خبرة أو مهارة إلى سيرتك لتظهر هنا.</p>}
    {sections.map(({ label, value, rows }) => <div className="linkedin-field" key={label}>
      <label><strong>{label}</strong><textarea dir="auto" rows={rows} readOnly value={value} /></label>
      <button type="button" className="secondary" aria-label={`نسخ ${label}`} onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setStatus(`تم نسخ ${label}.`);
        } catch { setStatus("تعذّر النسخ التلقائي. حدّد النص وانسخه يدويًا."); }
      }}><Copy size={15} aria-hidden="true" /> نسخ</button>
    </div>)}
    <p role="status">{status}</p>
  </details>;
}
