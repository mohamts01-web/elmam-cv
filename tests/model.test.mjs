import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyResume,
  sampleResume,
  validateResume,
  validateDesign,
  normalizeCode,
  addRiyadhMonths,
  updateAt,
  TEMPLATES,
} from "../shared/model.mjs";
import { resumeHTML } from "../shared/render.mjs";
test("new and legacy Zid code normalization is compatible", () => {
  assert.equal(normalizeCode(" etm-23ab-4567 "), "23AB4567");
  assert.equal(
    normalizeCode("ETMAM-abcdef123456abcdef123456"),
    "ABCDEF123456ABCDEF123456",
  );
});
test("tailored draft keeps its vacancy metadata on subsequent saves", () => {
  const targetVacancy = { id: 1456, title: "مشرف بيع بالتجزئة" };
  const design = validateDesign({ targetVacancy: { ...targetVacancy, ignored: true } });
  assert.deepEqual(design.targetVacancy, targetVacancy);
  assert.deepEqual(validateDesign({ ...design, fontSize: 12 }).targetVacancy, targetVacancy);
  assert.equal(validateDesign({ targetVacancy: { id: -1, title: "غير صالح" } }).targetVacancy, undefined);
});
test("three calendar months clamp at month end in Riyadh", () => {
  assert.equal(
    new Date(addRiyadhMonths(Date.parse("2026-01-31T20:30:00Z"))).toISOString(),
    "2026-04-30T20:30:00.000Z",
  );
  assert.equal(
    new Date(addRiyadhMonths(Date.parse("2026-11-30T21:15:00Z"))).toISOString(),
    "2027-02-28T21:15:00.000Z",
  );
});
test("validation preserves degree, major, calendar and dates separately", () => {
  const d = validateResume(sampleResume);
  assert.equal(d.education[0].title, "بكالوريوس");
  assert.equal(d.education[0].major, "إدارة الأعمال");
  assert.equal(d.education[0].end, "2022");
  assert.equal(d.education[0].calendar, "gregorian");
});
test("incomplete guest data is allowed but approval needs name and contact", () => {
  assert.doesNotThrow(() => validateResume(emptyResume()));
  assert.throws(() => validateResume(emptyResume(), { complete: true }));
});
test("unsafe links, oversized content and malformed arrays are rejected", () => {
  assert.throws(() =>
    validateResume({ ...sampleResume, linkedin: "javascript:alert(1)" }),
  );
  assert.throws(() =>
    validateResume({ ...sampleResume, summary: "a".repeat(6001) }),
  );
  assert.throws(() => validateResume({ ...sampleResume, skills: "injected" }));
  assert.throws(() =>
    validateResume({
      ...sampleResume,
      education: Array(6).fill({ title: "test" }),
    }),
  );
});
test("patches cannot mutate prototypes", () => {
  assert.throws(() => updateAt({}, "__proto__.bad", true));
  assert.equal({}.bad, undefined);
});
test("design allowlist blocks CSS injection", () => {
  assert.deepEqual(
    validateDesign({
      template: "old",
      accent: "red;body{display:none}",
      fontSize: 50,
      spacing: 20,
    }),
    validateDesign({}),
  );
});
for (const language of ["ar", "en"])
  for (const t of TEMPLATES)
    test(`${language} ${t.id}: HTML escapes inputs and has A4 layout`, () => {
      const html = resumeHTML(
        { ...sampleResume, language, name: "<script>alert(1)</script>" },
        { template: t.id },
      );
      assert.ok(!html.includes("<script>"));
      assert.ok(html.includes("&lt;script&gt;"));
      assert.ok(html.includes("size:A4"));
      assert.ok(html.includes('data-section="education"'));
      assert.ok(html.includes(`dir="${language === "ar" ? "rtl" : "ltr"}"`));
      assert.ok(!html.includes("C:/Windows"));
    });
test("rendering never suppresses actual experience based on profile alone", () => {
  assert.ok(
    resumeHTML({ ...sampleResume, profile: "graduate" }).includes(
      "شركة نموذجية للخدمات",
    ),
  );
});
test("live preview permits partially typed contacts without generating unsafe links", () => {
  const d = {
    ...sampleResume,
    email: "person@",
    phone: "+",
    linkedin: "javascript:alert(1)",
  };
  assert.doesNotThrow(() => resumeHTML(d));
  assert.ok(!resumeHTML(d).includes('href="javascript:'));
});
