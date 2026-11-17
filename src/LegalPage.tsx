import policies from "./public-policies.json";
export function PolicyLinks() {
  return (
    <nav className="policy-links" aria-label="سياسات إلمام CV">
      <a href="/terms">شروط الاستخدام</a>
      <a href="/privacy">الخصوصية</a>
      <a href="/refunds">الإلغاء والاسترداد</a>
      <a href="/contact">تواصل معنا</a>
    </nav>
  );
}
function LinkedText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https:\/\/[^\s]+)/g).map((part, i) =>
        part.startsWith("https://") ? (
          <a key={i} href={part} target="_blank" rel="noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}
export default function LegalPage({ slug }: { slug: string }) {
  const page = policies.find((p) => p.slug === slug);
  return (
    <main className="container policy-page">
      <a href="/">العودة إلى إلمام CV</a>
      <h1>{page?.title || "تواصل مع إلمام CV"}</h1>
      <p className="muted">آخر تحديث: 1 نوفمبر 2026</p>
      {page ? (
        page.paragraphs.map((p, i) => (
          <p key={i}>
            <LinkedText text={p} />
          </p>
        ))
      ) : (
        <>
          <p>
            للمساعدة في الاشتراك أو تفعيل الشراء أو المسودات، تواصل مع فريق
            إلمام CV عبر البريد:
          </p>
          <a className="primary" href="mailto:cvsira.sa@gmail.com">
            cvsira.sa@gmail.com
          </a>
          <p>
            يمكنك أيضًا التواصل مع الدعم عبر{" "}
            <a href="https://t.me/mohamdto21" target="_blank" rel="noreferrer">
              تيليجرام
            </a>
            . للاستفسار عن شراء باقة زد أو طلب استرداد، أرسل رقم طلبك في المتجر إلى الدعم.
          </p>
        </>
      )}
      <p>
        بريد الدعم: <a href="mailto:cvsira.sa@gmail.com">cvsira.sa@gmail.com</a>
      </p>
      <PolicyLinks />
    </main>
  );
}
