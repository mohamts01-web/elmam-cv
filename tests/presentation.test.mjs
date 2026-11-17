import test from "node:test";
import assert from "node:assert/strict";
import { pdfFilename, resumeChanges } from "../shared/presentation.mjs";
import { resumeHTML } from "../shared/render.mjs";
import { sampleResume } from "../shared/model.mjs";
test("PDF filename preserves draft title and strips path and control characters", () => {
  assert.equal(pdfFilename("سيرة محمد - عمليات"), "سيرة محمد - عمليات.pdf");
  assert.equal(pdfFilename("Report.pdf"), "Report.pdf");
  assert.equal(pdfFilename("../a\n\\b:*?"), ".. a b.pdf");
});
test("proposal review identifies only changed sections with readable entry content", () => {
  const next = structuredClone(sampleResume);
  next.summary = "صياغة مقترحة";
  next.education[0].major = "تخصص معدل";
  const changes = resumeChanges(sampleResume, next);
  assert.deepEqual(
    changes.map((x) => x.key),
    ["summary", "education"],
  );
  assert.match(changes[1].after, /تخصص معدل/);
});
test("valid email renders a mailto hyperlink, partial and injected values do not", () => {
  assert.match(
    resumeHTML({ ...sampleResume, email: "candidate@example.com" }),
    /href="mailto:candidate@example.com"/,
  );
  assert.doesNotMatch(
    resumeHTML({ ...sampleResume, email: 'bad" onclick="alert(1)' }),
    /href="mailto:/,
  );
});
