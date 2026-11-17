import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import type { Account, Draft, Resume, Design, Job } from "./types";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const auth =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;
export const emailLoginReady =
  import.meta.env.VITE_EMAIL_LOGIN_READY === "true";
const base =
  import.meta.env.VITE_ETMAM_API_URL ||
  (url ? url + "/functions/v1/etmam-api" : "");
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  if (!auth || !base)
    throw new ApiError(
      "الخدمة السحابية لم تُربط بعد. يمكنك تجربة التحرير والمعاينة الآن.",
      503,
    );
  const { data } = await auth.auth.getSession();
  if (!data.session) throw new ApiError("سجّل الدخول للمتابعة.", 401);
  const r = await fetch(base + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      Authorization: "Bearer " + data.session.access_token,
      apikey: key,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await r
    .json()
    .catch(() => ({ error: "تعذر الاتصال بالخدمة." }));
  if (!r.ok) throw new ApiError(result.error || "تعذرت العملية.", r.status);
  return result;
}
export const api = {
  whopCatalog: () => request<{ ready: boolean; environment: "sandbox" | "live" | null; offer: {
    amountMinor: number; days: number; drafts: number; aiOperations: number;
  } | null }>("/billing/whop/catalog"),
  whopCheckout: (intentId: string, referralJobId?: number) =>
    request<{ url: string | null; completed: boolean }>("/billing/whop/checkout", { intentId, referralJobId }),
  whopStatus: (intentId: string) =>
    request<{ completed: boolean }>("/billing/whop/status", { intentId }),
  whopConfirm: (intentId: string, paymentId: string) =>
    request<{ completed: boolean }>("/billing/whop/confirm", { intentId, paymentId }),
  previewPlanChange: (sku: string) =>
    request<any>("/billing/change-preview", { sku }),
  confirmPlanChange: (id: string) =>
    request<any>("/billing/change-confirm", { id }),
  billingPublic: async () => {
    const r = await fetch(base + "/billing/public", {
      headers: { apikey: key },
    });
    if (!r.ok) throw Error("unavailable");
    return r.json() as Promise<{ liveReady: boolean }>;
  },
  billingCatalog: () => request<any>("/billing/catalog"),
  billingStatus: () => request<any>("/billing/status"),
  checkout: (sku: string, idempotencyKey: string) =>
    request<{ intentId: string; transactionId: string }>("/billing/checkout", {
      sku,
      idempotencyKey,
    }),
  confirmPayment: (intentId: string) =>
    request<{ completed: boolean; transactionId?: string; sku?: string }>(
      "/billing/confirm",
      { intentId },
    ),
  billingPortal: () => request<{ url: string }>("/billing/portal", {}),
  cancelCheckout: (intentId: string) =>
    request<{ canceled: boolean }>("/billing/cancel-checkout", { intentId }),
  me: () => request<Account>("/me"),
  drafts: () => request<Draft[]>("/drafts"),
  getDraft: (id: string) => request<Draft>("/drafts/" + id),
  create: (content: Resume, design: Design, title: string) =>
    request<Draft>("/drafts", { content, design, title }),
  save: (d: Draft) =>
    request<Draft>(
      "/drafts/" + d.id,
      {
        content: d.content,
        design: d.design,
        title: d.title,
        revision: d.revision,
      },
      "PUT",
    ),
  approve: (d: Draft) =>
    request<Draft>("/drafts/" + d.id + "/approve", { revision: d.revision }),
  redeem: (code: string) => request<Account>("/redeem", { code }),
  link: () => request<{ url: string }>("/link", {}),
  startJob: (kind: string, d: Draft, extra: object = {}) =>
    request<Job>("/jobs", {
      kind,
      draftId: d.id,
      revision: d.revision,
      idempotencyKey: crypto.randomUUID(),
      ...extra,
    }),
  job: (id: string) => request<Job>("/jobs/" + id),
  apply: (id: string, revision: number, keys?: string[]) =>
    request<Draft>("/jobs/" + id + "/apply", { revision, keys }),
  remove: (id: string) => request("/drafts/" + id, undefined, "DELETE"),
};
export async function waitJob(job: Job): Promise<Job> {
  for (let i = 0; i < 65; i++) {
    if (["completed", "failed", "uncertain"].includes(job.state)) return job;
    await new Promise((r) => setTimeout(r, 1800));
    job = await api.job(job.id);
  }
  throw new ApiError(
    "الطلب ما زال قيد المعالجة. يمكنك العودة لاحقًا دون تكرار الخصم.",
    202,
  );
}
export type { Session };
