export const SECTION_KEYS = [
  "summary",
  "education",
  "experience",
  "projects",
  "skills",
  "courses",
  "certifications",
  "volunteering",
  "languages",
];
const safeKey =
  /^(?:name|headline|email|phone|city|country|summary|(?:skills|languages|courses|certifications|volunteering)\.\d{1,2}(?:\.(?:name|issuer|date|description))?|(?:education|experience|projects)\.\d\.(?:title|major|organization|start|end|month|gpa|details\.\d{1,2}|achievements\.\d{1,2}))$/;
export function parseCourse(value) {
  const [head = "", ...description] = String(value || "").split("\n");
  const parts = head.split(" | "),
    name = parts.shift() || "";
  const date =
    parts.find((x) =>
      /^(?:[\d٠-٩]{4}(?:[-/][\d٠-٩]{1,2})?|.*[\d٠-٩]{4})$/.test(x.trim()),
    ) || "";
  return {
    name,
    issuer: parts.filter((x) => x !== date).join(" | "),
    date,
    description: description.join("\n"),
  };
}
export function courseText(c) {
  return (
    [c.name, c.issuer, c.date]
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .join(" | ") + (c.description?.trim() ? "\n" + c.description.trim() : "")
  );
}
export function readField(data, path) {
  if (!safeKey.test(path)) return "";
  const p = path.split(".");
  if (p[0] === "courses" && p.length === 3)
    return parseCourse(data.courses?.[Number(p[1])])[p[2]] || "";
  return p.reduce((at, k) => at?.[k], data) ?? "";
}
export function writeField(data, path, value) {
  if (!safeKey.test(path)) throw Error("invalid_path");
  const next = structuredClone(data),
    p = path.split(".");
  if (p[0] === "courses" && p.length === 3) {
    if (!next.courses[Number(p[1])]) throw Error("invalid_path");
    const c = parseCourse(next.courses[Number(p[1])]);
    c[p[2]] = value;
    next.courses[Number(p[1])] = courseText(c);
    return next;
  }
  let at = next;
  for (const k of p.slice(0, -1)) {
    if (at[k] === undefined) throw Error("invalid_path");
    at = at[k];
  }
  at[p.at(-1)] = String(value);
  return next;
}
export function editorDesign(value = {}) {
  const order = [
    ...new Set(
      (Array.isArray(value.order) ? value.order : []).filter((x) =>
        SECTION_KEYS.includes(x),
      ),
    ),
  ];
  const hidden = [
    ...new Set(
      (Array.isArray(value.hidden) ? value.hidden : []).filter((x) =>
        SECTION_KEYS.includes(x),
      ),
    ),
  ];
  /** @type {Record<string,{fontSize?:number,bullets?:boolean}>} */
  const sections = {};
  for (const [k, s] of Object.entries(value.sections || {})) {
    if (!SECTION_KEYS.includes(k) || !s || typeof s !== "object") continue;
    sections[k] = {
      fontSize: [9, 10, 11, 12, 13, 14].includes(s.fontSize)
        ? s.fontSize
        : undefined,
      bullets: typeof s.bullets === "boolean" ? s.bullets : undefined,
    };
  }
  /** @type {Record<string,{text:string,marks:{start:number,end:number,bold:boolean,italic:boolean,underline:boolean,href?:string}[]}>} */
  const textFormats = {};
  for (const [k, f] of Object.entries(value.textFormats || {}).slice(0, 180)) {
    if (JSON.stringify(textFormats).length > 50000) break;
    if (
      !safeKey.test(k) ||
      !f ||
      typeof f.text !== "string" ||
      f.text.length > 2000 ||
      !Array.isArray(f.marks)
    )
      continue;
    const marks = f.marks
      .slice(0, 100)
      .filter(
        (m) =>
          Number.isInteger(m.start) &&
          Number.isInteger(m.end) &&
          m.start >= 0 &&
          m.end > m.start &&
          m.end <= f.text.length,
      )
      .map((m) => ({
        start: m.start,
        end: m.end,
        bold: m.bold === true,
        italic: m.italic === true,
        underline: m.underline === true,
        ...(typeof m.href === "string" &&
        /^(https:\/\/[^\s<>"']+|mailto:[^\s<>"']+)$/.test(m.href) &&
        m.href.length < 500
          ? { href: m.href }
          : {}),
      }));
    textFormats[k] = { text: f.text, marks };
  }
  return {
    order: [...order, ...SECTION_KEYS.filter((k) => !order.includes(k))],
    hidden,
    sections,
    textFormats,
  };
}
export function editItems(data, design, path, index, action) {
  if (
    !/^(?:skills|languages|courses|certifications|volunteering|education|experience|projects|(?:education|experience|projects)\.\d\.(?:details|achievements))$/.test(
      path,
    )
  )
    throw Error("invalid_path");
  const next = structuredClone(data),
    parts = path.split(".");
  let at = next;
  for (const k of parts) at = at?.[k];
  if (
    !Array.isArray(at) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= at.length
  )
    throw Error("invalid_path");
  const order = at.map((_, i) => i),
    limit = ["education", "experience", "projects"].includes(path) ? 5 : 30;
  if (action === "delete") order.splice(index, 1);
  else if (action === "copy") {
    if (at.length >= limit)
      throw Error("الحد الأقصى للإضافات في هذا القسم هو " + limit);
    order.splice(index + 1, 0, index);
  } else if (action === "up" && index > 0)
    [order[index - 1], order[index]] = [order[index], order[index - 1]];
  else if (action === "down" && index < order.length - 1)
    [order[index + 1], order[index]] = [order[index], order[index + 1]];
  const items = order.map((i) => structuredClone(at[i]));
  let parent = next;
  for (const k of parts.slice(0, -1)) parent = parent[k];
  parent[parts.at(-1)] = items;
  const d = editorDesign(design),
    formats = { ...d.textFormats };
  for (const key of Object.keys(formats))
    if (key.startsWith(path + ".")) delete formats[key];
  for (const [newIndex, oldIndex] of order.entries())
    for (const [key, value] of Object.entries(d.textFormats)) {
      const prefix = path + "." + oldIndex;
      if (key === prefix || key.startsWith(prefix + "."))
        formats[path + "." + newIndex + key.slice(prefix.length)] = value;
    }
  return { data: next, design: { ...design, textFormats: formats } };
}
