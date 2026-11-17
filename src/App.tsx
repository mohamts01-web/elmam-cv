import { useCallback, useEffect, useRef, useState } from "react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  GraduationCap,
  LayoutTemplate,
  Link2,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  Minus,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Wand2,
  X,
  Eye,
  PanelRight,
  BriefcaseBusiness,
  CheckCheck,
  Save,
  Undo2,
} from "lucide-react";
import {
  emptyResume,
  defaultDesign,
  sampleResume,
  SECTIONS,
  TEMPLATES,
  completeness,
  validateResume,
} from "../shared/model.mjs";
import type { Resume, Design, Draft, Account, Job } from "./types";
import { api, auth, emailLoginReady, waitJob, ApiError } from "./api";
import LegalPage, { PolicyLinks } from "./LegalPage";
import WhopPlan from "./WhopPlan";
import type { Session } from "./api";
import Paper from "./Paper";
import InlinePaper from "./InlinePaper";
import {
  writeField,
  readField,
  editItems,
  SECTION_KEYS,
} from "../shared/editor.mjs";
import Fields, { Field } from "./Fields";
import AIReview from "./AIReview";
import { CareerArtwork, TemplateStepIcon } from "./CareerArtwork";
import TailoringExample from "./TailoringExample";
import LinkedInKit from "./LinkedInKit";
import InterviewPractice, { InterviewLibrary } from "./InterviewPractice";
import ApplicationTracker from "./ApplicationTracker";
import type { Vacancy } from "./JobTarget";
import ResumeDiagnosis from "./ResumeDiagnosis";
import ImportReport, { type Report } from "./ImportReport";
import { pdfFilename, resumeChanges } from "../shared/presentation.mjs";
import { useJobTarget, JobTargetCard } from "./JobTarget";
import { captureCvEvent, captureCvVisit } from "./analytics";

const blank = () => emptyResume() as Resume;
function guestSnapshot(): { content: Resume; design: Design; title: string } {
  try {
    if (
      location.pathname === "/try" &&
      new URLSearchParams(location.search).get("example") === "1"
    )
      return {
        content: structuredClone(sampleResume) as Resume,
        design: defaultDesign(),
        title: "سيرة تجريبية",
      };
    const raw = sessionStorage.getItem("etmam.guest.v1");
    if (raw && raw.length < 220000) {
      const s = JSON.parse(raw);
      validateResume({
        ...s.content,
        email: "",
        phone: "",
        linkedin: "",
        github: "",
      });
      return {
        content: s.content,
        design: s.design || defaultDesign(),
        title: String(s.title || "سيرتي الذاتية").slice(0, 120),
      };
    }
  } catch {
    /* Start fresh if the temporary browser draft is invalid. */
  }
  return { content: blank(), design: defaultDesign(), title: "سيرتي الذاتية" };
}
const fmt = (s: string) =>
  new Date(s).toLocaleDateString("ar-SA", { dateStyle: "medium" });
function useRoute() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const f = () => setPath(location.pathname);
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, []);
  const go = useCallback((p: string) => {
    history.pushState({}, "", p);
    setPath(p);
    window.scrollTo(0, 0);
  }, []);
  return [path, go] as const;
}
function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button className="brand" aria-label="إلمام CV" onClick={onClick}>
      <img className="elmam-brand-image" src="/elmam-brand.svg" alt="" width="83" height="40" />
      <span className="brand-en">CV</span>
    </button>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={onClose}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button aria-label="إغلاق" className="icon-btn" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}

const tailoredDraftPrefix = "سيرة مخصصة — ";
const targetRoleStep = -2;
const isTailoredDraft = (draft: Draft) => Boolean(draft.design.targetVacancy) || draft.title.startsWith(tailoredDraftPrefix);

export default function App() {
  const [tailoredOnly, setTailoredOnly] = useState(false);
  const reduceMotion = useReducedMotion();
  const [path, go] = useRoute();
  useEffect(() => captureCvVisit(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [modal, setModal] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [data, setData] = useState<Resume>(() => guestSnapshot().content);
  const [design, setDesign] = useState<Design>(() => guestSnapshot().design);
  const [title, setTitle] = useState(() => guestSnapshot().title);
  const [draft, setDraft] = useState<Draft | null>(null);
  const targetJob = useJobTarget(path, draft && path === `/editor/${draft.id}` ? draft.design.targetVacancy : undefined);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [historyData, setHistoryData] = useState<Resume[]>([]);
  const [panel, setPanel] = useState("content");
  const [section, setSection] = useState("identity");
  const [mobile, setMobile] = useState("preview");
  const [zoom, setZoom] = useState(0.75);
  const [step, setStep] = useState(-1);
  const wizardStage = step === -1 ? 1 : step === targetRoleStep ? 2 : step + 3;
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [assistant, setAssistant] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [proposalBase, setProposalBase] = useState<Draft | null>(null);
  const [proposalTarget, setProposalTarget] = useState<Vacancy | null>(null);
  const [copyError, setCopyError] = useState("");
  const [importReport, setImportReport] = useState<Report | null>(null);
  const [deleteDraft, setDeleteDraft] = useState<Draft | null>(null);
  const [chat, setChat] = useState<{ role: string; text: string }[]>([]);
  const [aiRunning, setAiRunning] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chat, aiRunning]);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setScreenWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const effectiveZoom =
    screenWidth < 650 ? ((zoom / 0.75) * (screenWidth - 32)) / 794 : zoom;
  const fileRef = useRef<HTMLInputElement>(null);
  const importLock = useRef(false);
  const [importFilename, setImportFilename] = useState("");
  const latest = useRef({ data, design, title, draft, dirty });
  latest.current = { data, design, title, draft, dirty };
  const editing = path.startsWith("/editor/") || path === "/try";
  const wizard = path === "/start";
  const paid = !!account?.membership?.active;
  const readonly = !!draft && !paid;
  const notify = (s: string) => {
    setNotice(s);
    setTimeout(() => setNotice(""), 6500);
  };
  const fail = (e: unknown) =>
    setError(e instanceof Error ? e.message : "تعذرت العملية.");
  const refresh = useCallback(async () => {
    const a = await api.me();
    setAccount(a);
    setDrafts(await api.drafts());
  }, []);
  useEffect(() => {
    if (!auth) return;
    auth.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = auth.auth.onAuthStateChange((_, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session) refresh().catch(fail);
    else {
      setAccount(null);
      setDrafts([]);
    }
  }, [session, refresh]);
  useEffect(() => {
    if (!draft)
      try {
        sessionStorage.setItem(
          "etmam.guest.v1",
          JSON.stringify({ content: data, design, title }),
        );
      } catch {
        /* The editor remains usable if browser storage is unavailable. */
      }
  }, [data, design, title, draft]);
  useEffect(() => {
    if (!path.startsWith("/editor/") || !session) return;
    let live = true;
    setBusy(true);
    api
      .getDraft(path.split("/")[2])
      .then((d) => {
        if (live) {
          setDraft(d);
          setData(d.content);
          setDesign(d.design);
          setTitle(d.title);
          setDirty(false);
          setConflict(false);
          setHistoryData([]);
        }
      })
      .catch(fail)
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [path, session]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (latest.current.dirty && latest.current.draft) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  const saveLock = useRef(false);
  const saveNow = useCallback(async () => {
    const s = latest.current;
    if (!s.draft || !s.dirty || saveLock.current) return;
    s.draft = { ...s.draft, content: s.data, design: s.design, title: s.title };
    saveLock.current = true;
    setSaving(true);
    try {
      const saved = await api.save(s.draft);
      setDraft(saved);
      if (
        latest.current.data === s.data &&
        latest.current.design === s.design &&
        latest.current.title === s.title
      )
        setDirty(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(true);
      else fail(e);
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }, []);
  useEffect(() => {
    if (!dirty || !draft || conflict || !paid) return;
    const timer = setTimeout(() => void saveNow(), 1000);
    return () => clearTimeout(timer);
  }, [data, design, title, dirty, draft, conflict, paid, saveNow]);
  useEffect(() => {
    if (!draft || !session) return;
    const timer = setInterval(async () => {
      if (latest.current.dirty || saveLock.current) return;
      try {
        const next = await api.getDraft(latest.current.draft!.id);
        if (
          next.revision !== latest.current.draft!.revision &&
          !latest.current.dirty
        ) {
          setDraft(next);
          setData(next.content);
          setDesign(next.design);
          setTitle(next.title);
          notify("وصل آخر تعديل على مسودتك.");
        }
      } catch {
        /* Keep the existing document during a temporary network failure. */
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [draft?.id, session]);
  const change = (next: Resume) => {
    setHistoryData((h) => [...h.slice(-19), data]);
    setData(next);
    setDirty(true);
    setJob(null);
  };
  const changeDesign = (d: Design) => {
    setDesign(d);
    setDirty(true);
  };
  const chooseSection = useCallback((key: string) => {
    setSection(key);
    setPanel("content");
    setMobile("panel");
  }, []);
  useEffect(() => {
    document.querySelector(".context-panel")?.scrollTo({ top: 0 });
  }, [section, panel]);
  function start(sample = false) {
    if (dirty && draft) {
      setError("احفظ تعديلات المسودة قبل الانتقال.");
      return;
    }
    if (!sample && targetJob.job) targetJob.recordStart();
    else if (!sample) captureCvEvent("cv started");
    setDraft(null);
    setData(sample ? (structuredClone(sampleResume) as Resume) : blank());
    setDesign(defaultDesign());
    setTitle("سيرتي الذاتية");
    setDirty(false);
    setHistoryData([]);
    setStep(-1);
    setPanel("content");
    setSection("identity");
    go(sample || targetJob.job ? "/try" : "/start");
  }
  async function persist() {
    setBusy(true);
    setError("");
    try {
      validateResume(data);
      const d = await api.create(data, design, title);
      setDraft(d);
      setDirty(false);
      await refresh();
      go("/editor/" + d.id);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  function requirePaid() {
    if (!session) {
      setModal("login");
      return false;
    }
    if (!paid) {
      setModal("membership");
      return false;
    }
    return true;
  }
  function openPlansFromEditor() {
    if (editing) {
      try {
        sessionStorage.setItem("elmam.cv.resume-after-payment", path);
      } catch { /* Checkout is still available without browser storage. */ }
    }
    setModal("");
    go("/plans");
  }
  function continueAfterPayment() {
    let destination = "/documents";
    try {
      const saved = sessionStorage.getItem("elmam.cv.resume-after-payment");
      if (saved === "/try" || (saved && /^\/editor\/[0-9a-f-]{36}$/i.test(saved)))
        destination = saved;
      sessionStorage.removeItem("elmam.cv.resume-after-payment");
    } catch { /* Open the signed-in user's documents as a fallback. */ }
    go(destination);
  }
  async function saveOrActivate() {
    if (!requirePaid()) return;
    if (draft) await saveNow();
    else await persist();
  }
  async function exportPDF() {
    if (!requirePaid() && !(draft && account?.membership)) return;
    if (!draft) {
      setError("احفظ المسودة أولًا ثم اعتمدها للتنزيل.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let d = draft;
      if (paid) {
        await saveNow();
        if (latest.current.dirty)
          throw Error("احفظ التعديلات وحل تعارض الحفظ قبل التصدير.");
        validateResume(latest.current.data, { complete: true });
        d = await api.approve(latest.current.draft!);
        setDraft(d);
      }
      const result = await waitJob(await api.startJob("export", d));
      if (result.state !== "completed")
        throw Error(result.error || "تعذر التصدير الآن.");
      if (result.result?.downloadUrl) {
        const a = document.createElement("a");
        const response = await fetch(result.result.downloadUrl);
        if (!response.ok) throw Error("تعذر تنزيل الملف. حاول مجددًا.");
        const blobUrl = URL.createObjectURL(await response.blob());
        a.href = blobUrl;
        a.download = pdfFilename(latest.current.title);
        a.rel = "noopener";
        a.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      } else throw Error("ملف التنزيل غير متاح.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function runAI(
    kind: string,
    extra: Record<string, unknown> = {},
    target = latest.current.draft,
    vacancy: Vacancy | null = null,
  ) {
    if (aiRunning) return;
    if (!requirePaid()) return;
    if (!target) {
      setError("احفظ مسودتك أولًا قبل استخدام المساعد.");
      return;
    }
    setBusy(true);
    setAiRunning(true);
    setPanel("assistant");
    setMobile("panel");
    setJob(null);
    const requestTarget = vacancy ?? (kind === "chat" ? targetJob.job : null);
    setProposalTarget(requestTarget);
    setCopyError("");
    setReviewOpen(false);
    setError("");
    const prompt =
      kind === "chat"
        ? String(extra.message)
        : kind === "translate"
          ? "ترجمة السيرة"
          : kind === "import"
            ? "استيراد سيرة موجودة"
            : extra.section === "summary"
              ? "تحسين الملخص المهني"
              : vacancy ? "تخصيص السيرة لوظيفة " + vacancy.title : "تحسين صياغة السيرة";
    setChat((h) => [...h, { role: "user", text: prompt }]);
    try {
      await saveNow();
      if (latest.current.dirty) throw Error("احفظ تعديلاتك قبل المتابعة.");
      const requestDraft =
        latest.current.draft?.id === target.id ? latest.current.draft : target;
      setProposalBase(requestDraft);
      const result = await waitJob(
        await api.startJob(
          kind,
          latest.current.draft?.id === target.id
            ? latest.current.draft
            : target,
          {
            consent: true,
            history: chat.slice(-8),
            ...(requestTarget
              ? { jobTarget: requestTarget }
              : {}),
            ...extra,
          },
        ),
      );
      setJob(result);
      if (kind === "import" && result.result?.content && result.result.review)
        setImportReport({
          draftId: target.id,
          content: result.result.content,
          review: result.result.review,
          applied: false,
        });
      await refresh();
      if (result.state !== "completed")
        throw Error(result.error || "تعذرت العملية. لم يُخصم رصيدها.");
      if (result.result?.content) {
        const changes = resumeChanges(
          requestDraft.content,
          result.result.content,
        );
        setChat((h) => [
          ...h,
          {
            role: "assistant",
            text: changes.length
              ? "الاقتراح جاهز. شمل: " +
                changes.map((c: { label: string }) => c.label).join("، ") +
                ". راجعه قبل الاعتماد."
              : "راجعت السيرة ولم تتغير بياناتها.",
          },
        ]);
        setReviewOpen(true);
      } else if (result.result?.message)
        setChat((h) => [
          ...h,
          { role: "assistant", text: result.result!.message! },
        ]);
      setAssistant("");
    } catch (e) {
      fail(e);
      setChat((h) => [
        ...h,
        {
          role: "assistant",
          text: "تعذرت العملية. لم يُخصم رصيدها؛ يمكنك المحاولة مجددًا.",
        },
      ]);
    } finally {
      setBusy(false);
      setAiRunning(false);
    }
  }
  async function importFile(file: File) {
    if (importLock.current) return;
    if (!requirePaid()) return;
    const createsDraft = path === "/documents" || path === "/start" || !latest.current.draft;
    const limit = account?.membership?.maxDrafts ?? 2;
    if (createsDraft && drafts.length >= limit) {
      setError(`وصلت إلى حد المسودات (${limit}). افتح مسودة إذا أردت مراجعة الاستيراد فيها.`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("الحد الأقصى للملف 5 ميجابايت.");
      return;
    }
    importLock.current = true;
    setImportFilename(file.name);
    async function destination() {
      let target = latest.current.draft;
      if (createsDraft || !target) {
        target = await api.create(
          blank(),
          defaultDesign(),
          file.name.replace(/\.[^.]+$/, ""),
        );
        setDraft(target);
        setData(target.content);
        setDesign(target.design);
        setTitle(target.title);
        setDirty(false);
        latest.current = {
          data: target.content,
          design: target.design,
          title: target.title,
          draft: target,
          dirty: false,
        };
        await refresh();
        go("/editor/" + target.id);
      }
      return target;
    }
    try {
      if (["image/png", "image/jpeg"].includes(file.type)) {
        const buffer = await file.arrayBuffer();
        let binary = "";
        for (const b of new Uint8Array(buffer))
          binary += String.fromCharCode(b);
        await runAI(
          "import",
          {
            file: { name: file.name, mime: file.type, base64: btoa(binary) },
          },
          await destination(),
        );
        return;
      }
      let text = "";
      if (/\.pdf$/i.test(file.name)) {
        const pdf = await import("pdfjs-dist");
        pdf.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const doc = await pdf.getDocument({ data: await file.arrayBuffer() })
          .promise;
        if (doc.numPages > 10) throw Error("الحد الأقصى 10 صفحات.");
        for (let i = 1; i <= doc.numPages; i++)
          text +=
            (await (await doc.getPage(i)).getTextContent()).items
              .map((x) => ("str" in x ? x.str : ""))
              .join(" ") + "\n";
        if (!text.trim())
          throw Error("هذا PDF مصوّر. أرفق الصفحات كصور واضحة للاستيراد.");
      } else if (/\.docx$/i.test(file.name)) {
        const mammoth = await import("mammoth");
        text = (
          await mammoth.extractRawText({
            arrayBuffer: await file.arrayBuffer(),
          })
        ).value;
      } else throw Error("اختر PDF أو DOCX أو صورة PNG/JPG.");
      if (!text.trim()) throw Error("لم نجد نصًا قابلًا للقراءة في الملف.");
      await runAI("import", { text: text.slice(0, 30000) }, await destination());
    } catch (e) {
      fail(e);
    } finally {
      importLock.current = false;
      setImportFilename("");
    }
  }
  const groupSections = [
    ["identity"],
    ["summary"],
    [data.profile === "experienced" ? "experience" : "projects"],
    ["education"],
    ["skills", "languages", "courses", "certifications", "volunteering"],
  ];
  const header = (
    <header className="site-header">
      <div className="container nav">
        <Brand onClick={() => go("/")} />
        <nav>
          <a href="/#how">كيف تعمل؟</a>
          <a href="/#templates">القوالب</a>
          <a
            href="/plans"
            onClick={(e) => {
              e.preventDefault();
              go("/plans");
            }}
          >
            الباقة
          </a>
        </nav>
        <div className="nav-actions">
          {session ? (
            <>
              <button className="text-btn" onClick={() => go("/documents")}>
                مسوداتي
              </button>
              <button
                className="icon-btn"
                aria-label="حسابي"
                onClick={() => setModal("membership")}
              >
                <UserRound size={20} />
              </button>
            </>
          ) : (
            <button className="text-btn" onClick={() => setModal("login")}>
              تسجيل الدخول
            </button>
          )}
          <button className="primary small" onClick={() => start()}>
            أنشئ سيرتك <ArrowLeft size={16} />
          </button>
        </div>
      </div>
    </header>
  );
  return (
    <>
      {!editing && header}
      {!emailLoginReady && !session && !editing && (
        <div className="preview-notice">
          الموقع متاح للمعاينة حاليًا. خدمة البوت متاحة للمشتركين حتى تجهيز
          الدخول بالبريد.{" "}
          <a href="https://t.me/etmam_cv_bot" target="_blank" rel="noreferrer">
            افتح بوت إلمام CV ←
          </a>
        </div>
      )}
      {path.startsWith("/for-job/") && (
        <main className="container job-target-landing">
          <JobTargetCard target={targetJob} />
          <div className="hero-actions">
            <button className="primary large" disabled={targetJob.loading} onClick={() => start()}>
              {targetJob.job ? "ابدأ سيرتي لهذه الوظيفة" : "ابدأ سيرتي"} <ArrowLeft size={18} />
            </button>
            {session ? (
              <button className="secondary large" onClick={() => { targetJob.recordStart(); go("/documents"); }}>استخدم مسودة موجودة</button>
            ) : (
              <button className="secondary large" onClick={() => setModal("login")}>ادخل إلى مسوداتك</button>
            )}
          </div>
          <p>ابدأ وعاين مجانًا. التحسين بالذكاء الاصطناعي وتنزيل PDF ضمن الباقة.</p>
          {targetJob.job && <InterviewPractice key={`${session?.user.id ?? "guest"}:${targetJob.job.id}`} vacancy={targetJob.job} owner={session?.user.id ?? "guest"} />}
          {targetJob.job && <ApplicationTracker key={session?.user.id ?? "guest"} job={targetJob.job} owner={session?.user.id ?? "guest"} />}
        </main>
      )}
      {path === "/" && (
        <>
          <main className="cv-home">
            <section className="hero container">
              <div className="hero-copy">
                <span className="eyebrow">
                  <span className="dot" />
                  خطوتك القادمة تبدأ هنا
                </span>
                <h1>
                  أنشئ سيرة ذاتية
                  <br />
                  <em>تناسب فرصتك القادمة</em>
                </h1>
                <p>
                  اختر قالبًا عربيًا أو إنجليزيًا، وشاهد سيرتك تتشكل أثناء الكتابة. يمكنك متابعة مسودتك من الموقع أو تيليجرام.
                </p>
                <div className="hero-actions">
                  <button className="primary large" onClick={() => start()}>
                    ابدأ بكتابة سيرتك <ArrowLeft size={19} />
                  </button>
                  <button
                    className="secondary large"
                    onClick={() => start(true)}
                  >
                    <Eye size={18} />
                    جرّب المحرر
                  </button>
                </div>
                <div className="hero-trust">
                  <span>
                    <CheckCircle2 size={16} />
                    معاينة مجانية
                  </span>
                  <span>
                    <CheckCircle2 size={16} />
                    قوالب عربية وإنجليزية
                  </span>
                  <span>
                    <CheckCircle2 size={16} />
                    بياناتك تحت تحكمك
                  </span>
                </div>
              </div>
              <LazyMotion features={domAnimation}>
              <m.div className="hero-art hero-plotter"
                initial={reduceMotion ? false : { y: 12 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}>
                <div className="hero-backdrop" aria-hidden="true" />
                <CareerArtwork />
              </m.div>
              </LazyMotion>
            </section>
            <div className="trust-strip">
              <div className="container">
                <strong>٣ قوالب مختارة</strong>
                <i />
                <strong>لغتان، نفس العناية</strong>
                <i />
                <strong>PDF جاهز للمشاركة</strong>
              </div>
            </div>
            <section className="section container" id="how">
              <span className="eyebrow">من الفكرة إلى الفرصة</span>
              <h2>بخطوات بسيطة… سيرتك جاهزة</h2>
              <div className="three-cards">
                {[
                  [
                    UserRound,
                    "عرّفنا عليك",
                    "أسئلة تناسب مرحلتك المهنية، دون تعقيد.",
                  ],
                  [
                    LayoutTemplate,
                    "اجعلها بطريقتك",
                    "عدّل المحتوى واختر قالبك، وشاهد التغيير فورًا.",
                  ],
                  [
                    Download,
                    "راجعها وانطلق",
                    "اعتمد بياناتك وحمّل سيرتك بصيغة PDF.",
                  ],
                ].map(([Icon, t, s], i) => {
                  const C = Icon as typeof UserRound;
                  return (
                    <article key={i}>
                      <div className="step-top">
                        <span>0{i + 1}</span>
                        <TemplateStepIcon step={i} />
                      </div>
                      <h3>{t as string}</h3>
                      <p>{s as string}</p>
                    </article>
                  );
                })}
              </div>
            </section>
            <TailoringExample />
            <section className="templates-section" id="templates">
              <div className="container">
                <span className="eyebrow">المحتوى أولًا. والتصميم يخدمه.</span>
                <h2>ثلاثة قوالب، حضور مختلف</h2>
                <div className="template-gallery">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        start(true);
                        setDesign({ ...defaultDesign(), template: t.id });
                      }}
                    >
                      <div className="template-preview">
                        <Paper
                          data={sampleResume as Resume}
                          design={{ ...defaultDesign(), template: t.id }}
                          zoom={0.28}
                        />
                      </div>
                      <strong>{t.name}</strong>
                      <small>{t.description}</small>
                      <span>
                        استكشف القالب <ArrowLeft size={15} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <section className="section container bot-section">
              <div className="bot-symbol">
                <Send size={57} />
                <span>ELMAM CV</span>
              </div>
              <div>
                <span className="eyebrow">أكمل من المكان الذي يناسبك</span>
                <h2>ابدأ هنا. أكمل في تيليجرام.</h2>
                <p>
                  اربط حسابك مرة واحدة، واستعد مسوداتك وباقتك ورصيدك من الموقع
                  أو البوت.
                </p>
                <a
                  className="secondary"
                  href="https://t.me/etmam_cv_bot"
                  target="_blank"
                  rel="noreferrer"
                >
                  افتح بوت إلمام CV <ArrowLeft size={17} />
                </a>
              </div>
            </section>
            <section className="container final-cta">
              <div>
                <h2>كل ما تحتاجه لتبدأ بثقة.</h2>
                <p>مسودة محفوظة · ٣ عمليات ذكاء اصطناعي · ٣٠ يومًا</p>
              </div>
              <button className="primary large" onClick={() => go("/plans")}>
                اكتشف الباقة — ١٠ ريالات <ArrowLeft size={17} />
              </button>
            </section>
            <section className="section container" aria-labelledby="cv-guides-heading">
              <h2 id="cv-guides-heading">أدلة كتابة السيرة الذاتية</h2>
              <nav className="cv-guide-links" aria-label="أدلة السيرة الذاتية">
                <a href="/ats-resume/">سيرة ذاتية متوافقة مع ATS <ArrowLeft size={17} /></a>
                <a href="/graduate-resume/">سيرة ذاتية لحديثي التخرج <ArrowLeft size={17} /></a>
                <a href="/english-resume/">سيرة ذاتية بالإنجليزية <ArrowLeft size={17} /></a>
              </nav>
            </section>
            <section className="section container faq">
              <h2>قد تتساءل</h2>
              {[
                [
                  "هل يمكنني تجربة الموقع مجانًا؟",
                  "نعم، يمكنك إدخال بياناتك ومعاينة السيرة. الحفظ الدائم والاستيراد والذكاء الاصطناعي والتنزيل تحتاج تفعيل باقة.",
                ],
                [
                  "هل أحتاج شراء باقتين للموقع والبوت؟",
                  "لا. اربط الحسابين لتستخدم نفس الباقة والمسودات والرصيد.",
                ],
                [
                  "ماذا يحدث بعد انتهاء الباقة؟",
                  "يمكنك عرض المسودات وتنزيل النسخ المعتمدة سابقًا. استئناف التعديل والذكاء الاصطناعي يحتاج التجديد.",
                ],
              ].map(([q, a]) => (
                <details key={q}>
                  <summary>
                    {q}
                    <Plus size={18} />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </section>
          </main>
          <footer className="site-footer container">
            <Brand onClick={() => go("/")} />
            <p>إلمام CV · سيرتك بالعربية والإنجليزية</p>
            <PolicyLinks />
            <a href="https://t.me/mohamdto21" target="_blank" rel="noreferrer">
              الدعم والمساعدة
            </a>
          </footer>
        </>
      )}
      {path === "/plans" && (
        <main className="container plans-page">
          <header className="plan-heading">
            <h1>جهّز سيرتك لفرصتك القادمة</h1>
            <p className="muted">أنشئ سيرة عربية أو إنجليزية، حسّن صياغتها، ونزّلها PDF جاهزة للتقديم.</p>
          </header>
          <WhopPlan key={session?.user.id ?? "guest"} userId={session?.user.id}
            onSignIn={() => setModal("login")} onPaid={refresh}
            onContinue={continueAfterPayment} referralJobId={targetJob.job?.id} />
          <section className="zid-telegram-info">
            <h2>أكمل سيرتك من تيليجرام</h2>
            <p>اربط حسابك بالبوت لتفتح المسودة نفسها وتستخدم رصيدك من الموقع أو تيليجرام.</p>
            <a className="secondary" href="https://t.me/etmam_cv_bot" target="_blank" rel="noreferrer">
              <MessageCircle size={18} /> افتح بوت إلمام CV
            </a>
          </section>
          <p className="plan-code">
            سبق واشتريت من متجر إتمام؟{" "}
            <button className="text-btn" onClick={() => setModal(session ? "membership" : "login")}>
              فعّل كودك
            </button>
          </p>
          <PolicyLinks />
        </main>
      )}
      {["/terms", "/privacy", "/refunds", "/contact"].includes(path) && (
        <LegalPage slug={path.slice(1)} />
      )}
      {path === "/documents" && (
        <main className="container documents-page">
          <div className="page-heading">
            <div>
              <span className="eyebrow">مساحتك المهنية</span>
              <h1>مسوداتك، جاهزة لخطوتك القادمة.</h1>
              <p className="muted">أنشئ وعدّل، أو أكمل ما بدأته في تيليجرام.</p>
            </div>
            <div className="document-entry-actions">
              <a
                className="secondary"
                href="https://t.me/etmam_cv_bot"
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={18} />
                أكمل في تيليجرام
              </a>
              <button
                className="secondary"
                onClick={() => {
                  if (requirePaid()) fileRef.current?.click();
                }}
              >
                <Upload size={18} />
                استيراد سيرة
              </button>
              <button className="primary" onClick={() => start()}>
                <Plus size={18} />
                سيرة جديدة
              </button>
            </div>
          </div>
          {!session ? (
            <div className="empty">
              <UserRound size={36} />
              <h2>مسوداتك محفوظة لحسابك</h2>
              <p>سجّل الدخول لاستعادتها وربط حساب تيليجرام.</p>
              <button className="primary" onClick={() => setModal("login")}>
                تسجيل الدخول
              </button>
            </div>
          ) : (
            <>
              <div className="membership-strip">
                <span>
                  {account?.membership
                    ? paid
                      ? "باقتك فعّالة حتى " + fmt(account.membership.expires)
                      : "انتهت مدة التحرير"
                    : "لم تُفعّل الباقة بعد"}
                </span>
                <span>
                  {account?.membership?.aiRemaining ?? 0} عملية متبقية
                </span>
                <button
                  className="text-btn"
                  onClick={() => setModal("membership")}
                >
                  باقتي والربط <ArrowLeft size={15} />
                </button>
              </div>
              <div className="draft-library-filter" role="group" aria-label="تصفية المسودات">
                <button className="secondary" aria-pressed={!tailoredOnly} onClick={() => setTailoredOnly(false)}>كل المسودات</button>
                <button className="secondary" aria-pressed={tailoredOnly} onClick={() => setTailoredOnly(true)}>السير المخصصة للوظائف</button>
              </div>
              {tailoredOnly && !drafts.some(isTailoredDraft) && <p>ستظهر هنا المسودات التي تحفظها كنسخ مخصصة من مراجعة اقتراحات الوظيفة.</p>}
              <div className="draft-grid">
                {drafts.filter((d) => !tailoredOnly || isTailoredDraft(d)).map((d) => (
                  <article className="draft-card" key={d.id}>
                    <button
                      className="draft-thumb"
                      onClick={() => go("/editor/" + d.id)}
                    >
                      <Paper data={d.content} design={d.design} zoom={0.29} />
                    </button>
                    <div className="draft-card-bottom">
                      <div>
                        <h3>{d.title}</h3>
                        <small>آخر تعديل {fmt(d.updated_at)}</small>
                        {d.design.targetVacancy && <small className="draft-target-label">الوظيفة: {d.design.targetVacancy.title}</small>}
                      </div>
                      <button
                        className="icon-btn"
                        aria-label={"حذف " + d.title}
                        onClick={() => setDeleteDraft(d)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </article>
                ))}
                {!tailoredOnly && drafts.length < (account?.membership?.maxDrafts || 2) && (
                  <button className="new-draft" onClick={() => start()}>
                    <Plus size={32} />
                    <strong>ابدأ سيرة جديدة</strong>
                    <span>{drafts.length} من {account?.membership?.maxDrafts ?? 2} مسودة</span>
                  </button>
                )}
              </div>
            </>
          )}
          <InterviewLibrary key={session?.user.id ?? "guest"} owner={session?.user.id ?? "guest"} />
          <ApplicationTracker key={session?.user.id ?? "guest"} owner={session?.user.id ?? "guest"} />
        </main>
      )}
      {wizard && (
        <main className="wizard container">
          <div className="wizard-top">
            <button
              className="text-btn"
              onClick={() => {
                if (step === -1) go("/");
                else if (step === targetRoleStep) setStep(-1);
                else setStep(step === 0 ? targetRoleStep : step - 1);
              }}
            >
              <ArrowRight size={17} />
              رجوع
            </button>
            <span>
              {step === targetRoleStep ? "وظيفتك المستهدفة" : step < 0
                ? "لنبدأ بما يناسبك"
                : step < 5
                  ? "الخطوة " + (step + 1) + " من ٥"
                  : "المراجعة الأخيرة"}
            </span>
            <button className="text-btn" onClick={() => go("/try")}>
              فتح المحرر <ArrowLeft size={17} />
            </button>
          </div>
          <div className="wizard-progress" role="progressbar" aria-label="تقدّم إعداد السيرة" aria-valuenow={wizardStage} aria-valuemin={0} aria-valuemax={8}>
            <span style={{ width: (wizardStage / 8) * 100 + "%" }} />
          </div>
          {step === -1 ? (
            <section className="status-step">
              <span className="eyebrow">سيرة تعكس مرحلتك</span>
              <h1>أين أنت في مسيرتك الآن؟</h1>
              <p className="muted">سنرتّب الأسئلة بناءً على إجابتك.</p>
              <div className="onboarding-import" onDragOver={(event) => {
                if (!event.dataTransfer.types.includes("Files")) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = importLock.current ? "none" : "copy";
              }} onDrop={(event) => {
                if (!event.dataTransfer.files.length) return;
                event.preventDefault();
                if (importLock.current) return;
                if (event.dataTransfer.files.length !== 1) {
                  setError("اختر ملف سيرة واحدًا للاستيراد.");
                  return;
                }
                void importFile(event.dataTransfer.files[0]);
              }} aria-busy={!!importFilename}>
                <div><h2>عندك سيرة جاهزة؟</h2><p>اسحب الملف هنا أو اختره من جهازك. يدعم الاستيراد PDF وDOCX وPNG وJPG حتى ٥ ميجابايت، وهو ضمن الباقة.</p></div>
                {paid && drafts.length >= (account?.membership?.maxDrafts ?? 2) ? (
                  <><p>مسوداتك ممتلئة. يمكنك فتح إحدى مسوداتك ومراجعة الاستيراد داخلها.</p><button type="button" className="secondary" onClick={() => go("/documents")}>عرض مسوداتي</button></>
                ) : <button type="button" className="secondary" disabled={!!importFilename} onClick={() => { if (requirePaid()) fileRef.current?.click(); }}><Upload size={18} /> استيراد سيرة</button>}
              </div>
              {importFilename && <p className="onboarding-import-status" role="status">جارٍ قراءة <bdi>{importFilename}</bdi>…</p>}
              <div className="status-options">
                {[
                  [
                    "graduate",
                    "طالب أو حديث تخرج",
                    "لنركز على تعليمك ومشاريعك ومهاراتك.",
                    GraduationCap,
                  ],
                  [
                    "experienced",
                    "لدي خبرة مهنية",
                    "لنبرز مسارك ومسؤولياتك وإنجازاتك.",
                    BriefcaseBusiness,
                  ],
                  [
                    "no_experience",
                    "باحث عن عمل دون خبرة",
                    "لنبدأ بما تتقنه وبالفرصة التي تستهدفها.",
                    UserRound,
                  ],
                ].map(([id, t, s, Icon]) => {
                  const C = Icon as typeof UserRound;
                  return (
                    <button
                      className={data.profile === id ? "selected" : ""}
                      key={id as string}
                      onClick={() => {
                        change({ ...data, profile: id as Resume["profile"] });
                        setStep(targetRoleStep);
                      }}
                    >
                      <C />
                      <strong>{t as string}</strong>
                      <span>{s as string}</span>
                      <ArrowLeft size={18} />
                    </button>
                  );
                })}
              </div>
              <label className="field language-select">
                <span>لغة السيرة</span>
                <select
                  value={data.language}
                  onChange={(e) =>
                    change({ ...data, language: e.target.value as "ar" | "en" })
                  }
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </label>
            </section>
          ) : step === targetRoleStep ? (
            <section className="status-step onboarding-role">
              <h1>ما الوظيفة التي تستهدفها؟</h1>
              <p className="muted">إذا أدخلت مسمّى، سيظهر تحت اسمك في السيرة. يمكنك تعديله لاحقًا أو ترك الحقل فارغًا الآن.</p>
              <form onSubmit={(event) => { event.preventDefault(); setStep(0); }}>
                <label className="field">
                  <span>المسمّى المستهدف (اختياري)</span>
                  <input dir="auto" maxLength={120} value={data.headline} onChange={(event) => change({ ...data, headline: event.currentTarget.value })} placeholder={data.language === "ar" ? "مثال: أخصائي عمليات" : "e.g. Operations Specialist"} />
                </label>
                <button className="primary" type="submit">{data.headline.trim() ? "متابعة" : "تخطّي الآن"}<ArrowLeft size={16} /></button>
              </form>
            </section>
          ) : step < 5 ? (
            <div className="wizard-body">
              <aside>
                <span className="eyebrow">
                  {
                    [
                      "عرّف عن نفسك",
                      "قصتك المهنية",
                      "المسار المهني",
                      "خلفيتك الأكاديمية",
                      "ما الذي يميزك؟",
                    ][step]
                  }
                </span>
                <h1>
                  {
                    [
                      "لنبدأ بالتعارف.",
                      "دع خبرتك تتحدث.",
                      "كل خطوة لها قيمة.",
                      "أساس رحلتك.",
                      "مهارات تصنع الفرق.",
                    ][step]
                  }
                </h1>
                <p>
                  يمكنك تعديل جميع التفاصيل في المحرر لاحقًا. أضف ما ينطبق عليك
                  فقط.
                </p>
                <div className="tip">
                  <Sparkles size={18} />
                  بيانات صادقة وواضحة تصنع سيرة أفضل.
                </div>
              </aside>
              <div className="wizard-fields">
                {groupSections[step].map((s) => (
                  <div key={s}>
                    <h3>{SECTIONS.find((x) => x[0] === s)?.[1]}</h3>
                    <Fields data={data} section={s} onChange={change} />
                  </div>
                ))}
                <button
                  className="primary full"
                  onClick={() => {
                    try {
                      if (
                        step === 0 &&
                        (!data.name || (!data.email && !data.phone))
                      )
                        throw Error("أضف الاسم ووسيلة تواصل واحدة على الأقل.");
                      validateResume(data);
                      setStep(step + 1);
                    } catch (e) {
                      fail(e);
                    }
                  }}
                >
                  التالي <ArrowLeft size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div className="review-step">
              <span className="eyebrow">
                {completeness(data)}٪ من بياناتك مكتملة
              </span>
              <h1>مراجعة أخيرة، ثم إلى المحرر.</h1>
              <p className="muted">
                راجع ما كتبته، وأكمل أي تفاصيل في الخطوة التالية.
              </p>
              <div className="review-list">
                {[
                  ["الاسم", data.name],
                  ["المسمى", data.headline],
                  ["الخبرات", String(data.experience.length)],
                  ["التعليم", String(data.education.length)],
                  ["المهارات", String(data.skills.length)],
                  ["اللغات", data.languages.join("، ")],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <strong>{v || "لم يُضف"}</strong>
                  </div>
                ))}
              </div>
              <button
                className="primary"
                onClick={() => {
                  setSection("identity");
                  go("/try");
                }}
              >
                افتح محرر سيرتك <ArrowLeft size={18} />
              </button>
            </div>
          )}
        </main>
      )}
      {editing && (
        <div className="workspace">
          <header className="editor-header">
            <div className="editor-document">
              <button
                className="icon-btn"
                aria-label="العودة"
                onClick={() => {
                  if (dirty && draft) {
                    setError("احفظ تعديلاتك قبل مغادرة المحرر.");
                    return;
                  }
                  go(session ? "/documents" : "/");
                }}
              >
                <ArrowRight size={19} />
              </button>
              <Brand onClick={() => go("/")} />
              <span className="header-divider" />
              <input
                aria-label="اسم المستند"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
                disabled={readonly}
              />
              <span className="save-status">
                {saving ? (
                  <Loader2 className="spin" size={14} />
                ) : dirty ? (
                  <span className="dot amber" />
                ) : (
                  <CheckCheck size={15} />
                )}{" "}
                {saving
                  ? "جارٍ الحفظ"
                  : draft
                    ? dirty
                      ? "تعديلات غير محفوظة"
                      : "محفوظة"
                    : "معاينة للزائر"}
              </span>
            </div>
            <div className="editor-actions">
              <button
                className="icon-btn"
                aria-label="تراجع"
                disabled={!historyData.length || readonly}
                onClick={() => {
                  setData(historyData.at(-1)!);
                  setHistoryData((h) => h.slice(0, -1));
                  setDirty(true);
                }}
              >
                <Undo2 size={18} />
              </button>
              <button
                className="secondary small"
                disabled={busy || saving || readonly}
                onClick={() => void saveOrActivate()}
              >
                <Save size={16} />
                <span>حفظ</span>
              </button>
              <button
                className="primary small"
                disabled={busy || saving}
                onClick={() => void exportPDF()}
              >
                {busy ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <Download size={16} />
                )}
                <span>تنزيل PDF</span>
              </button>
            </div>
          </header>
          {!draft && (
            <div className="guest-banner">
              <span>
                أنت في وضع التجربة. احفظ سيرتك بتسجيل الدخول وتفعيل الباقة.
              </span>
              <button
                onClick={() => setModal(session ? "membership" : "login")}
              >
                تفعيل الخدمة <ArrowLeft size={14} />
              </button>
            </div>
          )}
          {readonly && (
            <div className="guest-banner">
              انتهت مدة التحرير. يمكنك عرض المسودة وتنزيل نسختها المعتمدة.
              <button onClick={() => setModal("membership")}>
                تجديد الباقة
              </button>
            </div>
          )}
          {conflict && (
            <div className="conflict-banner">
              وصل تعديل أحدث من قناة أخرى. لم نستبدل بياناتك.
              <button
                onClick={() => {
                  const b = new Blob(
                    [JSON.stringify({ content: data, design }, null, 2)],
                    { type: "application/json" },
                  );
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(b);
                  a.download = "etmam-unsaved-changes.json";
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                احفظ نسخة من تعديلاتك
              </button>
              <button
                onClick={async () => {
                  try {
                    const d = await api.getDraft(draft!.id);
                    setDraft(d);
                    setData(d.content);
                    setDesign(d.design);
                    setDirty(false);
                    setConflict(false);
                  } catch (e) {
                    fail(e);
                  }
                }}
              >
                تحميل النسخة الأحدث
              </button>
            </div>
          )}
          <div
            className={
              "editor-shell " + (panel === "assistant" ? "assistant-open" : "")
            }
          >
            <main
              className={
                "document-stage " +
                (mobile === "preview" ? "mobile-visible" : "")
              }
            >
              <div className="stage-toolbar">
                <div>
                  <span className="live-dot" />
                  معاينة مباشرة
                </div>
                <div className="zoom-control">
                  <button
                    className="icon-btn"
                    aria-label="تصغير"
                    onClick={() => setZoom((z) => Math.max(0.4, z - 0.05))}
                  >
                    <Minus size={15} />
                  </button>
                  <span>{Math.round(effectiveZoom * 100)}٪</span>
                  <button
                    className="icon-btn"
                    aria-label="تكبير"
                    onClick={() => setZoom((z) => Math.min(1.1, z + 0.05))}
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <button
                  className="text-btn"
                  onClick={() => {
                    setPanel("design");
                    setMobile("panel");
                  }}
                >
                  <LayoutTemplate size={16} />
                  {TEMPLATES.find((t) => t.id === design.template)?.name}
                  <ChevronDown size={13} />
                </button>
              </div>
              <div className="paper-scroll">
                {readonly ? (
                  <Paper data={data} design={design} zoom={effectiveZoom} />
                ) : (
                  <InlinePaper
                    data={data}
                    design={design}
                    zoom={effectiveZoom}
                    onSection={chooseSection}
                    onDesign={changeDesign}
                    onInline={(path, text, format) => {
                      try {
                        const old = String(
                            readField(latest.current.data, path),
                          ),
                          marks =
                            latest.current.design.textFormats?.[path]?.marks ||
                            [];
                        if (
                          old === text &&
                          JSON.stringify(marks) === JSON.stringify(format.marks)
                        )
                          return;
                        if (old !== text)
                          setHistoryData((h) => [
                            ...h.slice(-19),
                            latest.current.data,
                          ]);
                        const next = writeField(
                          latest.current.data,
                          path,
                          text,
                        ) as Resume;
                        setData(next);
                        setDesign((d) => ({
                          ...d,
                          textFormats: { ...d.textFormats, [path]: format },
                        }));
                        setDirty(true);
                        setJob(null);
                      } catch (e) {
                        fail(e);
                      }
                    }}
                    onItem={(section, index, action) => {
                      try {
                        const result = editItems(
                          latest.current.data,
                          latest.current.design,
                          section,
                          index,
                          action,
                        );
                        change(result.data);
                        changeDesign(result.design);
                      } catch (e) {
                        fail(e);
                      }
                    }}
                    onDeleteSection={(section) => {
                      const next = structuredClone(latest.current.data);
                      if (section === "summary") next.summary = "";
                      else if (SECTION_KEYS.includes(section))
                        (next as unknown as Record<string, unknown>)[section] =
                          [];
                      change(next);
                    }}
                  />
                )}
              </div>
              <div className="stage-hint">
                اكتب داخل الورقة مباشرة. حدّد الكلمات للتنسيق، أو افتح حقول
                القسم من شريط أدواته.
              </div>
            </main>
            <aside
              className={
                "context-panel " + (mobile === "panel" ? "mobile-visible" : "")
              }
            >
              <div className="panel-heading">
                <span className="eyebrow">مساحتك المهنية</span>
                <h2>
                  {panel === "content"
                    ? "محتوى سيرتك"
                    : panel === "design"
                      ? "تفاصيل تصنع حضورك"
                      : panel === "assistant"
                        ? "مساعدك المهني"
                        : "حسابك وباقتك"}
                </h2>
                <p>
                  {panel === "content"
                    ? "كل تفصيل يقرّب الصورة."
                    : panel === "design"
                      ? "اختر ما يعكس أسلوبك."
                      : "خبرتك كما هي، بصياغة أوضح."}
                </p>
              </div>
              {panel === "content" && (
                <>
                  <div className="completion">
                    <div>
                      <span>اكتمال البيانات</span>
                      <strong>{completeness(data)}٪</strong>
                    </div>
                    <div className="progress-track">
                      <span style={{ width: completeness(data) + "%" }} />
                    </div>
                  </div>
                  <ResumeDiagnosis data={data} onSection={chooseSection} />
                  <div className="section-picker">
                    {SECTIONS.map(([id, label]) => (
                      <button
                        className={section === id ? "active" : ""}
                        key={id}
                        onClick={() => setSection(id)}
                      >
                        {label}
                        {section === id && <span className="dot" />}
                      </button>
                    ))}
                  </div>
                  <div className="panel-fields">
                    <div className="section-heading">
                      <h3>{SECTIONS.find((x) => x[0] === section)?.[1]}</h3>
                      <span>تحرير</span>
                    </div>
                    <Fields
                      data={data}
                      section={section}
                      onChange={change}
                      disabled={readonly}
                    />
                  </div>
                </>
              )}
              {panel === "design" && (
                <div className="panel-fields">
                  <h3>القالب</h3>
                  <div className="design-templates">
                    {TEMPLATES.map((t) => (
                      <button
                        className={design.template === t.id ? "active" : ""}
                        disabled={readonly}
                        key={t.id}
                        onClick={() =>
                          changeDesign({ ...design, template: t.id })
                        }
                      >
                        <div className={"mini-template " + t.id}>
                          <div />
                          <i />
                          <i />
                          <i />
                          <b />
                          <i />
                          <i />
                        </div>
                        <span>{t.name}</span>
                        {design.template === t.id && <CheckCircle2 size={16} />}
                      </button>
                    ))}
                  </div>
                  <h3>لغة السيرة</h3>
                  <div className="segmented">
                    <button
                      disabled={readonly}
                      className={data.language === "ar" ? "active" : ""}
                      onClick={() => change({ ...data, language: "ar" })}
                    >
                      العربية
                    </button>
                    <button
                      disabled={readonly}
                      className={data.language === "en" ? "active" : ""}
                      onClick={() => change({ ...data, language: "en" })}
                    >
                      English
                    </button>
                  </div>
                  <small>
                    تغيير اتجاه القالب لا يترجم المحتوى. استخدم المساعد للترجمة.
                  </small>
                  <h3>لون العناوين</h3>
                  <div className="colors">
                    {[
                      "#0F2D5B",
                      "#0F766E",
                      "#334155",
                      "#7C3D54",
                      "#111827",
                    ].map((c) => (
                      <button
                        disabled={readonly}
                        aria-label={"لون " + c}
                        key={c}
                        onClick={() => changeDesign({ ...design, accent: c })}
                        className={design.accent === c ? "chosen" : ""}
                        style={{ background: c }}
                      >
                        {design.accent === c && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                  <h3>حجم الخط</h3>
                  <div className="segmented">
                    {[10, 11, 12].map((n) => (
                      <button
                        disabled={readonly}
                        key={n}
                        className={design.fontSize === n ? "active" : ""}
                        onClick={() => changeDesign({ ...design, fontSize: n })}
                      >
                        {n} pt
                      </button>
                    ))}
                  </div>
                  <h3>تباعد السطور</h3>
                  <div className="segmented">
                    {[1.35, 1.5, 1.65].map((n, i) => (
                      <button
                        disabled={readonly}
                        key={n}
                        className={design.spacing === n ? "active" : ""}
                        onClick={() => changeDesign({ ...design, spacing: n })}
                      >
                        {["مدمج", "متوازن", "مريح"][i]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {panel === "assistant" && (
                <div className="assistant-panel">
                  <div className="assistant-intro">
                    <span className="assistant-avatar">
                      <Sparkles size={23} />
                    </span>
                    <div>
                      <h3>مساعدك المهني</h3>
                      <p>لنكتب سيرة أوضح، خطوة بخطوة.</p>
                    </div>
                  </div>
                  <div className="credit-badge">
                    <Sparkles size={15} />
                    {account?.membership?.aiRemaining ?? 0} عمليات متبقية{" "}
                    <span>الطلب الناجح = عملية واحدة</span>
                  </div>
                  <JobTargetCard target={targetJob} compact />
                  <LinkedInKit key={draft?.id ?? "guest"} resume={data} />
                  <div className="assistant-tools">
                    {targetJob.job && (
                      <button disabled={busy || readonly} onClick={() => void runAI("improve", {}, latest.current.draft, targetJob.job)}>
                        <BriefcaseBusiness size={19} />
                        <span><strong>حسّن سيرتي لهذه الوظيفة</strong><small>{targetJob.job.title}</small></span>
                      </button>
                    )}
                    <button
                      disabled={busy || readonly}
                      onClick={() => void runAI("improve")}
                    >
                      <Wand2 size={19} />
                      <span>
                        <strong>تحسين الصياغة</strong>
                        <small>راجع التغييرات قبل اعتمادها</small>
                      </span>
                    </button>
                    <button
                      disabled={busy || readonly}
                      onClick={() =>
                        void runAI("translate", {
                          targetLanguage: data.language === "ar" ? "en" : "ar",
                        })
                      }
                    >
                      <MessageCircle size={19} />
                      <span>
                        <strong>ترجمة السيرة</strong>
                        <small>
                          {data.language === "ar"
                            ? "إلى الإنجليزية"
                            : "إلى العربية"}
                        </small>
                      </span>
                    </button>
                    <button
                      disabled={busy || readonly}
                      onClick={() => {
                        if (requirePaid()) fileRef.current?.click();
                      }}
                    >
                      <Upload size={19} />
                      <span>
                        <strong>استيراد سيرة</strong>
                        <small>PDF أو Word أو صورة</small>
                      </span>
                    </button>
                  </div>
                  <div
                    className="chat-thread"
                    aria-live="polite"
                    aria-busy={aiRunning}
                  >
                    {importReport && importReport.draftId === draft?.id && (
                      <ImportReport
                        report={importReport}
                        busy={busy || aiRunning}
                        onReview={() => setReviewOpen(true)}
                        onSuggestion={(section, hasText) => {
                          if (hasText) void runAI("improve", { section });
                          else
                            chooseSection(
                              section === "headline" ? "identity" : section,
                            );
                        }}
                      />
                    )}
                    {!chat.length && (
                      <div className="chat-welcome">
                        <Sparkles size={22} />
                        <h4>كيف أساعدك اليوم؟</h4>
                        <p>
                          اسأل عن ملخصك أو خبراتك أو المهارات الأنسب لمجالك.
                          أستخدم معلومات سيرتك دون اختلاق خبرات.
                        </p>
                        <div className="chat-starters">
                          <button
                            disabled={busy || readonly}
                            onClick={() =>
                              void runAI("improve", { section: "summary" })
                            }
                          >
                            حسّن ملخصي المهني
                          </button>
                          <button
                            disabled={busy || readonly}
                            onClick={() =>
                              void runAI("chat", {
                                message:
                                  "راجع سيرتي واذكر أهم ثلاث تحسينات محددة بناءً على بياناتي.",
                              })
                            }
                          >
                            ما الذي يحتاج تحسينًا؟
                          </button>
                          <button
                            disabled={busy || readonly}
                            onClick={() =>
                              setAssistant(
                                "ساعدني في إبراز مهاراتي المناسبة للمسمى المستهدف",
                              )
                            }
                          >
                            ساعدني في إبراز مهاراتي
                          </button>
                        </div>
                      </div>
                    )}
                    {chat.map((m, i) => (
                      <article className={"chat-message " + m.role} key={i}>
                        <small>
                          {m.role === "user" ? "أنت" : "مساعد إلمام CV"}
                        </small>
                        <p dir="auto">{m.text}</p>
                      </article>
                    ))}
                    {aiRunning && (
                      <div className="chat-progress">
                        <Loader2 size={18} className="spin" />
                        أجهّز اقتراحك… يمكنك مراجعته فور اكتماله.
                      </div>
                    )}
                    {job?.state === "completed" && job.result?.content && (
                      <button
                        className="primary full"
                        onClick={() => setReviewOpen(true)}
                      >
                        <Eye size={17} />
                        عرض المقارنة والتغييرات
                      </button>
                    )}
                    <div ref={chatEnd} />
                  </div>
                  <form
                    className="chat-composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (assistant.trim())
                        void runAI("chat", { message: assistant });
                    }}
                  >
                    <label className="field">
                      <span>رسالتك للمساعد</span>
                      <textarea
                        rows={3}
                        value={assistant}
                        onChange={(e) => setAssistant(e.target.value)}
                        placeholder="اكتب طلبك… مثل: اختصر ملخصي مع إبراز خبرتي"
                      />
                    </label>
                    <button
                      className="primary full"
                      disabled={busy || readonly || !assistant.trim()}
                    >
                      <Send size={16} />
                      إرسال · عملية واحدة
                    </button>
                    <small>الاقتراحات لا تغيّر سيرتك إلا بعد اعتمادك.</small>
                  </form>
                </div>
              )}
              {panel === "account" && (
                <div className="panel-fields">
                  <h3>{session ? "حسابك" : "سجّل لتحتفظ بعملك"}</h3>
                  <p className="muted">
                    {session?.user.email ||
                      "تفعيل واحد، ومسوداتك متاحة في الموقع والبوت."}
                  </p>
                  <button
                    className="primary full"
                    onClick={() => setModal(session ? "membership" : "login")}
                  >
                    {session ? "الباقة وربط تيليجرام" : "تسجيل الدخول"}
                  </button>
                  {draft && (
                    <button
                      className="text-btn full danger"
                      onClick={() => setDeleteDraft(draft)}
                    >
                      <Trash2 size={16} />
                      حذف هذه المسودة
                    </button>
                  )}
                  <a
                    className="secondary full"
                    href="https://t.me/mohamdto21"
                    target="_blank"
                    rel="noreferrer"
                  >
                    الدعم والمساعدة <MessageCircle size={17} />
                  </a>
                </div>
              )}
            </aside>
            <nav className="editor-rail">
              {[
                [PanelRight, "content", "المحتوى"],
                [Settings2, "design", "التصميم"],
                [Sparkles, "assistant", "المساعد"],
                [UserRound, "account", "حسابي"],
              ].map(([Icon, id, label]) => {
                const C = Icon as typeof UserRound;
                return (
                  <button
                    key={id as string}
                    className={panel === id ? "active" : ""}
                    onClick={() => {
                      setPanel(id as string);
                      setMobile("panel");
                    }}
                  >
                    <C size={23} />
                    <span>{label as string}</span>
                  </button>
                );
              })}
              <a
                href="https://t.me/mohamdto21"
                target="_blank"
                rel="noreferrer"
                className="rail-support"
                aria-label="الدعم"
              >
                <MessageCircle size={22} />
              </a>
            </nav>
          </div>
          <nav className="mobile-nav">
            <button
              className={mobile === "preview" ? "active" : ""}
              onClick={() => setMobile("preview")}
            >
              <Eye size={20} />
              الورقة
            </button>
            {[
              [FileText, "content", "المحتوى"],
              [Settings2, "design", "التصميم"],
              [Sparkles, "assistant", "المساعد"],
            ].map(([Icon, id, label]) => {
              const C = Icon as typeof UserRound;
              return (
                <button
                  key={id as string}
                  className={mobile === "panel" && panel === id ? "active" : ""}
                  onClick={() => {
                    setPanel(id as string);
                    setMobile("panel");
                  }}
                >
                  <C size={20} />
                  {label as string}
                </button>
              );
            })}
          </nav>
        </div>
      )}
      {reviewOpen && job?.result?.content && (
        <AIReview
          before={proposalBase?.content || data}
          after={job.result.content}
          design={design}
          busy={busy}
          appliedKeys={job.result.appliedKeys}
          imported={job.kind === "import"}
          vacancy={proposalTarget}
          copyError={copyError}
          onSaveCopy={proposalTarget && job.kind === "improve" ? async () => {
            if (busy || !requirePaid()) return;
            setCopyError("");
            setBusy(true);
            try {
              const current = latest.current;
              if (!proposalBase || current.dirty || current.draft?.id !== proposalBase.id || current.draft.revision !== job.base_revision)
                throw Error("تغيّرت المسودة منذ إعداد الاقتراح. احفظ عملك وأنشئ اقتراحًا جديدًا.");
              const limit = account?.membership?.maxDrafts ?? 2;
              if (drafts.length >= limit) throw Error(`وصلت إلى حد المسودات (${limit}). يمكنك اعتماد الاقتراح في مسودتك الحالية.`);
              const content = job.result!.content!;
              validateResume(content);
              const copy = await api.create(content, {
                ...proposalBase.design,
                targetVacancy: { id: proposalTarget.id, title: proposalTarget.title },
              }, (tailoredDraftPrefix + proposalTarget.title).slice(0, 120));
              setReviewOpen(false);
              setJob(null);
              setDrafts((items) => [copy, ...items.filter((item) => item.id !== copy.id)]);
              go("/editor/" + copy.id);
              notify("حُفظت السيرة المخصصة كمسودة جديدة.");
            } catch (e) {
              setCopyError(e instanceof Error ? e.message : "تعذّر حفظ النسخة المخصصة.");
            } finally {
              setBusy(false);
            }
          } : undefined}
          onClose={() => setReviewOpen(false)}
          onApply={async (keys) => {
            setBusy(true);
            try {
              const changes = resumeChanges(
                proposalBase?.content || data,
                job.result!.content!,
              );
              if (latest.current.dirty)
                throw Error("احفظ تعديلاتك قبل اعتماد الاقتراح.");
              const d = await api.apply(job.id, job.base_revision, keys);
              setDraft(d);
              setData(d.content);
              setDirty(false);
              const updatedJob = await api.job(job.id);
              const done = changes.every((c: { key: string }) =>
                updatedJob.result?.appliedKeys?.includes(c.key),
              );
              setReviewOpen(!done);
              setJob(done ? null : updatedJob);
              if (done && job.kind === "import")
                setImportReport((r) => (r ? { ...r, applied: true } : r));
              if (latest.current.draft?.id !== d.id) go("/editor/" + d.id);
              const text =
                "تم اعتماد التغييرات في: " +
                changes
                  .filter((c: { key: string }) => keys.includes(c.key))
                  .map((c: { label: string }) => c.label)
                  .join("، ") +
                ".";
              notify(text);
              setChat((h) => [...h, { role: "assistant", text }]);
            } catch (e) {
              fail(e);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {deleteDraft && (
        <Modal title="حذف المسودة" onClose={() => setDeleteDraft(null)}>
          <p>
            هل تريد حذف «{deleteDraft.title}»؟ سيُحذف محتواها من قائمة مسوداتك،
            ولا يُستعاد رصيد الذكاء الاصطناعي المستخدم.
          </p>
          <div className="review-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setDeleteDraft(null)}
            >
              إلغاء
            </button>
            <button
              className="primary danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.remove(deleteDraft.id);
                  if (draft?.id === deleteDraft.id) {
                    setDraft(null);
                    setDirty(false);
                    setJob(null);
                    go("/documents");
                  }
                  setDeleteDraft(null);
                  await refresh();
                  notify("حُذفت المسودة.");
                } catch (e) {
                  fail(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              حذف المسودة
            </button>
          </div>
        </Modal>
      )}
      {modal === "login" && (
        <Modal title="أهلًا بك في إلمام CV" onClose={() => setModal("")}>
          <p className="muted">ندخل معك برمز يُرسل إلى بريدك، دون كلمة مرور.</p>
          {(!auth || !emailLoginReady) && (
            <div className="tip">
              تسجيل الدخول بالبريد قيد التجهيز. يمكنك الآن تجربة المحرر
              والمعاينة، وتبقى خدمة البوت متاحة للمشتركين.
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!auth || !emailLoginReady) return;
              setBusy(true);
              setError("");
              try {
                if (!otpSent) {
                  const { error } = await auth.auth.signInWithOtp({
                    email,
                    options: { shouldCreateUser: true },
                  });
                  if (error) throw error;
                  setOtpSent(true);
                } else {
                  const { error } = await auth.auth.verifyOtp({
                    email,
                    token: otp,
                    type: "email",
                  });
                  if (error) throw error;
                  setModal("");
                  notify("تم تسجيل الدخول. يمكنك حفظ سيرتك بعد تفعيل الباقة.");
                }
              } catch (e) {
                fail(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="البريد الإلكتروني"
              type="email"
              value={email}
              onChange={setEmail}
            />
            {otpSent && (
              <Field
                label="رمز الدخول من البريد"
                value={otp}
                onChange={setOtp}
                placeholder="رمز التحقق"
              />
            )}
            <button
              className="primary full"
              disabled={!auth || !emailLoginReady || busy || !email}
            >
              {busy ? <Loader2 size={17} className="spin" /> : null}
              {otpSent ? "تأكيد والدخول" : "أرسل رمز الدخول"}
            </button>
            {otpSent && (
              <button
                type="button"
                className="text-btn full"
                onClick={() => setOtpSent(false)}
              >
                تغيير البريد أو إعادة طلب الرمز
              </button>
            )}
          </form>
        </Modal>
      )}
      {modal === "membership" && (
        <Modal title="باقتك وحسابك" onClose={() => setModal("")}>
          <p dir="ltr" className="muted">
            {session?.user.email}
          </p>
          {account?.membership && (
            <div className="tip">
              <CheckCircle2 size={20} />
              <div>
                <strong>{paid ? "الباقة فعّالة" : "انتهت مدة التحرير"}</strong>
                <p>
                  حتى {fmt(account.membership.expires)} ·{" "}
                  {account.membership.aiRemaining} عملية متبقية
                </p>
              </div>
            </div>
          )}
          {!paid && (
            <button className="primary full" type="button" onClick={openPlansFromEditor}>
              عرض باقة إلمام CV <ArrowLeft size={16} />
            </button>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                setAccount(await api.redeem(code));
                await refresh();
                setCode("");
                notify("تم التفعيل.");
              } catch (e) {
                fail(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="كود التفعيل من زد"
              value={code}
              onChange={setCode}
              placeholder="ETM-XXXX-XXXX"
            />
            <button className="primary full" disabled={busy || !code.trim()}>
              تفعيل الكود
            </button>
          </form>
          <hr />
          <h3>الموقع وتيليجرام، حساب واحد</h3>
          <p className="muted">
            إذا فعّلت كودك في البوت مسبقًا، اربطه هنا لاستعادة مسوداتك وباقتك.
          </p>
          <button
            className="secondary full"
            disabled={busy || account?.telegramLinked}
            onClick={async () => {
              try {
                const r = await api.link();
                setPairCode(
                  (new URL(r.url).searchParams.get("start") || "")
                    .slice(-8)
                    .toUpperCase(),
                );
                window.open(r.url, "_blank", "noopener,noreferrer");
                notify("أكمل تأكيد الربط داخل البوت، ثم اضغط تحديث.");
              } catch (e) {
                fail(e);
              }
            }}
          >
            <Link2 size={17} />
            {account?.telegramLinked ? "تيليجرام مرتبط" : "ربط حساب تيليجرام"}
          </button>
          {pairCode && !account?.telegramLinked && (
            <p className="tip">
              رمز المطابقة: <bdi dir="ltr">{pairCode}</bdi>
              <br />
              طابق هذا الرمز مع الظاهر في البوت قبل تأكيد الربط.
            </p>
          )}
          <button
            className="text-btn full"
            onClick={() => void refresh().catch(fail)}
          >
            تحديث حالة الربط
          </button>
          <a
            className="text-btn full"
            href="https://t.me/mohamdto21"
            target="_blank"
            rel="noreferrer"
          >
            الدعم والمساعدة
          </a>
          <button
            className="text-btn full danger"
            onClick={async () => {
              await auth?.auth.signOut();
              setModal("");
              setDraft(null);
              setData(blank());
              setDirty(false);
              go("/");
            }}
          >
            <LogOut size={15} />
            تسجيل الخروج
          </button>
        </Modal>
      )}
      <input
        hidden
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.png,.jpg,.jpeg"
        onChange={(e) => {
          if (e.target.files?.[0]) void importFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <div className="toast error" role="alert">
          <span>{error}</span>
          <button
            className="icon-btn"
            aria-label="إغلاق الرسالة"
            onClick={() => setError("")}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
    </>
  );
}
