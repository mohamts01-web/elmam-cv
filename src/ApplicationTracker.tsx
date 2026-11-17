import { useState } from "react";
import type { Vacancy } from "./JobTarget";

const stages = {
  saved: "أرغب في التقديم",
  applied: "قدّمت",
  interview: "موعد مقابلة",
  closed: "انتهت المتابعة",
};
type Stage = keyof typeof stages;
type TrackedJob = Pick<Vacancy, "id" | "title" | "company"> & { stage: Stage };
const keyFor = (owner: string) => `elmam.cv.applications.${owner}`;

function readTracker(owner: string): TrackedJob[] {
  try {
    const data = JSON.parse(localStorage.getItem(keyFor(owner)) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data.filter((row) => row && Number.isSafeInteger(row.id) && row.id > 0 &&
      typeof row.title === "string" && (row.company === null || typeof row.company === "string") &&
      Object.hasOwn(stages, row.stage));
  } catch { return []; }
}

function TrackerForm({ job, owner, onChange }: {
  job: Pick<Vacancy, "id" | "title" | "company">;
  owner: string;
  onChange?: (entries: TrackedJob[]) => void;
}) {
  const [stage, setStage] = useState<Stage | "">(() => readTracker(owner).find((row) => row.id === job.id)?.stage ?? "");
  const [status, setStatus] = useState("");
  return <form className="tracker-form" onSubmit={(event) => {
    event.preventDefault();
    try {
      const remaining = readTracker(owner).filter((row) => row.id !== job.id);
      const next = stage ? [{ id: job.id, title: job.title, company: job.company, stage }, ...remaining] : remaining;
      localStorage.setItem(keyFor(owner), JSON.stringify(next));
      setStatus(stage ? "حُفظت حالة التقديم في هذا المتصفح." : "أُزيل الإعلان من المتابعة.");
      onChange?.(next);
    } catch { setStatus("تعذّر حفظ حالة التقديم في هذا المتصفح."); }
  }}>
    <label className="field"><span>حالة التقديم</span>
      <select value={stage} onChange={(event) => { setStage(event.currentTarget.value as Stage | ""); setStatus(""); }}>
        <option value="">بدون متابعة</option>
        {Object.entries(stages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <button className="secondary" type="submit">حفظ حالة التقديم</button>
    <p role="status">{status}</p>
  </form>;
}

export default function ApplicationTracker({ owner, job }: { owner: string; job?: Vacancy }) {
  const [entries, setEntries] = useState(() => readTracker(owner));
  if (job) return <details className="interview-practice"><summary>تابع تقديمك لهذه الوظيفة</summary>
    <p>سجّل ما وصلت إليه. تُحفظ الحالة في هذا المتصفح.</p>
    <TrackerForm key={job.id} job={job} owner={owner} />
  </details>;
  return <section className="interview-library" aria-label="متابعة التقديم">
    <h2>متابعة التقديم</h2>
    {entries.length === 0 ? <p>يمكنك إضافة إعلان إلى المتابعة من صفحة السيرة الخاصة به.</p> : entries.map((entry) => <details className="interview-practice" key={entry.id}>
      <summary>{entry.title} · {stages[entry.stage]}</summary>
      {entry.company && <p>{entry.company}</p>}
      <a href={`/for-job/${entry.id}`}>صفحة تجهيز السيرة لهذه الوظيفة</a>
      <TrackerForm job={entry} owner={owner} onChange={setEntries} />
    </details>)}
  </section>;
}
