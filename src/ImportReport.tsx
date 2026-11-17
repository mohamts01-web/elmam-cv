import { CheckCheck, FileCheck2, ArrowLeft } from "lucide-react";
import { sectionNames } from "../shared/presentation.mjs";
import type { Resume, Job } from "./types";
export type Report = {
  draftId: string;
  content: Resume;
  review: NonNullable<NonNullable<Job["result"]>["review"]>;
  applied: boolean;
};
export function ImportCounts({ data }: { data: Resume }) {
  const counts = [
    "education",
    "experience",
    "projects",
    "skills",
    "courses",
    "certifications",
    "volunteering",
    "languages",
  ].filter((k) => (data[k as "courses"] || []).length);
  return (
    <div className="import-counts">
      {data.summary && <span>الملخص المهني</span>}
      {counts.map((k) => (
        <span key={k}>
          {(sectionNames as Record<string, string>)[k]}{" "}
          <b>{data[k as "courses"].length}</b>
        </span>
      ))}
    </div>
  );
}
export default function ImportReport({
  report,
  busy,
  onReview,
  onSuggestion,
}: {
  report: Report;
  busy: boolean;
  onReview: () => void;
  onSuggestion: (section: string, hasText: boolean) => void;
}) {
  return (
    <div className="import-review-card">
      <h4>
        <FileCheck2 size={18} /> ما قرأناه من سيرتك
      </h4>
      <ImportCounts data={report.content} />
      <p>{report.review.message}</p>
      {!report.applied ? (
        <>
          <p>البيانات جاهزة للمراجعة. لم نغيّر مسودتك بعد.</p>
          <button className="primary full" onClick={onReview}>
            راجع البيانات المستوردة
          </button>
        </>
      ) : (
        <p>
          <CheckCheck size={15} /> حُفظت البيانات التي اعتمدتها في مسودتك.
        </p>
      )}
      <h4>اقتراحات لمسيرتك</h4>
      {report.review.suggestions.map((s, i) => (
        <article className="review-suggestion" key={i}>
          <h5>
            {s.title}
            <span className="suggestion-impact">
              {s.impact === "high" ? "أثر كبير" : "تحسين مقترح"}
            </span>
          </h5>
          <p>{s.reason}</p>
          {report.applied && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                onSuggestion(
                  s.section,
                  (!!report.content.summary && s.section === "summary") ||
                    (["experience", "projects"].includes(s.section) &&
                      (report.content[s.section as "experience"] || []).some(
                        (x) => x.details?.length || x.achievements?.length,
                      )),
                )
              }
            >
              {["summary", "experience", "projects"].includes(s.section)
                ? "راجع اقتراحًا لهذا القسم"
                : "افتح القسم لإكماله"}
              <ArrowLeft size={13} />
            </button>
          )}
        </article>
      ))}
      {report.applied && (
        <small>
          التحسين بالذكاء الاصطناعي يستهلك عملية ناجحة واحدة؛ التعديل اليدوي
          مجاني.
        </small>
      )}
    </div>
  );
}
