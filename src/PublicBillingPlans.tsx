import { useEffect, useState } from "react";
import { BILLING_OFFERS } from "../shared/billing-offers.mjs";
import { dualPrice } from "../shared/paddle.mjs";
import { api } from "./api";
export default function PublicBillingPlans({
  onChoose,
}: {
  onChoose: () => void;
}) {
  const [yearly, setYearly] = useState(false),
    [live, setLive] = useState(false);
  useEffect(() => {
    void api
      .billingPublic()
      .then((r) => setLive(r.liveReady))
      .catch(() => {});
  }, []);
  return (
    <section className="public-direct-plans">
      <h2>اشتراك مباشر يناسب احتياجك</h2>
      <p>حساب واحد للموقع وبوت تيليجرام. اختر باقتك، وأضف رصيدًا عند الحاجة.</p>
      {!live && (
        <p className="billing-test">
          الدفع المباشر قيد التفعيل لدى Paddle. الأسعار أدناه معتمدة، ويمكنك
          استخدام كود زد حاليًا.
        </p>
      )}
      <div className="billing-cycle">
        <button
          className={!yearly ? "selected" : ""}
          onClick={() => setYearly(false)}
        >
          شهري
        </button>
        <button
          className={yearly ? "selected" : ""}
          onClick={() => setYearly(true)}
        >
          سنوي · وفّر قيمة شهرين
        </button>
      </div>
      <div className="billing-plans">
        {BILLING_OFFERS.filter(
          (o) =>
            o.kind === "subscription" &&
            o.interval === (yearly ? "year" : "month"),
        ).map((o) => (
          <article
            className={"billing-card " + (o.drafts === 10 ? "plus-plan" : "")}
            key={o.sku}
          >
            <h3>{o.title}</h3>
            <div className="billing-price">
              <strong>
                {o.sarTarget} <small>ر.س</small>
              </strong>
              <bdi>${dualPrice(o.usdCents).usd} USD</bdi>
            </div>
            <p>{yearly ? "كل سنة" : "كل شهر"} · اشتراك يتجدد تلقائيًا</p>
            <ul>
              <li>{o.drafts === 2 ? "مسودتان" : "حتى 10 مسودات"} محفوظة</li>
              <li>{o.aiOperations} عمليات ذكاء اصطناعي تتجدد كل شهر</li>
              <li>ثلاثة قوالب بالعربية والإنجليزية</li>
              <li>إلغاء التجديد من حسابك</li>
            </ul>
            <button className="primary full" onClick={onChoose}>
              {live ? "اختيار الباقة" : "عرض خيارات الحساب"}
            </button>
          </article>
        ))}
      </div>
      <p className="billing-disclosure">
        السعر المحصل بالدولار، ومقابل الريال تقريبي بسعر 3.75 ريال للدولار.
        السعر يشمل الضريبة الأساسية، ويظهر الإجمالي النهائي في Paddle قبل تأكيد
        الشراء. الرصيد الشهري غير المستخدم لا يتراكم. الرصيد الإضافي المشترى
        محفوظ دون انتهاء ويحتاج اشتراكًا فعّالًا لاستخدامه.
      </p>
      <h3>شحن رصيد اختياري</h3>
      <div className="billing-packs">
        {BILLING_OFFERS.filter((o) => o.kind === "ai").map((o) => (
          <button key={o.sku} onClick={onChoose}>
            <strong>{o.aiOperations} عملية</strong>
            <span>
              {o.sarTarget} ر.س · <bdi>${dualPrice(o.usdCents).usd}</bdi>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
