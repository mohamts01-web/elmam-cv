import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Link2,
  Plus,
  ArrowUp,
  ArrowDown,
  EyeOff,
  Copy,
  Trash2,
  Settings2,
  List,
  Check,
  X,
} from "lucide-react";
import { resumeHTML } from "../shared/render.mjs";
import { SECTION_KEYS, editorDesign } from "../shared/editor.mjs";
import { sectionNames } from "../shared/presentation.mjs";
import type { Resume, Design } from "./types";
const fonts = `@font-face{font-family:ETMAMCV;src:url('/fonts/tajawal-arabic-400-normal.woff2');unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFF}@font-face{font-family:ETMAMCV;src:url('/fonts/tajawal-arabic-700-normal.woff2');font-weight:700;unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFF}@font-face{font-family:ETMAMCV;src:url('/fonts/tajawal-latin-400-normal.woff2')}@font-face{font-family:ETMAMCV;src:url('/fonts/tajawal-latin-700-normal.woff2');font-weight:700}`;
type Format = NonNullable<Design["textFormats"]>[string];
type Props = {
  data: Resume;
  design: Design;
  zoom: number;
  onSection: (s: string) => void;
  onInline: (path: string, text: string, format: Format) => void;
  onDesign: (d: Design) => void;
  onItem: (section: string, index: number, action: string) => void;
  onDeleteSection: (section: string) => void;
};
export default function InlinePaper(props: Props) {
  const { data, design, zoom } = props,
    ref = useRef<HTMLIFrameElement>(null),
    current = useRef(props);
  current.current = props;
  const [height, setHeight] = useState(1123),
    [selected, setSelected] = useState(""),
    [item, setItem] = useState(""),
    [top, setTop] = useState(0),
    [sectionsOpen, setSectionsOpen] = useState(false),
    [linkOpen, setLinkOpen] = useState(false),
    [link, setLink] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false),
    [hint, setHint] = useState("");
  const active = useRef<HTMLElement | null>(null),
    range = useRef<Range | null>(null),
    editing = useRef(false),
    pending = useRef("");
  const linking = useRef(false);
  const nextHtml =
    resumeHTML(data, design, fonts) +
    `<style>body{min-height:297mm}[data-section]{position:relative;border-radius:3px}[data-section]:hover{outline:1px solid #14b8a6;outline-offset:7px}[data-field]{min-width:8px;cursor:text}[data-field]:hover{background:#14b8a614}[data-field]:focus{outline:1px dashed #0d9488;background:#edfdf9}[contenteditable]:empty::before{content:"اكتب هنا";color:#92a6af}</style>`;
  const [html, setHtml] = useState(nextHtml);
  useEffect(() => {
    pending.current = nextHtml;
    if (!editing.current) setHtml(nextHtml);
  }, [nextHtml]);
  const capture = (el: HTMLElement) => {
    const text = el.textContent || "",
      marks: Format["marks"] = [];
    let offset = 0;
    const walk = (node: Node) => {
      if (node.nodeType === 3) {
        const start = offset;
        offset += (node.textContent || "").length;
        let p = node.parentElement,
          bold = false,
          italic = false,
          underline = false,
          href = "";
        while (p && p !== el) {
          bold ||=
            ["B", "STRONG"].includes(p.tagName) ||
            Number(p.style.fontWeight) >= 600;
          italic ||=
            ["I", "EM"].includes(p.tagName) || p.style.fontStyle === "italic";
          underline ||= p.tagName === "U";
          if (p.tagName === "A") href = p.getAttribute("href") || "";
          p = p.parentElement;
        }
        if (offset > start && (bold || italic || underline || href))
          marks.push({
            start,
            end: offset,
            bold,
            italic,
            underline,
            ...(href ? { href } : {}),
          });
      } else node.childNodes.forEach(walk);
    };
    el.childNodes.forEach(walk);
    current.current.onInline(el.dataset.field!, text, { text, marks });
  };
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let clean = () => {};
    const ready = () => {
      clean();
      const doc = frame.contentDocument;
      if (!doc) return;
      const resize = () =>
        setHeight(Math.max(1123, doc.documentElement.scrollHeight));
      const ro = new ResizeObserver(resize);
      ro.observe(doc.body);
      doc.fonts.ready.then(resize);
      doc.querySelectorAll<HTMLElement>("[data-field]").forEach((el) => {
        el.contentEditable = "true";
        el.setAttribute("role", "textbox");
        el.setAttribute("aria-label", "تحرير " + el.dataset.field);
        el.spellcheck = false;
      });
      const select = (el: HTMLElement) => {
        const section = el.closest<HTMLElement>("[data-section]");
        if (!section) return;
        setSelected(section.dataset.section!);
        setTop(Math.max(0, section.offsetTop * zoom - 50));
        const target = el.closest<HTMLElement>("[data-entry],[data-item]");
        setItem(target?.dataset.entry || target?.dataset.item || "");
      };
      const click = (e: MouseEvent) => {
        const el = e.target as HTMLElement;
        if (el.closest("a")) e.preventDefault();
        select(el);
      };
      const hover = (e: MouseEvent) => {
        if (!editing.current) select(e.target as HTMLElement);
      };
      const focus = (e: FocusEvent) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-field]",
        );
        if (el) {
          active.current = el;
          editing.current = true;
          select(el);
        }
      };
      const input = (e: Event) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-field]",
        );
        if (el) capture(el);
        resize();
      };
      const blur = (e: FocusEvent) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-field]",
        );
        if (el) capture(el);
        if (linking.current) return;
        editing.current = false;
        setTimeout(() => {
          if (!editing.current) setHtml(pending.current);
        }, 0);
      };
      const paste = (e: ClipboardEvent) => {
        if (!(e.target as HTMLElement).closest("[data-field]")) return;
        e.preventDefault();
        doc.execCommand(
          "insertText",
          false,
          (e.clipboardData?.getData("text/plain") || "").slice(0, 2000),
        );
      };
      const key = (e: KeyboardEvent) => {
        if (!(e.target as HTMLElement).closest("[data-field]")) return;
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) (e.target as HTMLElement).blur();
          else doc.execCommand("insertText", false, "\n");
        }
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        if (
          (e.ctrlKey || e.metaKey) &&
          ["b", "i", "u"].includes(e.key.toLowerCase())
        ) {
          e.preventDefault();
          doc.execCommand(
            (
              { b: "bold", i: "italic", u: "underline" } as Record<
                string,
                string
              >
            )[e.key.toLowerCase()],
          );
          capture(e.target as HTMLElement);
        }
      };
      const selection = () => {
        const s = doc.getSelection();
        if (s?.rangeCount && active.current?.contains(s.anchorNode))
          range.current = s.getRangeAt(0).cloneRange();
      };
      doc.addEventListener("click", click);
      doc.addEventListener("mouseover", hover);
      doc.addEventListener("focusin", focus);
      doc.addEventListener("focusout", blur);
      doc.addEventListener("input", input);
      doc.addEventListener("paste", paste);
      doc.addEventListener("keydown", key);
      doc.addEventListener("selectionchange", selection);
      resize();
      clean = () => {
        ro.disconnect();
        doc.removeEventListener("click", click);
        doc.removeEventListener("mouseover", hover);
        doc.removeEventListener("focusin", focus);
        doc.removeEventListener("focusout", blur);
        doc.removeEventListener("input", input);
        doc.removeEventListener("paste", paste);
        doc.removeEventListener("keydown", key);
        doc.removeEventListener("selectionchange", selection);
      };
    };
    frame.addEventListener("load", ready);
    return () => {
      frame.removeEventListener("load", ready);
      clean();
    };
  }, [html, zoom]);
  const format = (command: string, value?: string) => {
    const doc = ref.current?.contentDocument,
      el = active.current;
    if (!doc || !el || !range.current || range.current.collapsed) {
      setHint("حدّد الكلمات داخل الورقة أولًا لتنسيقها.");
      return;
    }
    if (!doc.contains(range.current.commonAncestorContainer)) {
      setHint("حدّد النص مجددًا.");
      return;
    }
    el.focus();
    const s = doc.getSelection();
    s?.removeAllRanges();
    s?.addRange(range.current);
    doc.execCommand(command, false, value);
    capture(el);
    setHint("حُفظ تنسيق النص مع المسودة.");
  };
  const layout = editorDesign(design) as {
      order: string[];
      hidden: string[];
      sections: NonNullable<Design["sections"]>;
    },
    label =
      (sectionNames as Record<string, string>)[selected] || "البيانات الشخصية";
  const finishEditing = () => {
    linking.current = false;
    active.current?.blur();
    editing.current = false;
    range.current = null;
  };
  const styleSection = (update: object) => {
    finishEditing();
    props.onDesign({
      ...design,
      sections: {
        ...layout.sections,
        [selected]: { ...layout.sections[selected], ...update },
      },
    });
  };
  const move = (by: number) => {
    finishEditing();
    const order = [...layout.order],
      i = order.indexOf(selected),
      j = i + by;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    props.onDesign({ ...design, order });
  };
  const itemAction = (action: string) => {
    finishEditing();
    const parts = item.split("."),
      index = parts.pop();
    if (index !== undefined)
      props.onItem(parts.join("."), Number(index), action);
  };
  return (
    <div
      className="paper-space inline-paper"
      style={{ width: 794 * zoom, height: height * zoom }}
    >
      <button
        className="paper-section-toggle"
        onClick={() => setSectionsOpen(!sectionsOpen)}
      >
        <Plus size={15} />
        الأقسام
      </button>
      {sectionsOpen && (
        <div className="paper-sections-menu" dir="rtl">
          <strong>إضافة قسم أو إظهاره</strong>
          {SECTION_KEYS.map((key: string) => (
            <button
              key={key}
              onClick={() => {
                finishEditing();
                props.onDesign({
                  ...design,
                  hidden: layout.hidden.filter((x: string) => x !== key),
                });
                props.onSection(key);
                setSectionsOpen(false);
              }}
            >
              {(sectionNames as Record<string, string>)[key]}
              {layout.hidden.includes(key) ? " — مخفي" : ""}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div
          className="paper-inline-toolbar"
          style={{ top }}
          dir="rtl"
          onMouseDown={(e) => e.preventDefault()}
        >
          <strong>{label}</strong>
          <button
            aria-label="تعديل حقول القسم"
            onClick={() => {
              finishEditing();
              props.onSection(selected);
            }}
          >
            <Settings2 size={15} />
          </button>
          <button
            title="إضافة عنصر"
            onClick={() => {
              finishEditing();
              props.onSection(selected);
            }}
          >
            <Plus size={15} />
            عنصر
          </button>
          <button aria-label="غامق" onClick={() => format("bold")}>
            <Bold size={16} />
          </button>
          <button aria-label="مائل" onClick={() => format("italic")}>
            <Italic size={16} />
          </button>
          <button aria-label="تسطير" onClick={() => format("underline")}>
            <Underline size={16} />
          </button>
          <button
            aria-label="إضافة رابط للنص"
            onClick={() => {
              linking.current = !linkOpen;
              if (linkOpen) finishEditing();
              setLinkOpen(!linkOpen);
              setLink("");
            }}
          >
            <Link2 size={16} />
          </button>
          {selected !== "identity" && (
            <>
              <button
                aria-label="تصغير نص القسم"
                onClick={() =>
                  styleSection({
                    fontSize: Math.max(
                      9,
                      (layout.sections[selected]?.fontSize || design.fontSize) -
                        1,
                    ),
                  })
                }
              >
                A−
              </button>
              <button
                aria-label="تكبير نص القسم"
                onClick={() =>
                  styleSection({
                    fontSize: Math.min(
                      14,
                      (layout.sections[selected]?.fontSize || design.fontSize) +
                        1,
                    ),
                  })
                }
              >
                A+
              </button>
              <button
                aria-label="تبديل القائمة النقطية"
                onClick={() =>
                  styleSection({
                    bullets: layout.sections[selected]?.bullets === false,
                  })
                }
              >
                <List size={16} />
              </button>
              <button aria-label="تحريك القسم لأعلى" onClick={() => move(-1)}>
                <ArrowUp size={16} />
              </button>
              <button aria-label="تحريك القسم لأسفل" onClick={() => move(1)}>
                <ArrowDown size={16} />
              </button>
              <button
                aria-label="إخفاء القسم"
                onClick={() => {
                  finishEditing();
                  props.onDesign({
                    ...design,
                    hidden: [...layout.hidden, selected],
                  });
                  setSelected("");
                }}
              >
                <EyeOff size={16} />
              </button>
            </>
          )}
          {item && (
            <>
              <button
                aria-label="نسخ العنصر"
                onClick={() => itemAction("copy")}
              >
                <Copy size={15} />
              </button>
              <button
                aria-label="تحريك العنصر لأعلى"
                onClick={() => itemAction("up")}
              >
                <ArrowUp size={14} />
              </button>
              <button
                aria-label="تحريك العنصر لأسفل"
                onClick={() => itemAction("down")}
              >
                <ArrowDown size={14} />
              </button>
              <button
                aria-label="حذف العنصر"
                onClick={() => itemAction("delete")}
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
          {selected !== "identity" && (
            <button
              aria-label="حذف القسم"
              onClick={() => setConfirmDelete(!confirmDelete)}
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            aria-label="إغلاق أدوات النص"
            onClick={() => {
              setSelected("");
              active.current?.blur();
            }}
          >
            <X size={15} />
          </button>
          {linkOpen && (
            <form
              className="inline-link-form"
              onMouseDown={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                if (/^(https:\/\/[^\s<>"']+|mailto:[^\s<>"']+)$/.test(link)) {
                  format("createLink", link);
                  setLinkOpen(false);
                  linking.current = false;
                } else setHint("استخدم رابطًا يبدأ بـ https:// أو mailto:");
              }}
            >
              <input
                aria-label="عنوان الرابط"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://…"
                dir="ltr"
              />
              <button aria-label="حفظ الرابط">
                <Check size={16} />
              </button>
            </form>
          )}
          {confirmDelete && (
            <div className="inline-delete-confirm">
              حذف محتوى القسم؟
              <button
                onClick={() => {
                  finishEditing();
                  props.onDeleteSection(selected);
                  setSelected("");
                  setConfirmDelete(false);
                }}
              >
                تأكيد الحذف
              </button>
              <button onClick={() => setConfirmDelete(false)}>إلغاء</button>
            </div>
          )}
          {hint && (
            <small className="inline-hint" role="status">
              {hint}
            </small>
          )}
        </div>
      )}
      <iframe
        ref={ref}
        title="ورقة السيرة — تحرير مباشر"
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
