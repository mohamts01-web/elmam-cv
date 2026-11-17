import { parseCourse } from "./editor.mjs";
import { emptyResume, validateDesign } from "./model.mjs";
function renderData(input) {
  const d = { ...emptyResume(), ...input };
  d.language = d.language === "en" ? "en" : "ar";
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
    d[key] = typeof d[key] === "string" ? d[key] : "";
  for (const key of [
    "skills",
    "courses",
    "certifications",
    "volunteering",
    "languages",
  ])
    d[key] = Array.isArray(d[key])
      ? d[key].filter((x) => typeof x === "string")
      : [];
  for (const key of ["education", "experience", "projects"])
    d[key] = Array.isArray(d[key])
      ? d[key]
          .filter((x) => x && typeof x === "object")
          .map((x) => ({
            ...x,
            details: Array.isArray(x.details)
              ? x.details.filter((v) => typeof v === "string")
              : [],
            achievements: Array.isArray(x.achievements)
              ? x.achievements.filter((v) => typeof v === "string")
              : [],
          }))
      : [];
  return d;
}
export const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const labels = {
  ar: {
    summary: "الملخص المهني",
    education: "التعليم",
    experience: "الخبرات المهنية",
    projects: "المشاريع والتدريب",
    skills: "المهارات",
    courses: "الدورات التدريبية",
    certifications: "الشهادات المهنية",
    volunteering: "التطوع",
    languages: "اللغات",
  },
  en: {
    summary: "Summary",
    education: "Education",
    experience: "Professional Experience",
    projects: "Projects & Training",
    skills: "Skills",
    courses: "Courses",
    certifications: "Professional Certifications",
    volunteering: "Volunteering",
    languages: "Languages",
  },
};
export function resumeCSS(design = {}, fonts = "") {
  const t = validateDesign(design);
  return `${fonts}*{box-sizing:border-box}html{background:#fff}body{color:#18232d;margin:0;font: ${t.fontSize}pt/${t.spacing} ETMAMCV,Arial,serif;overflow-wrap:break-word;font-synthesis:none}a{color:inherit;text-decoration:none}p{margin:0 0 5pt;white-space:pre-line}header{text-align:center;margin-bottom:14pt}h1{font-size:24pt;line-height:1.4;margin:0 0 5pt}header .contact{font-size:10pt;line-height:1.7}header .headline{font-size:12pt;margin:0 0 5pt}section{margin-top:11pt}h2{font-size:12pt;margin:0 0 6pt;border-bottom:1px solid #60666c;padding-bottom:3pt;break-after:avoid;text-transform:uppercase}.entry{margin:0 0 9pt}.entry-head{display:flex;align-items:baseline;justify-content:space-between;gap:12pt;break-after:avoid}.entry-head strong{flex:1}.entry-date{font-size:10pt;white-space:nowrap}.organization{font-size:10.5pt}ul{margin:3pt 0 5pt;padding-inline-start:17pt}li{margin-bottom:3pt;break-inside:avoid}p,li{orphans:2;widows:2}section:empty{display:none}.modern h1,.modern h2{color:${t.accent}}.modern header{border-inline-start:4pt solid ${t.accent};text-align:start;padding-inline-start:12pt}.modern h2{border-color:${t.accent};padding-bottom:5pt}.compact{font-size:${t.fontSize}pt;line-height:1.35}.compact section{margin-top:8pt}.compact .entry{margin-bottom:5pt}.compact h1{font-size:22pt}.compact h2{border-bottom:.6pt solid #aaa}.compact li{margin-bottom:1pt}.course-date{display:block;font-size:10pt;color:#657685}section.no-bullets ul{list-style:none;padding:0}[data-field]{white-space:pre-wrap}a{overflow-wrap:anywhere}@page{size:A4;margin:12mm}@media screen{body{width:210mm;min-height:297mm;padding:12mm}}@media print{body{padding:0;width:auto;min-height:0}}`;
}
export function resumeBody(input, design = {}) {
  const d = renderData(input),
    t = validateDesign(design),
    ar = d.language === "ar",
    l = labels[d.language];
  const field = (path, text, tag = "span") => {
    text = String(text ?? "");
    const f = t.textFormats[path];
    let value = escape(text);
    if (f?.text === text && f.marks.length) {
      const points = [
        ...new Set([
          0,
          text.length,
          ...f.marks.flatMap((m) => [m.start, m.end]),
        ]),
      ].sort((a, b) => a - b);
      value = points
        .slice(0, -1)
        .map((start, i) => {
          const end = points[i + 1],
            marks = f.marks.filter((m) => m.start <= start && m.end >= end);
          let piece = escape(text.slice(start, end));
          if (marks.some((m) => m.bold))
            piece = "<strong>" + piece + "</strong>";
          if (marks.some((m) => m.italic)) piece = "<em>" + piece + "</em>";
          if (marks.some((m) => m.underline)) piece = "<u>" + piece + "</u>";
          const link = marks.find((m) => m.href);
          if (link)
            piece = '<a href="' + escape(link.href) + '">' + piece + "</a>";
          return piece;
        })
        .join("");
    }
    return (
      "<" +
      tag +
      ' data-field="' +
      path +
      '" dir="auto">' +
      value +
      "</" +
      tag +
      ">"
    );
  };
  const list = (xs, path) =>
    xs?.length
      ? "<ul>" +
        xs
          .map(
            (v, i) =>
              '<li data-item="' +
              path +
              "." +
              i +
              '">' +
              field(path + "." + i, v) +
              "</li>",
          )
          .join("") +
        "</ul>"
      : "";
  const entries = (xs, key) =>
    (xs || [])
      .map((x, i) => {
        if (
          !x.title &&
          !x.organization &&
          !x.details?.length &&
          !x.achievements?.length
        )
          return "";
        const path = key + "." + i;
        return `<article class="entry" data-entry="${path}"><div class="entry-head"><strong>${field(path + ".title", x.title)}${x.major ? " | " + field(path + ".major", x.major) : ""}</strong><span class="entry-date">${x.start ? field(path + ".start", x.start) + " – " : ""}${x.status === "studying" ? (ar ? "متوقع " : "Expected ") : ""}${field(path + ".end", x.end)}${x.month ? " / " + field(path + ".month", x.month) : ""}${x.calendar === "hijri" ? (ar ? " هـ" : " AH") : ""}</span></div><p class="organization">${field(path + ".organization", x.organization)}</p>${x.gpa ? "<p>" + (ar ? "المعدل: " : "GPA: ") + field(path + ".gpa", x.gpa) + "</p>" : ""}${list(x.details, path + ".details")}${list(x.achievements, path + ".achievements")}</article>`;
      })
      .join("");
  const contacts = [];
  if (d.phone) contacts.push(field("phone", d.phone, "bdi"));
  if (d.email)
    contacts.push(
      /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(d.email)
        ? '<a href="mailto:' +
            escape(d.email) +
            '">' +
            field("email", d.email, "bdi") +
            "</a>"
        : field("email", d.email, "bdi"),
    );
  if (d.city) contacts.push(field("city", d.city, "bdi"));
  if (d.country) contacts.push(field("country", d.country, "bdi"));
  if (
    /^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9%_-]+\/?$/.test(d.linkedin)
  )
    contacts.push('<a href="' + escape(d.linkedin) + '">LinkedIn</a>');
  if (/^https:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/.test(d.github))
    contacts.push('<a href="' + escape(d.github) + '">GitHub</a>');
  let html = `<header data-section="identity"><h1>${field("name", d.name)}</h1>${d.headline ? '<p class="headline">' + field("headline", d.headline) + "</p>" : ""}<p class="contact">${contacts.join(" &nbsp;|&nbsp; ")}</p></header>`;
  for (const key of t.order) {
    if (t.hidden.includes(key)) continue;
    let body = "";
    if (key === "summary")
      body = d.summary ? field("summary", d.summary, "p") : "";
    else if (["education", "experience", "projects"].includes(key))
      body = entries(d[key], key);
    else if (key === "courses")
      body = d.courses.length
        ? "<ul>" +
          d.courses
            .map((v, i) => {
              const c = parseCourse(v),
                path = "courses." + i;
              return (
                '<li data-entry="' +
                path +
                '"><strong>' +
                field(path + ".name", c.name) +
                "</strong>" +
                (c.issuer ? " | " + field(path + ".issuer", c.issuer) : "") +
                (c.date
                  ? '<span class="course-date">' +
                    field(path + ".date", c.date) +
                    "</span>"
                  : "") +
                (c.description
                  ? field(path + ".description", c.description, "p")
                  : "") +
                "</li>"
              );
            })
            .join("") +
          "</ul>"
        : "";
    else body = list(d[key], key);
    const layout = t.sections[key] || {};
    if (body)
      html += `<section data-section="${key}"${layout.fontSize ? ' style="font-size:' + layout.fontSize + 'pt"' : ""} class="${layout.bullets === false ? "no-bullets" : ""}"><h2>${l[key]}</h2>${body}</section>`;
  }

  return html;
}
export function resumeHTML(data, design = {}, fonts = "") {
  const d = renderData(data),
    t = validateDesign(design);
  return `<!doctype html><html lang="${d.language}" dir="${d.language === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${escape(d.name)} — ELMAM CV</title><style>${resumeCSS(t, fonts)}</style></head><body class="${t.template}">${resumeBody(d, t)}</body></html>`;
}
