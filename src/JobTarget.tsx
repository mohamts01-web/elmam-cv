import { useEffect, useState } from "react";
import { captureCvEvent } from "./analytics";

const jobsOrigin = "https://jobs.cvsira.com";
const route = /^\/for-job\/(\d{1,12})\/?$/;
const storageKey = "elmam.cv.job";
function rememberedJob() {
  try { return sessionStorage.getItem(storageKey) ?? ""; }
  catch { return ""; }
}
export type Vacancy = {
  id: number;
  title: string;
  company: string | null;
  location: string | null;
  qualification: string | null;
  experience: string | null;
  description: string;
  aggregate: boolean;
};

export function useJobTarget(path: string, saved?: { id: number; title: string }) {
  const [id, setId] = useState(() => route.exec(path)?.[1] ?? (path === "/" ? "" : rememberedJob()));
  const [dismissed, setDismissed] = useState("");
  const savedKey = saved ? `${path}:${saved.id}` : "";
  const isDismissed = Boolean(savedKey && dismissed === savedKey);
  const requested = route.exec(path)?.[1] ?? (saved ? (isDismissed ? "" : String(saved.id)) : id);
  const [job, setJob] = useState<Vacancy | null>(null);
  const [unavailableId, setUnavailableId] = useState("");
  useEffect(() => {
    setDismissed("");
    const requested = route.exec(path)?.[1];
    if (requested) setId(requested);
    else if (path === "/") setId("");
  }, [path]);
  useEffect(() => {
    const valid = /^\d{1,12}$/.test(id);
    try {
      if (valid) sessionStorage.setItem(storageKey, id);
      else sessionStorage.removeItem(storageKey);
    } catch { /* Targeting continues in the current page. */ }
  }, [id]);
  useEffect(() => {
    setJob(null);
    setUnavailableId("");
    if (!/^\d{1,12}$/.test(requested)) return;
    const controller = new AbortController();
    fetch(`${jobsOrigin}/api/cv-job/${requested}`, { signal: controller.signal, credentials: "omit" })
      .then(async (response) => {
        if (!response.ok) throw Error("job_unavailable");
        const result: Vacancy = await response.json();
        if (result.id !== Number(requested) || !result.title) throw Error("invalid_job");
        if (!controller.signal.aborted) setJob(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUnavailableId(requested);
      });
    return () => controller.abort();
  }, [requested]);
  const current = job?.id === Number(requested) ? job : null;
  function recordStart() {
    if (!current) return;
    const key = "elmam.cv.started." + current.id;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* A disabled storage policy must not prevent starting a CV. */ }
    captureCvEvent("cv started", current.id);
    void fetch(`${jobsOrigin}/api/cv-job/${current.id}/start`, {
      method: "POST", credentials: "omit", keepalive: true,
      headers: { "Content-Type": "application/json" }, body: "{}",
    }).then(response => {
      if (!response.ok) throw Error("metrics_unavailable");
    }).catch(() => {
      try { sessionStorage.removeItem(key); } catch { /* Storage unavailable. */ }
    });
  }
  return { job: current, loading: Boolean(requested && !current && requested !== unavailableId), saved: isDismissed ? undefined : saved, clear: () => {
    if (savedKey) setDismissed(savedKey);
    else setId("");
  }, recordStart };
}

export function JobTargetCard({ target, compact = false }: {
  target: ReturnType<typeof useJobTarget>;
  compact?: boolean;
}) {
  const { job, loading, saved } = target;
  const Heading = compact ? "h3" : "h1";
  if (!job && compact && saved) return <section className="job-target-card" aria-live="polite">
    <h3>الوظيفة المستهدفة — {saved.title}</h3>
    <p>{loading ? "جارٍ تحميل الإعلان…" : "تعذّر تحميل الإعلان حاليًا. يمكنك متابعة تحرير سيرتك."}</p>
    <button className="text-btn" onClick={target.clear}>إخفاء سياق الإعلان</button>
  </section>;
  if (!job) return compact ? null : (
    <section className="job-target-card" aria-live="polite">
      <Heading>{loading ? "جارٍ تحميل تفاصيل الوظيفة…" : "أنشئ سيرتك الذاتية"}</Heading>
      {!loading && <p>تعذّر تحميل الإعلان حاليًا. تقدر تبدأ بسيرة عامة.</p>}
    </section>
  );
  return (
    <section className="job-target-card">
      <span className="eyebrow">إلمام وظائف · إعلان #{job.id}</span>
      <Heading>{compact ? "الوظيفة المستهدفة — " : "جهّز سيرتك لـ"}{job.title}</Heading>
      <p>{[job.company, job.location].filter(Boolean).join(" · ")}</p>
      {job.aggregate && <p>هذا إعلان مجمّع. تختلف المتطلبات حسب المسمى.</p>}
      {[job.qualification, job.experience].some(Boolean) && (
        <ul>{[job.qualification, job.experience].filter(Boolean).map((value, index) => <li key={index}>{value}</li>)}</ul>
      )}
      {job.description && <details><summary>متطلبات وتفاصيل الإعلان</summary><p className="job-target-description">{job.description}</p></details>}
      <a href={`${jobsOrigin}/j/${job.id}`} target="_blank" rel="noreferrer">عرض الإعلان الأصلي ↗</a>
      {compact && <a className="job-interview-link" href={`/for-job/${job.id}#interview-practice`} target="_blank" rel="noreferrer">افتح تدريب المقابلة ↗</a>}
      {compact && <button className="text-btn" onClick={target.clear}>{saved ? "إخفاء سياق الإعلان" : "إزالة الاستهداف"}</button>}
    </section>
  );
}
