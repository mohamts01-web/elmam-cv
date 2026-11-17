export function pdfFilename(title) {
  const clean = String(title || "سيرتي الذاتية")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return (clean || "سيرتي الذاتية") + ".pdf";
}
export const sectionNames = {
  language: "لغة السيرة",
  name: "الاسم",
  headline: "المسمى المستهدف",
  email: "البريد الإلكتروني",
  phone: "رقم الجوال",
  country: "الدولة",
  city: "المدينة",
  linkedin: "LinkedIn",
  github: "GitHub",
  summary: "الملخص المهني",
  education: "التعليم",
  experience: "الخبرات المهنية",
  projects: "المشاريع والتدريب",
  skills: "المهارات",
  courses: "الدورات التدريبية",
  certifications: "الشهادات المهنية",
  volunteering: "التطوع",
  languages: "اللغات",
};
export function readable(value) {
  if (value == null) return "";
  if (Array.isArray(value))
    return value.map(readable).filter(Boolean).join("\n\n");
  if (typeof value === "object")
    return [
      [value.title, value.major, value.organization]
        .filter(Boolean)
        .join(" | "),
      [value.start, value.end, value.month].filter(Boolean).join(" — "),
      value.gpa,
      ...(value.details || []),
      ...(value.achievements || []),
    ]
      .filter(Boolean)
      .join("\n");
  if (value === "ar") return "العربية";
  if (value === "en") return "الإنجليزية";
  return String(value);
}
export function resumeChanges(before, after) {
  return Object.entries(sectionNames)
    .filter(
      ([key]) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]),
    )
    .map(([key, label]) => ({
      key,
      label,
      before: readable(before?.[key]),
      after: readable(after?.[key]),
    }));
}
