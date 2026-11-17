import fs from "node:fs";
import { sampleResume, defaultDesign, TEMPLATES } from "../shared/model.mjs";
import { english } from "../../etmam-cv-bot/fixtures.mjs";
const c = JSON.parse(
  fs.readFileSync(
    "E:/مشاريعي/.elmam-local-data/etmam-web/runtime.local.json",
    "utf8",
  ),
);
fs.mkdirSync("private/pdf-review", { recursive: true });
const results = [];
for (const language of ["ar", "en"])
  for (const template of TEMPLATES) {
    if (results.length)
      await new Promise((resolve) => setTimeout(resolve, 21000));
    const content = structuredClone(language === "ar" ? sampleResume : english);
    content.language = language;
    if (template.id === "compact")
      content.experience = Array.from({ length: 5 }, (_, i) => ({
        ...content.experience[0],
        title: content.experience[0].title + " " + (i + 1),
        details: Array.from(
          { length: 10 },
          () => content.experience[0].details[0],
        ),
      }));
    const r = await fetch(c.rendererUrl + "/render", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + c.rendererSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        design: { ...defaultDesign(), template: template.id },
      }),
      signal: AbortSignal.timeout(65000),
    });
    if (!r.ok) throw Error("render_failed_" + language + "_" + template.id);
    const b = new Uint8Array(await r.arrayBuffer());
    const path = `private/pdf-review/${language}-${template.id}.pdf`;
    fs.writeFileSync(path, b);
    results.push({ language, template: template.id, bytes: b.length, path });
  }
fs.writeFileSync("docs/PDF_MATRIX.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
