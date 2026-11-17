import { createClient } from "npm:@supabase/supabase-js@2.57.4";
let runtime: Record<string, string> = {};
export const env = (key: string) => {
  const value = Deno.env.get(key) || runtime[key];
  if (!value) throw Error("configuration_required");
  return value;
};
export const optionalEnv = (key: string) => Deno.env.get(key) || runtime[key] || "";
export function client() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
// Managed platform secrets take precedence. Vault provides an encrypted, service-only fallback.
const config = await client().rpc("etmam_runtime");
if (!config.error && config.data) runtime = config.data;
export async function command<T = unknown>(
  actor: string | null,
  action: string,
  payload: unknown = {},
): Promise<T> {
  const { data, error } = await client().rpc("etmam_command", {
    p_actor: actor,
    p_action: action,
    p_payload: payload,
  });
  if (error) throw Error(error.message);
  if (data?.error) throw Error(data.error);
  return data;
}
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function legacyHash(value: string) {
  const bytes = Uint8Array.from(atob(env("ETMAM_LEGACY_HMAC_KEY")), (c) =>
    c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function secretEqual(a: string, b: string) {
  if (!a || !b) return false;
  const x = await digest(a),
    y = await digest(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
const messages: Record<string, string> = {
  subscription_required: "فعّل الباقة أو جدّدها للمتابعة.",
  draft_limit: "وصلت إلى حد المسودات في باقتك. احذف مسودة أو اختر باقة أعلى.",
  offer_unavailable: "هذا الخيار غير متاح للدفع حاليًا.",
  subscription_exists: "لديك اشتراك متجدد. افتح إدارة الاشتراك لتغييره أو إلغاء تجديده دون إنشاء اشتراك ثانٍ.",
  checkout_rate_limit: "طلبات دفع كثيرة. انتظر قليلًا قبل المحاولة مجددًا.",
  payment_mismatch: "تعذّر التحقق من بيانات الدفعة. تواصل مع الدعم ولا تكرر الدفع.",
  checkout_pending: "طلب الدفع السابق قيد التحقق. لا تكرر الدفع؛ حدّث الحالة بعد قليل.",
  revision_conflict: "وصل تعديل أحدث. حدّث المسودة قبل تطبيق تغييراتك.",
  invalid_code: "كود التفعيل غير صحيح أو غير متاح.",
  code_used:
    "هذا الكود مفعّل لحساب آخر. اربط حساب تيليجرام إذا كنت فعّلته هناك.",
  activation_rate_limit: "محاولات كثيرة. انتظر 15 دقيقة.",
  ai_limit: "انتهى رصيد عمليات الذكاء الاصطناعي.",
  consent_required: "الموافقة على معالجة المحتوى مطلوبة.",
  approval_required: "راجع بيانات السيرة واعتمدها أولًا.",
  not_found: "الطلب غير متاح لهذا الحساب.",
  link_conflict:
    "يوجد حسابان مستخدمان ببيانات مستقلة. تواصل مع الدعم لربطهما دون فقدان بيانات.",
  link_expired: "انتهت صلاحية رابط الربط أو استُخدم. اطلب رابطًا جديدًا.",
  configuration_required: "الخدمة غير مهيأة حاليًا.",
  unauthorized: "سجّل الدخول للمتابعة.",
  feedback_limit: "وصلت إلى حد الرسائل اليومي.",
};
export function publicError(error: unknown) {
  const m = error instanceof Error ? error.message : "";
  for (const [key, message] of Object.entries(messages))
    if (m.includes(key))
      return {
        message,
        status:
          key === "revision_conflict"
            ? 409
            : key === "not_found"
              ? 404
              : key === "unauthorized"
                ? 401
                : key === "configuration_required"
                  ? 503
                  : 400,
      };
  if (
    m.length < 180 &&
    /^(اختر |راجع |أضف |بيانات السيرة |الحد |إضافة غير )/.test(m)
  )
    return { message: m, status: 400 };
  return {
    message: "تعذرت العملية الآن. بياناتك محفوظة؛ حاول لاحقًا.",
    status: 503,
  };
}
export async function readJSON(req: Request, max = 7500000) {
  const length = Number(req.headers.get("content-length"));
  if (length > max) throw Error("request_too_large");
  const stream = req.body?.getReader();
  if (!stream) return {};
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await stream.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await stream.cancel();
      throw Error("request_too_large");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(new TextDecoder().decode(result));
}
