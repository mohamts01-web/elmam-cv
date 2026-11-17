import {editorDesign} from './editor.mjs';
export const PLAN = Object.freeze({
  id: "cv-3m",
  priceSAR: 25,
  months: 3,
  maxDrafts: 2,
  aiOperations: 10,
});
export const TEMPLATES = [
  {
    id: "classic",
    name: "الأصلي",
    description: "القالب الأساسي المعتمد، واضح ورسمي.",
  },
  { id: "modern", name: "أفق", description: "عناوين بلون هادئ وتفاصيل مرتبة." },
  {
    id: "compact",
    name: "موجز",
    description: "مساحة أكبر للخبرات مع قراءة مريحة.",
  },
];
export const SECTIONS = [
  ["identity", "بياناتك الشخصية"],
  ["summary", "الملخص المهني"],
  ["experience", "الخبرات المهنية"],
  ["education", "التعليم"],
  ["projects", "المشاريع والتدريب"],
  ["skills", "المهارات"],
  ["courses", "الدورات التدريبية"],
  ["certifications", "الشهادات المهنية"],
  ["volunteering", "التطوع"],
  ["languages", "اللغات"],
];
export const COMMON_SKILLS = [
  "التواصل الفعال",
  "العمل ضمن فريق",
  "حل المشكلات",
  "إدارة الوقت",
  "التكيف مع التغيير",
  "Microsoft Office",
  "التنظيم",
  "التفكير التحليلي",
];
export const COMMON_SKILLS_EN = [
  "Communication",
  "Teamwork",
  "Problem Solving",
  "Time Management",
  "Adaptability",
  "Microsoft Office",
  "Organization",
  "Analytical Thinking",
];
export function languageValue(name, level, language) {
  if (language !== "en") return name + ": " + level;
  const names = { العربية: "Arabic", الإنجليزية: "English" },
    levels = {
      "اللغة الأم": "Native",
      مبتدئ: "Beginner",
      متوسط: "Intermediate",
      متقدم: "Advanced",
      طلاقة: "Fluent",
    };
  return (names[name] || name) + ": " + (levels[level] || level);
}
export const LANGUAGE_LEVELS = [
  "اللغة الأم",
  "مبتدئ",
  "متوسط",
  "متقدم",
  "طلاقة",
];
export function emptyResume() {
  return {
    language: "ar",
    profile: "graduate",
    name: "",
    headline: "",
    email: "",
    phone: "",
    country: "السعودية",
    city: "",
    linkedin: "",
    github: "",
    summary: "",
    education: [],
    experience: [],
    projects: [],
    skills: [],
    courses: [],
    certifications: [],
    volunteering: [],
    languages: [],
  };
}
export function defaultDesign() {
  return { template: "classic", accent: "#0F2D5B", fontSize: 11, spacing: 1.5 };
}
export function normalizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/^(?:ETMAM|ETM)/, "");
}
export function addRiyadhMonths(time, months = 3) {
  const d = new Date(time + 10800000),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(
    Math.min(
      day,
      new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  return d.getTime() - 10800000;
}
const entryFields = [
  "title",
  "major",
  "organization",
  "status",
  "calendar",
  "end",
  "month",
  "start",
  "gpa",
];
export function validateResume(input, { complete = false } = {}) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    JSON.stringify(input).length > 80000
  )
    throw Error("بيانات السيرة غير صالحة أو طويلة جدًا.");
  const d = emptyResume();
  const text = (v, max = 2000) => {
    if (v === undefined || v === null) return "";
    if (
      typeof v !== "string" ||
      v.length > max ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)
    )
      throw Error("راجع طول النص والرموز المدخلة.");
    return v.trim();
  };
  for (const key of [
    "name",
    "headline",
    "email",
    "phone",
    "country",
    "city",
    "linkedin",
    "github",
    "summary",
  ])
    d[key] = text(input[key], key === "summary" ? 6000 : 300);
  if (!["ar", "en"].includes(input.language)) throw Error("اختر لغة السيرة.");
  d.language = input.language;
  if (!["graduate", "experienced", "no_experience"].includes(input.profile))
    throw Error("اختر الحالة المهنية.");
  d.profile = input.profile;
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))
    throw Error("راجع البريد الإلكتروني.");
  if (d.phone && !/^\+?[\d٠-٩\s()-]{8,24}$/.test(d.phone))
    throw Error("راجع رقم الجوال.");
  if (
    d.linkedin &&
    !/^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9%_-]+\/?$/.test(
      d.linkedin,
    )
  )
    throw Error("راجع رابط LinkedIn.");
  if (
    d.github &&
    !/^https:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/.test(d.github)
  )
    throw Error("راجع رابط GitHub.");
  const lines = (v) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > 40)
      throw Error("الحد 40 عنصرًا في القائمة.");
    return v.map((x) => text(x, 1500)).filter(Boolean);
  };
  for (const group of ["education", "experience", "projects"]) {
    const list = input[group] || [];
    if (!Array.isArray(list) || list.length > 5)
      throw Error("الحد خمس إضافات لكل قسم.");
    d[group] = list.map((x) => {
      if (!x || typeof x !== "object") throw Error("إضافة غير صالحة.");
      const r = {};
      for (const k of entryFields)
        if (x[k] !== undefined) r[k] = text(x[k], 300);
      r.details = lines(x.details);
      r.achievements = lines(x.achievements);
      return r;
    });
  }
  for (const group of [
    "skills",
    "courses",
    "certifications",
    "volunteering",
    "languages",
  ])
    d[group] = lines(input[group]);
  if (complete && (!d.name || (!d.email && !d.phone)))
    throw Error("أضف اسمك ووسيلة تواصل واحدة على الأقل لاعتماد السيرة.");
  return d;
}
export function validateDesign(value = {}) {
  const target = value.targetVacancy;
  const targetTitle = typeof target?.title === "string" ? target.title.trim().slice(0, 160) : "";
  return {
    template: TEMPLATES.some((t) => t.id === value.template)
      ? value.template
      : "classic",
    accent: /^#[0-9a-f]{6}$/i.test(value.accent || "")
      ? value.accent
      : "#0F2D5B",
    fontSize: [10, 11, 12].includes(value.fontSize) ? value.fontSize : 11,
    spacing: [1.35, 1.5, 1.65].includes(value.spacing) ? value.spacing : 1.5,
    ...editorDesign(value),
    ...(Number.isSafeInteger(target?.id) && target.id > 0 && target.id <= 999999999999 && targetTitle
      ? { targetVacancy: { id: target.id, title: targetTitle } }
      : {}),
  };
}
export function completeness(d) {
  const v = [
    d.name,
    d.email || d.phone,
    d.headline,
    d.summary,
    d.education?.some((x) => x.title),
    d.profile === "experienced"
      ? d.experience?.some((x) => x.title)
      : d.projects?.some((x) => x.title),
    d.skills?.length,
    d.languages?.length,
  ];
  return Math.round((v.filter(Boolean).length / v.length) * 100);
}
export function updateAt(data, path, value) {
  const next = structuredClone(data),
    parts = path.split(".");
  if (parts.some((x) => ["__proto__", "constructor", "prototype"].includes(x)))
    throw Error("invalid_path");
  let at = next;
  for (const k of parts.slice(0, -1)) {
    if (at[k] === undefined) throw Error("invalid_path");
    at = at[k];
  }
  at[parts.at(-1)] = value;
  return next;
}
export const sampleResume = {
  ...emptyResume(),
  name: "سارة عبدالله",
  headline: "أخصائية عمليات",
  email: "sara@example.com",
  phone: "+966500000000",
  city: "الرياض",
  profile: "experienced",
  summary:
    "أخصائية عمليات مهتمة بتحسين سير العمل وتنظيم البيانات وإعداد التقارير. لدي خبرة في متابعة الطلبات والتنسيق بين فرق العمل، وأسعى إلى المساهمة في فريق يقدّر الدقة والتطوير المستمر.",
  experience: [
    {
      title: "أخصائية عمليات",
      organization: "شركة نموذجية للخدمات",
      start: "2023",
      end: "حتى الآن",
      details: [
        "تنظيم ومتابعة الطلبات اليومية والتنسيق مع الأقسام المعنية.",
        "إعداد تقارير دورية لدعم متابعة سير العمل.",
      ],
      achievements: [],
    },
  ],
  education: [
    {
      title: "بكالوريوس",
      major: "إدارة الأعمال",
      organization: "جامعة نموذجية",
      end: "2022",
      calendar: "gregorian",
      status: "graduated",
    },
  ],
  skills: [
    "تنظيم العمليات",
    "Microsoft Excel",
    "إعداد التقارير",
    "التواصل الفعال",
  ],
  courses: ["تحليل البيانات باستخدام Excel | 2024"],
  languages: ["العربية: اللغة الأم", "الإنجليزية: متقدم"],
};
