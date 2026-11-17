import { useEffect, useRef } from "react";

// Adapted from Kedhareswer Naidu's Stipple Orb and Longhand Notes (MIT).
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const light = Math.hypot(.5, -.72, .48);
const dots = Array.from({ length: 420 }, (_, i) => {
  const r = Math.sqrt((i + .5) / 420);
  const angle = i * 2.399963;
  const x = r * Math.cos(angle), y = r * Math.sin(angle);
  const lit = (x * .5 - y * .72 + Math.sqrt(1 - r * r) * .48) / light;
  return { x, y, lit, density: .1 + .9 * smooth(-.7, .75, lit) };
});

export function TemplateStepIcon({ step }: { step: number }) {
  return <svg className="template-step-icon" width="64" height="64" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {step === 0 ? <g><rect x="6" y="10" width="36" height="28" rx="3" /><circle cx="18" cy="21" r="5" /><path d="M10 33c2-5 14-5 16 0M29 19h8M29 25h8M29 31h5" /></g>
      : step === 1 ? <g><rect x="8" y="8" width="32" height="32" rx="2" /><path d="M8 18h32M8 28h32M20 8v32" /></g>
      : <g transform="scale(3)"><path d="M9.5 2.5c2.5 0 4 1.5 4 4L8 12l-4-4 5.5-5.5Z" strokeWidth="1" /><path d="M4 8 2 8.5 4 6M8 12l-.5 2 2-2" strokeWidth="1" /><circle cx="10" cy="6" r="1" strokeWidth="1" /></g>}
  </svg>;
}

export function CareerArtwork() {
  const arm = useRef<SVGPolylineElement>(null);
  const joint = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    let frame = 0;
    const start = performance.now();
    function draw(now: number) {
      const progress = Math.min(1, (now - start) / 2400);
      const tx = 515 - 200 * progress;
      const ty = 364 + 6 * Math.sin(progress * Math.PI * 3);
      // The template's two-link plotter geometry, fixed to this scene.
      const dx = tx - 686, dy = ty - 530;
      const d = Math.min(439.999, Math.max(.001, Math.hypot(dx, dy)));
      const angle = Math.atan2(dy, dx) + Math.acos(d / 440);
      const ex = 686 + 220 * Math.cos(angle), ey = 530 + 220 * Math.sin(angle);
      arm.current?.setAttribute("points", `686,530 ${ex},${ey} ${tx},${ty}`);
      joint.current?.setAttribute("cx", String(ex));
      joint.current?.setAttribute("cy", String(ey));
      if (progress < 1 && !media.matches) frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <svg className="career-artwork" viewBox="0 0 1100 650" role="img" aria-label="ذراع رسم يضع خطًا تحت المسمّى في سيرة ذاتية، بجوار كرة منقّطة">
    <circle cx="810" cy="305" r="251" fill="#002754" stroke="#116176" />
    {dots.map(({ x, y, lit, density }, i) => <circle key={i} cx={810 + x * 245} cy={305 + y * 245} r={1.2 + density * 3} opacity={Math.max(.12, lit * .76)} fill="#8ee4e8" />)}
    <path className="career-ink" d="M150 92C260 20 330 20 400 74S560 150 620 92S760 0 810 70S960 140 1080 60" transform="translate(0 475)" pathLength={1} fill="none" stroke="#8ee4e8" strokeWidth={4} />
    <g>
      <rect x="100" y="138" width="493" height="382" rx="18" fill="#fff" />
      <path d="M145 208h400M145 284h400M145 415h400M145 459h285" stroke="#dce8ef" strokeWidth="8" strokeLinecap="round" />
      <text x="540" y="253" direction="rtl" textAnchor="start" fill="#002754" fontSize="41" fontWeight="900">سيرتي الذاتية</text>
      <text x="540" y="345" direction="rtl" textAnchor="start" fill="#002754" fontSize="33" fontWeight="700">أخصائية عمليات</text>
      <path className="career-ink career-underline" d="M515 364Q420 376 315 364" pathLength={1} stroke="#0496a1" strokeWidth="6" fill="none" strokeLinecap="round" />
    </g>
    <rect x="641" y="525" width="116" height="36" rx="11" fill="#0496a1" />
    <polyline ref={arm} points="686,530 550,382 515,364" fill="none" stroke="#79dce2" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
    <circle ref={joint} cx="550" cy="382" r="17" fill="#002754" stroke="#79dce2" strokeWidth="6" />
  </svg>;
}
