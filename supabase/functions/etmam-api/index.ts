import {
  client,
  command,
  digest,
  env,
  legacyHash,
  publicError,
  readJSON,
  optionalEnv,
} from "../_shared/runtime.ts";
import { runJob, signPDF } from "../_shared/jobs.ts";
import { whopBilling } from "../_shared/whop-billing.ts";
import {
  billing,
  paddleCatalog,
  paddleCheckout,
  paddlePortal,
  paddleAPI,
  provisionPaddleTransaction,
  requirePaddleUser,
  previewPlanChange,
  confirmPlanChange,
} from "../_shared/paddle.ts";
import {
  normalizeCode,
  validateResume,
  validateDesign,
} from "../../../shared/model.mjs";
type Draft = {
  id: string;
  content: Parameters<typeof validateResume>[0];
  revision: number;
};
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
const cvOrigin = "https://cv.cvsira.com";
function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = env("ETMAM_WEB_ORIGINS").split(",");
  return {
    "Access-Control-Allow-Origin": origin === cvOrigin || allowed.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}
Deno.serve(async (req) => {
  const headers = cors(req);
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (
    new URL(req.url).pathname.endsWith("/billing/public") &&
    req.method === "GET"
  )
    return json({
      liveReady:
        optionalEnv("ETMAM_DIRECT_BILLING_ENABLED") === "true" &&
        optionalEnv("ETMAM_PADDLE_ENVIRONMENT") === "live" &&
        optionalEnv("ETMAM_PADDLE_LIVE_READY") === "true",
    });
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) throw Error("unauthorized");
    const { data, error } = await client().auth.getUser(token);
    if (error || !data.user?.email_confirmed_at || data.user.is_anonymous)
      throw Error("unauthorized");
    const actor = await command<string>(null, "resolve", {
      kind: "email",
      subject: data.user.id,
    });
    const path = new URL(req.url).pathname.replace(/^.*\/etmam-api/, "");
    const body = ["POST", "PUT"].includes(req.method)
      ? await readJSON(req)
      : {};
    if (path === "/billing/catalog" && req.method === "GET")
      return json(await paddleCatalog(actor, data.user.email || ""));
    if (path.startsWith("/billing/whop/"))
      return json(await whopBilling(actor, data.user.email || "", path, req.method, body,
        req.headers.get("Origin") === cvOrigin ? cvOrigin + "/plans" : undefined));
    if (path.startsWith("/billing/")) {
      requirePaddleUser(data.user.email || "", false);
      if (path === "/billing/checkout" && req.method === "POST")
        return json(await paddleCheckout(actor, data.user.email || "", body));
      if (path === "/billing/status" && req.method === "GET")
        return json(await billing(actor, "status"));
      if (path === "/billing/portal" && req.method === "POST")
        return json(await paddlePortal(actor, data.user.email || ""));
      if (path === "/billing/change-preview" && req.method === "POST")
        return json(
          await previewPlanChange(
            actor,
            data.user.email || "",
            String(body.sku || ""),
          ),
        );
      if (path === "/billing/change-confirm" && req.method === "POST")
        return json(
          await confirmPlanChange(
            actor,
            data.user.email || "",
            String(body.id || ""),
          ),
        );
      if (path === "/billing/cancel-checkout" && req.method === "POST") {
        const intent = await billing(actor, "intent.get", {
          id: body.intentId,
        });
        if (intent.completed || !intent.transactionId)
          throw Error("checkout_pending");
        const tx = await paddleAPI("/transactions/" + intent.transactionId);
        if (tx.status === "canceled") return json({ canceled: true });
        if (!["draft", "ready"].includes(tx.status))
          throw Error("checkout_pending");
        const canceled = await paddleAPI(
          "/transactions/" + tx.id,
          { status: "canceled" },
          "PATCH",
        );
        return json({ canceled: canceled.status === "canceled" });
      }
      if (path === "/billing/confirm" && req.method === "POST") {
        const intent = await billing(actor, "intent.get", {
          id: body.intentId,
        });
        if (!intent.completed && intent.transactionId)
          await provisionPaddleTransaction(
            intent.transactionId,
            "evt_" + crypto.randomUUID().replaceAll("-", "").slice(0, 26),
            new Date().toISOString(),
          );
        return json(await billing(actor, "intent.get", { id: body.intentId }));
      }
    }
    if (path === "/me" && req.method === "GET")
      return json(await command(actor, "me"));
    if (path === "/redeem" && req.method === "POST") {
      const raw = normalizeCode(body.code);
      if (!/^(?:[A-F0-9]{24}|[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8})$/.test(raw))
        throw Error("invalid_code");
      return json(
        await command(actor, "redeem", {
          hash: await legacyHash("activation:" + raw),
        }),
      );
    }
    if (path === "/link" && req.method === "POST") {
      const raw =
        crypto.randomUUID().replaceAll("-", "") +
        crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      await command(actor, "link.create", { hash: await digest(raw) });
      return json({ url: "https://t.me/etmam_cv_bot?start=link_" + raw });
    }
    if (path === "/drafts" && req.method === "GET")
      return json(await command(actor, "drafts.list"));
    if (path === "/drafts" && req.method === "POST")
      return json(
        await command(actor, "drafts.create", {
          title: String(body.title || "سيرتي الذاتية"),
          content: validateResume(body.content),
          design: validateDesign(body.design),
        }),
        201,
      );
    const match = path.match(/^\/drafts\/([0-9a-f-]{36})(\/approve)?$/i);
    if (match) {
      const id = match[1];
      if (req.method === "GET" && !match[2])
        return json(await command(actor, "drafts.get", { id }));
      if (req.method === "PUT" && !match[2])
        return json(
          await command(actor, "drafts.save", {
            id,
            revision: body.revision,
            title: String(body.title || "سيرتي الذاتية"),
            content: validateResume(body.content),
            design: validateDesign(body.design),
          }),
        );
      if (req.method === "DELETE" && !match[2])
        return json(await command(actor, "drafts.delete", { id }));
      if (req.method === "POST" && match[2]) {
        const d = await command<Draft>(actor, "drafts.get", { id });
        validateResume(d.content, { complete: true });
        return json(
          await command(actor, "drafts.approve", {
            id,
            revision: body.revision,
          }),
        );
      }
    }
    if (path === "/jobs" && req.method === "POST") {
      if (
        !["improve", "translate", "chat", "import", "export"].includes(
          body.kind,
        ) ||
        typeof body.idempotencyKey !== "string" ||
        body.idempotencyKey.length > 80
      )
        throw Error("invalid_job_kind");
      if (
        body.kind === "translate" &&
        !["ar", "en"].includes(body.targetLanguage)
      )
        throw Error("invalid_language");
      const job = await command<{ id: string }>(actor, "jobs.create", body);
      EdgeRuntime.waitUntil(runJob(actor, job.id));
      return json(job, 202);
    }
    const job = path.match(/^\/jobs\/([0-9a-f-]{36})(\/apply)?$/i);
    if (job) {
      if (req.method === "GET" && !job[2]) {
        const result = await command<{
          state: string;
          draft_id?: string;
          result?: { objectPath?: string; downloadUrl?: string };
        }>(actor, "jobs.get", { id: job[1] });
        if (result.result?.objectPath) {
          const current = result.draft_id
            ? await command<{ title: string }>(actor, "drafts.get", {
                id: result.draft_id,
              })
            : null;
          result.result = {
            downloadUrl: await signPDF(
              actor,
              result.result.objectPath,
              current?.title,
            ),
          };
        }
        return json(result);
      }
      if (req.method === "POST" && job[2])
        return json(
          await command(actor, "jobs.apply", {
            id: job[1],
            revision: body.revision,
            keys: body.keys,
          }),
        );
    }
    return json({ error: "الصفحة غير موجودة." }, 404);
  } catch (error) {
    const e = publicError(error);
    return json({ error: e.message }, e.status);
  }
});
