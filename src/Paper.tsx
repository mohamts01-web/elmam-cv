import { useEffect, useRef, useState } from "react";
import { resumeHTML } from "../shared/render.mjs";
import type { Resume, Design } from "./types";
const fonts = `@font-face{font-family:ETMAMCV;src:url('/fonts/tajawal-arabic-400-normal.woff2');unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFF}@font-face{font-family:ETMAMCV;src:url('/fonts/tajawal-arabic-700-normal.woff2');font-weight:700;unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFF}@font-face{font-family:ETMAMCV;src:url('/fonts/tajawal-latin-400-normal.woff2')}@font-face{font-family:ETMAMCV;src:url('/fonts/tajawal-latin-700-normal.woff2');font-weight:700}`;
export default function Paper({
  data,
  design,
  zoom = 0.72,
  onSection,
}: {
  data: Resume;
  design: Design;
  zoom?: number;
  onSection?: (s: string) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1123);
  const html =
    resumeHTML(
      data,
      design,
      fonts.replaceAll(
        "{font-family:ETMAMCV;",
        "{font-family:ETMAMCV;font-display:swap;",
      ),
    ) +
    `<style>body{min-height:297mm}header[data-section],section[data-section]{border-radius:3px} ${onSection ? "[data-section]{cursor:pointer}[data-section]:hover{outline:2px solid #14b8a6;outline-offset:6px;background:#14b8a609}" : ""}</style>`;
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let clean = () => {};
    const ready = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      const resize = () =>
        setHeight(Math.max(1123, doc.documentElement.scrollHeight));
      const ro = new ResizeObserver(resize);
      ro.observe(doc.body);
      doc.fonts.ready.then(resize);
      const click = (e: MouseEvent) => {
        const el = (e.target as HTMLElement).closest("[data-section]");
        if (onSection && el) {
          e.preventDefault();
          onSection(el.getAttribute("data-section")!);
        }
      };
      doc.addEventListener("click", click);
      clean = () => {
        ro.disconnect();
        doc.removeEventListener("click", click);
      };
      resize();
    };
    frame.addEventListener("load", ready);
    return () => {
      frame.removeEventListener("load", ready);
      clean();
    };
  }, [html, onSection]);
  return (
    <div
      className="paper-space"
      style={{ width: 794 * zoom, height: height * zoom }}
    >
      <iframe
        ref={ref}
        title="معاينة السيرة الذاتية — اضغط على قسم لتعديله"
        className="paper-frame"
        sandbox="allow-same-origin"
        srcDoc={html}
        style={{ width: 794, height, transform: `scale(${zoom})` }}
      />
      <div className="page-count">
        A4 · {Math.ceil(height / 1123)} {height > 1123 ? "صفحات" : "صفحة"}
      </div>
    </div>
  );
}
