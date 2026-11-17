import { useEffect, useState } from "react";
import { ArrowLeft, Check, FileText } from "lucide-react";
import { api } from "./api";
import { captureCvEvent } from "./analytics";

const number = new Intl.NumberFormat("ar-SA");
const payId = /^pay_[a-zA-Z0-9]{3,64}$/;

export default function WhopPlan({ userId, onPaid, onSignIn, onContinue, referralJobId }: {
  userId?: string;
  onSignIn: () => void;
  onPaid: () => Promise<void>;
  onContinue: () => void;
  referralJobId?: number;
}) {
  const [environment, setEnvironment] = useState<"sandbox" | "live" | null>(null);
  const storageKey = "etmam.whop." + environment + "." + userId;
  const sandbox = environment === "sandbox";
  const [offer, setOffer] = useState<Awaited<ReturnType<typeof api.whopCatalog>>["offer"]>(null);
  const [catalogReady, setCatalogReady] = useState(false);
  const [intent, setIntent] = useState<string | null>(null);
  const [payment, setPayment] = useState("");
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return;
    let active = true;
    api.whopCatalog().then((catalog) => {
      if (!active || !catalog.ready || !catalog.environment) return;
      setEnvironment(catalog.environment);
      setOffer(catalog.offer);
      try {
        setIntent(sessionStorage.getItem("etmam.whop." + catalog.environment + "." + userId));
      } catch {
        setIntent(null);
      }
    }).catch(() => {}).finally(() => { if (active) setCatalogReady(true); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!offer || !intent) return;
    let active = true;
    const returnUrl = new URL(location.href);
    const paymentId = returnUrl.searchParams.get("payment_id");
    const returnedFromCheckout = returnUrl.searchParams.get("checkout_status") === "success" &&
      paymentId !== null && payId.test(paymentId);
    const request = returnedFromCheckout
      ? api.whopConfirm(intent, paymentId)
      : api.whopStatus(intent);
    if (returnedFromCheckout) {
      setBusy(true);
      setPayment(paymentId);
    }
    request.then(async (status) => {
      if (!active || !status.completed) return;
      setCompleted(true);
      if (returnedFromCheckout) {
        const cleanUrl = new URL(location.href);
        for (const key of ["receipt_id", "payment_id", "checkout_status", "status", "state_id"])
          cleanUrl.searchParams.delete(key);
        history.replaceState(history.state, "", cleanUrl);
        await onPaid();
      }
    }).catch((cause) => {
      if (active && returnedFromCheckout)
        setError(cause instanceof Error ? cause.message : "تعذّر التحقق من الدفعة.");
    }).finally(() => {
      if (active && returnedFromCheckout) setBusy(false);
    });
    return () => { active = false; };
  }, [offer, intent, onPaid]);

  async function openCheckout() {
    setBusy(true);
    setError("");
    try {
      const id = intent ?? crypto.randomUUID();
      sessionStorage.setItem(storageKey, id);
      setIntent(id);
      const checkout = await api.whopCheckout(id, referralJobId);
      if (checkout.completed) {
        setCompleted(true);
        await onPaid();
      } else {
        if (!checkout.url) throw Error("تعذّر فتح طلب الدفع.");
        const url = new URL(checkout.url);
        const expectedOrigin = sandbox ? "https://sandbox.whop.com" : "https://whop.com";
        if (url.origin !== expectedOrigin) throw Error("رابط الدفع غير صالح.");
        if (!sandbox) captureCvEvent("cv checkout opened", referralJobId);
        location.assign(url.href);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذّر فتح الدفع.");
    } finally {
      setBusy(false);
    }
  }

  async function checkPayment() {
    if (!intent) return;
    setBusy(true);
    setError("");
    try {
      const result = payment.trim()
        ? await api.whopConfirm(intent, payment.trim())
        : await api.whopStatus(intent);
      setCompleted(result.completed);
      if (result.completed) await onPaid();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذّر التحقق من الدفعة.");
    } finally {
      setBusy(false);
    }
  }

  const advertisedOffer = offer ?? { amountMinor: 1000, days: 30, aiOperations: 3 };
  return (
    <section className="starter-plan" aria-labelledby="whop-plan-title">
      <div className="starter-plan-summary">
        <FileText size={27} aria-hidden="true" />
        <h2 id="whop-plan-title">باقة إلمام CV</h2>
        {sandbox && <span className="eyebrow">للاختبار فقط</span>}
        <div className="price">{number.format(advertisedOffer.amountMinor / 100)} <small>{advertisedOffer.amountMinor === 1000 ? "ريالات" : "ريالًا"}</small></div>
        <p>دفعة واحدة · {number.format(advertisedOffer.days)} يومًا · بدون تجديد تلقائي</p>
        {!sandbox && <small>السعر شامل الضريبة</small>}
      </div>
      <div className="starter-plan-details">
        <ul>
          {[
            "مسودة محفوظة يمكنك تحديثها طوال مدة الباقة",
            number.format(advertisedOffer.aiOperations) + " عمليات ذكاء اصطناعي للتحسين والترجمة والاستيراد",
            "٣ قوالب تدعم العربية والإنجليزية",
            "تنزيل PDF دون خصم من رصيد الذكاء الاصطناعي",
          ].map((feature) => <li key={feature}><Check size={19} aria-hidden="true" />{feature}</li>)}
        </ul>
        {!userId ? (
          <button className="primary full" onClick={onSignIn}>سجّل الدخول للشراء <ArrowLeft size={18} /></button>
        ) : !offer ? (
          <p role="status">{catalogReady ? "الدفع غير متاح مؤقتًا. حاول مجددًا لاحقًا." : "جارٍ التحقق من إتاحة الدفع…"}</p>
        ) : completed ? (
          <>
            <p role="status">تم التحقق من الدفعة وتفعيل الباقة.</p>
            <button className="primary full" onClick={onContinue}>
              تابع إنشاء سيرتك <ArrowLeft size={18} />
            </button>
          </>
        ) : (
          <>
            <button className="primary full" disabled={busy} onClick={openCheckout}>
              {busy ? "لحظات…" : intent ? "متابعة الدفع" : sandbox ? "جرّب الدفع عبر Whop" : "اشترِ الباقة عبر Whop"} <ArrowLeft size={18} />
            </button>
            {intent && (
              <form onSubmit={(event) => { event.preventDefault(); void checkPayment(); }}>
                {sandbox && <>
                  <label htmlFor="whop-payment">رقم الدفعة التجريبية</label>
                  <input id="whop-payment" dir="ltr" value={payment} maxLength={68}
                    placeholder="pay_…" onChange={(event) => setPayment(event.target.value)} />
                </>}
                <button className="secondary full" disabled={busy || Boolean(payment.trim() && !payId.test(payment.trim()))}>
                  تحقّق من الدفع
                </button>
              </form>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
