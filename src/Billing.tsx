import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
type Offer = {
  sku: string;
  priceId: string;
  title: string;
  kind: string;
  sarTarget: number;
  usd: string;
  sar: string;
  interval: string | null;
  aiOperations: number;
  drafts: number;
};
let sdk: Promise<void> | null = null,
  initialized = "";
let onCheckoutEvent: (event: any) => void = () => {};
function loadSDK() {
  if (!sdk)
    sdk = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      script.onload = () => resolve();
      script.onerror = () => {
        sdk = null;
        script.remove();
        reject(Error("تعذّر فتح بوابة الدفع. حاول مجددًا."));
      };
      document.head.append(script);
    });
  return sdk;
}
export default function Billing({
  accountId,
  active,
  onUpdated,
  onError,
}: {
  accountId: string;
  active: boolean;
  onUpdated: () => Promise<unknown>;
  onError: (e: unknown) => void;
}) {
  const [catalog, setCatalog] = useState<any>(null),
    [cycle, setCycle] = useState("month"),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [status, setStatus] = useState<any>(null),
    [upgrade, setUpgrade] = useState<any>(null);
  const mounted = useRef(true),
    attempt = useRef<{ sku: string; id: string } | null>(null),
    polling = useRef(false);
  const host = useRef<HTMLElement>(null);
  const storageKey = "etmam-paddle-intent:" + accountId;
  async function refresh() {
    setCatalog(await api.billingCatalog());
    setStatus(await api.billingStatus().catch(() => null));
  }
  async function confirm() {
    const id = sessionStorage.getItem(storageKey);
    if (!id || polling.current) return;
    polling.current = true;
    setMessage("نتحقق من الدفع وتحديث باقتك…");
    try {
      for (let i = 0; i < 20 && mounted.current; i++) {
        const r = await api.confirmPayment(id);
        if (r.completed) {
          sessionStorage.removeItem(storageKey);
          attempt.current = null;
          await onUpdated();
          await refresh();
          setMessage("تم تأكيد الدفع وتحديث باقتك ورصيدك في الموقع والبوت.");
          return;
        }
        if (i < 19) await new Promise((r) => setTimeout(r, 1800));
      }
      setMessage(
        "لم يصل تأكيد الدفع بعد. يمكنك تحديث الحالة دون الدفع مرة أخرى.",
      );
    } catch (e) {
      onError(e);
      setMessage("تعذّر التحقق الآن. لا تكرر الدفع؛ استخدم تحديث حالة الدفع.");
    } finally {
      polling.current = false;
      setBusy("");
    }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh().catch(onError);
    if (sessionStorage.getItem(storageKey)) void confirm();
    return () => {
      mounted.current = false;
      onCheckoutEvent = () => {};
    };
  }, [accountId]);
  async function checkout(o: Offer) {
    setBusy(o.sku);
    setMessage("");
    try {
      if (attempt.current?.sku !== o.sku)
        attempt.current = { sku: o.sku, id: crypto.randomUUID() };
      await loadSDK();
      const paddle = (window as any).Paddle;
      if (initialized !== catalog.clientToken) {
        if (catalog.environment === "sandbox")
          paddle.Environment.set("sandbox");
        paddle.Initialize({
          token: catalog.clientToken,
          eventCallback: (event: any) => onCheckoutEvent(event),
        });
        initialized = catalog.clientToken;
      }
      onCheckoutEvent = (e) => {
        if (e.name === "checkout.completed") void confirm();
        if (e.name === "checkout.closed") {
          setBusy("");
          const dialog = host.current?.closest("dialog");
          if (dialog && !dialog.open) dialog.showModal();
        }
      };
      const pendingId = sessionStorage.getItem(storageKey);
      let r;
      if (pendingId) {
        const pending = await api.confirmPayment(pendingId);
        if (pending.completed) {
          sessionStorage.removeItem(storageKey);
          await onUpdated();
          await refresh();
          setBusy("");
          return;
        }
        if (!pending.transactionId)
          throw Error("طلب الدفع قيد التحقق. لا تكرر الدفع الآن.");
        if (pending.sku !== o.sku)
          throw Error(
            "لديك طلب دفع لم يكتمل. استكمله أو ألغِه قبل اختيار باقة أخرى.",
          );
        r = { intentId: pendingId, transactionId: pending.transactionId };
      } else r = await api.checkout(o.sku, attempt.current.id);
      sessionStorage.setItem(storageKey, r.intentId);
      host.current?.closest("dialog")?.close();
      paddle.Checkout.open({
        transactionId: r.transactionId,
        settings: {
          displayMode: "overlay",
          theme: "light",
          allowLogout: false,
        },
      });
    } catch (e) {
      setBusy("");
      const dialog = host.current?.closest("dialog");
      if (dialog && !dialog.open) dialog.showModal();
      onError(e);
    }
  }
  async function portal() {
    setBusy("portal");
    try {
      const { url } = await api.billingPortal();
      const parsed = new URL(url);
      if (
        ![
          "customer-portal.paddle.com",
          "sandbox-customer-portal.paddle.com",
        ].includes(parsed.hostname) ||
        parsed.protocol !== "https:"
      )
        throw Error("تعذّر فتح إدارة الاشتراك.");
      window.location.assign(url);
    } catch (e) {
      onError(e);
      setBusy("");
    }
  }
  const subscriptions: Offer[] = (catalog?.offers || []).filter(
    (o: Offer) => o.kind === "subscription" && o.interval === cycle,
  );
  const packs: Offer[] = (catalog?.offers || []).filter(
    (o: Offer) => o.kind === "ai",
  );
  const hasSubscription = status?.subscriptions?.some(
    (s: any) =>
      ["active", "trialing", "past_due", "paused"].includes(s.status) &&
      !s.revoked,
  );
  const currentSubscription = status?.subscriptions?.find(
    (s: any) => s.status === "active" && !s.revoked,
  );
  const currentOffer = catalog?.offers?.find(
    (o: Offer) => o.priceId === currentSubscription?.priceId,
  );
  const canUpgrade = (o: Offer) =>
    currentOffer &&
    o.drafts > currentOffer.drafts &&
    o.interval === currentOffer.interval;
  async function upgradePreview(o: Offer) {
    setBusy(o.sku);
    try {
      setUpgrade(await api.previewPlanChange(o.sku));
    } catch (e) {
      onError(e);
    } finally {
      setBusy("");
    }
  }
  async function upgradeConfirm() {
    setBusy("upgrade");
    try {
      await api.confirmPlanChange(upgrade.id);
      const target = upgrade.drafts;
      setUpgrade(null);
      setMessage("تم إرسال الترقية. نتحقق من الدفع وتحديث المزايا…");
      for (let i = 0; i < 15; i++) {
        const s = await api.billingStatus();
        if (
          s.subscriptions?.some((x: any) => x.maxDrafts >= target && !x.revoked)
        ) {
          await onUpdated();
          await refresh();
          setMessage("تم تأكيد الترقية وتحديث المسودات والحصة الشهرية.");
          return;
        }
        await new Promise((r) => setTimeout(r, 1800));
      }
      setMessage(
        "الترقية قيد تأكيد الدفع. لا تكرر العملية؛ حدّث حالة حسابك بعد قليل.",
      );
    } catch (e) {
      onError(e);
    } finally {
      setBusy("");
    }
  }
  return (
    <section ref={host} className="billing-options" aria-label="الدفع المباشر">
      <div className="billing-heading">
        <ShieldCheck size={22} />
        <div>
          <h3>اشترك مباشرة، دون كود تفعيل</h3>
          <p>الدفع عبر Paddle، والباقة مشتركة بين الموقع وتيليجرام.</p>
        </div>
      </div>
      {!catalog ? (
        <p role="status">جارٍ تحميل خيارات الدفع…</p>
      ) : !catalog.ready ? (
        <p className="tip">
          الدفع المباشر قيد التجهيز. يمكنك استخدام كود زد حاليًا.
        </p>
      ) : (
        <>
          {catalog.environment === "sandbox" && (
            <p className="billing-test">
              وضع اختبار لحساب المراجعة فقط — لا توجد مبالغ حقيقية.
            </p>
          )}
          <div className="billing-cycle" role="group" aria-label="مدة الاشتراك">
            {[
              ["month", "شهري"],
              ["year", "سنوي · وفّر قيمة شهرين"],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={cycle === key}
                className={cycle === key ? "selected" : ""}
                onClick={() => setCycle(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="billing-plans">
            {subscriptions.map((o) => (
              <article
                className={
                  "billing-card " + (o.drafts === 10 ? "plus-plan" : "")
                }
                key={o.sku}
              >
                <h4>{o.title}</h4>
                <div className="billing-price">
                  <strong>
                    {o.sarTarget} <small>ر.س</small>
                  </strong>
                  <bdi>${o.usd} USD</bdi>
                </div>
                <p className="billing-period">
                  {cycle === "month" ? "كل شهر" : "كل سنة"} · تجديد تلقائي
                </p>
                <ul>
                  <li>
                    <CheckCircle2 size={15} />
                    {o.drafts === 2 ? "مسودتان" : o.drafts + " مسودات"}
                  </li>
                  <li>
                    <CheckCircle2 size={15} />
                    {o.aiOperations} عمليات ذكاء اصطناعي تتجدد شهريًا
                  </li>
                  <li>
                    <CheckCircle2 size={15} />
                    تحرير وتصدير بالعربية والإنجليزية
                  </li>
                </ul>
                <button
                  type="button"
                  className="primary full"
                  disabled={!!busy || (hasSubscription && !canUpgrade(o))}
                  onClick={() =>
                    void (canUpgrade(o) ? upgradePreview(o) : checkout(o))
                  }
                >
                  {busy === o.sku ? (
                    <Loader2 className="spin" size={18} />
                  ) : null}
                  {canUpgrade(o)
                    ? "الترقية إلى بلس"
                    : hasSubscription
                      ? "لديك اشتراك — إدارته أدناه"
                      : "اشترك في " + o.title}
                </button>
              </article>
            ))}
          </div>
          {upgrade && (
            <div
              className="billing-change-preview"
              role="region"
              aria-label="مراجعة ترقية الاشتراك"
            >
              <h4>مراجعة الترقية إلى {upgrade.title}</h4>
              <p>المستحق الآن بعد احتساب المتبقي من باقتك الحالية:</p>
              <div className="billing-price">
                <strong>{upgrade.sar} ر.س تقريبًا</strong>
                <bdi>${upgrade.usd} USD</bdi>
              </div>
              <p>
                السعر المتجدد بعد الترقية: <bdi>${upgrade.recurringUsd}</bdi>{" "}
                {upgrade.interval === "year" ? "سنويًا" : "شهريًا"}. يرتفع الحد
                إلى {upgrade.drafts} مسودات وحصة {upgrade.aiMonthly} عملية
                شهريًا، ويُحتسب ما استخدمته من حصة الشهر الحالي.
              </p>
              <button
                type="button"
                className="primary"
                disabled={!!busy}
                onClick={() => void upgradeConfirm()}
              >
                تأكيد الترقية ودفع ${upgrade.usd}
              </button>
              <button
                type="button"
                className="text-btn"
                disabled={!!busy}
                onClick={() => setUpgrade(null)}
              >
                إلغاء
              </button>
            </div>
          )}
          <p className="billing-disclosure">
            الدفع الفعلي بالدولار. الأسعار بالريال تعادل تقريبًا الدولار المعروض
            بسعر 3.75 ريال للدولار، وقد يختلف الخصم هللات بسبب التقريب أو رسوم
            البنك. الضريبة مشمولة في السعر الأساسي؛ راجع الإجمالي داخل Paddle
            قبل التأكيد. يمكنك إلغاء التجديد من إدارة الاشتراك، وتبقى المدة
            المدفوعة متاحة.
          </p>
          <h4>رصيد إضافي عند حاجتك</h4>
          <p className="muted">
            عملية واحدة لكل طلب ذكاء اصطناعي ناجح. الرصيد المشترى يبقى محفوظًا
            دون انتهاء، ويحتاج اشتراكًا فعّالًا لاستخدامه. حصة الاشتراك تتجدد
            شهريًا ولا تتراكم.
          </p>
          <div className="billing-packs">
            {packs.map((o) => (
              <button
                type="button"
                key={o.sku}
                disabled={!!busy || !active}
                onClick={() => void checkout(o)}
              >
                <strong>{o.aiOperations} عملية</strong>
                <span>
                  {o.sarTarget} ر.س · <bdi>${o.usd}</bdi>
                </span>
                {o.aiOperations > o.sarTarget && (
                  <small>
                    رصيد إضافي{" "}
                    {Math.round((o.aiOperations / o.sarTarget - 1) * 100)}٪
                  </small>
                )}
              </button>
            ))}
          </div>
          {!active && (
            <p className="muted">فعّل اشتراكك أولًا لشراء الرصيد الإضافي.</p>
          )}
          {status?.subscriptions?.length > 0 && (
            <button
              type="button"
              className="secondary full"
              disabled={!!busy}
              onClick={() => void portal()}
            >
              إدارة الاشتراك والفواتير وإلغاء التجديد
            </button>
          )}
        </>
      )}
      {!catalog?.ready && status?.subscriptions?.length > 0 && (
        <button
          type="button"
          className="secondary full"
          disabled={!!busy}
          onClick={() => void portal()}
        >
          إدارة الاشتراك والفواتير وإلغاء التجديد
        </button>
      )}
      {message && (
        <p className="tip" role="status">
          {message}
        </p>
      )}
      {sessionStorage.getItem(storageKey) && (
        <button
          type="button"
          className="text-btn full"
          onClick={() => void confirm()}
          disabled={polling.current}
        >
          <RefreshCw size={16} />
          تحديث حالة الدفع
        </button>
      )}
      {sessionStorage.getItem(storageKey) && (
        <button
          type="button"
          className="text-btn full"
          disabled={!!busy || polling.current}
          onClick={async () => {
            const id = sessionStorage.getItem(storageKey);
            if (!id) return;
            setBusy("cancel");
            try {
              const r = await api.cancelCheckout(id);
              if (r.canceled) {
                sessionStorage.removeItem(storageKey);
                attempt.current = null;
                setMessage(
                  "أُلغي طلب الدفع غير المكتمل. يمكنك اختيار باقة أخرى.",
                );
              }
            } catch (e) {
              onError(e);
            } finally {
              setBusy("");
            }
          }}
        >
          إلغاء طلب الدفع غير المكتمل
        </button>
      )}
    </section>
  );
}
