import { mkdir, readFile, writeFile } from "node:fs/promises";

const origin = "https://cv.cvsira.com";
const site = "إلمام CV";
const pages = [
  {
    slug: "ats-resume",
    title: "إنشاء سيرة ذاتية متوافقة مع ATS",
    description: "تعرّف على طريقة ترتيب السيرة الذاتية لأنظمة تتبع المتقدمين وابدأ بناءها بالعربية أو الإنجليزية.",
    sections: [
      ["ابدأ بالمسمى المطلوب", "اذكر المسمى الذي تستهدفه في الملخص بصياغة تعكس مستواك، ثم اربط المهارات المذكورة في الإعلان بخبرتك الفعلية."],
      ["اجعل الأقسام سهلة القراءة", "رتّب بيانات التواصل، والملخص، والخبرات، والتعليم، والمهارات تحت عناوين واضحة. استخدم نصًا قابلًا للتحديد عند تنزيل الملف."],
      ["مثال على وصف مسؤولية", "أعددت تقارير المخزون الأسبوعية باستخدام Excel، وتابعت الفروقات مع فريق المستودع. غيّر المثال حتى يعكس الأدوات والمهام التي مارستها فعليًا."],
    ],
  },
  {
    slug: "graduate-resume",
    title: "نموذج سيرة ذاتية لحديثي التخرج",
    description: "رتّب مؤهلك ومشاريعك وتدريبك في سيرة ذاتية تناسب أول وظيفة في السعودية.",
    sections: [
      ["ابدأ بالمؤهل والتخصص", "اعرض الدرجة العلمية والتخصص والجهة وسنة التخرج. أضف التدريب التعاوني أو تمهير تحت عنوان يوضح نوع التجربة إذا سبق أن شاركت فيه."],
      ["صف دورك في مشروع", "اذكر المشكلة التي عالجها المشروع، ودورك فيه، والأدوات التي استخدمتها والنتيجة التي تستطيع شرحها في المقابلة."],
      ["مثال لملخص مهني", "حديث تخرج في المحاسبة. أعددت ضمن مشروع التخرج نموذجًا لمتابعة المصروفات باستخدام Excel، وأبحث عن فرصة أولى في المحاسبة المالية."],
    ],
  },
  {
    slug: "english-resume",
    title: "نموذج سيرة ذاتية بالإنجليزية",
    description: "أمثلة عملية لكتابة سيرة إنجليزية بمصطلحات مهنية واضحة تناسب التقديم على الوظائف.",
    sections: [
      ["استخدم عناوين واضحة", "ابدأ ببيانات التواصل ثم Professional Summary وExperience وEducation وSkills. استخدم التهجئة التي تعتمدها لاسمك، وراجع الأسماء الإنجليزية للجهات والشهادات."],
      ["ابدأ نقاط الخبرة بفعل", "يفيد استخدام أفعال مثل Prepared وCoordinated وAnalyzed عندما تعبّر عن عملك. اذكر الأداة والسياق عندما يساعدان على فهم مسؤوليتك."],
      ["مثال لصياغة خبرة", "Prepared weekly inventory reports in Excel and coordinated with the warehouse team to investigate discrepancies."],
    ],
  },
];

for (const page of pages) {
  const directory = new URL(`../dist/${page.slug}/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("index.html", directory), `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${page.title} | ${site}</title><meta name="description" content="${page.description}">
<link rel="canonical" href="${origin}/${page.slug}/"><link rel="stylesheet" href="/search-guide.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;900&amp;display=swap">
<meta property="og:title" content="${page.title} | ${site}"><meta property="og:description" content="${page.description}">
<meta property="og:url" content="${origin}/${page.slug}/"></head>
<body><header><a href="/">إلمام CV</a><a href="/plans">الباقة</a></header>
<main><p>أدلة السيرة الذاتية</p><h1>${page.title}</h1><p>${page.description}</p>
${page.sections.map(([heading, copy]) => `<section><h2>${heading}</h2><p>${copy}</p></section>`).join("\n")}
<a class="action" href="/start">أنشئ سيرتك الذاتية ←</a>
<nav aria-label="أدلة أخرى">${pages.filter(other => other !== page).map(other => `<a href="/${other.slug}/">${other.title}</a>`).join("")}</nav>
</main></body></html>`);
}

const index = new URL("../dist/index.html", import.meta.url);
const app = await readFile(index, "utf8");
await writeFile(index, app.replace("</head>", '<meta name="robots" content="noindex,follow"></head>'));
const homeMetadata = `<link rel="canonical" href="${origin}/">
<meta property="og:type" content="website"><meta property="og:site_name" content="${site}">
<meta property="og:title" content="إنشاء سيرة ذاتية ATS بالعربية والإنجليزية | ${site}">
<meta property="og:url" content="${origin}/">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: site, alternateName: "Elmam CV", url: origin + "/" })}</script>`;
const home = app.replace("</head>", homeMetadata + "</head>").replace('<div id="root"></div>', `<div id="root">
<main><h1>أنشئ سيرتك الذاتية بالعربية أو الإنجليزية</h1>
<p>خصّص سيرتك للوظيفة التي تستهدفها، ونظّم خبراتك في قالب واضح لأنظمة ATS. ابدأ وعاين سيرتك مجانًا.</p>
<a href="/start">ابدأ سيرتك</a>
<nav aria-label="أدلة السيرة الذاتية">${pages.map(page => `<a href="/${page.slug}/">${page.title}</a>`).join("")}</nav>
</main></div>`);
await writeFile(new URL("../dist/_home.html", import.meta.url), home);
await writeFile(new URL("../dist/sitemap.xml", import.meta.url), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${["", ...pages.map(page => page.slug + "/")].map(path => `<url><loc>${origin}/${path}</loc></url>`).join("\n")}
</urlset>`);
