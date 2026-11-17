import { command, env, legacyHash, digest, publicError } from "./runtime.ts";
import { runJob, signPDF } from "./jobs.ts";
import { aiResult, factsFor } from "./ai.ts";
import { createTelegramHandler } from "./bot/telegram-adapter.mjs";
import { createSession, answer, get } from "./bot/conversation.mjs";
import { pdfFilename } from "../../../shared/presentation.mjs";
import {
  defaultDesign,
  emptyResume,
  validateResume,
  normalizeCode,
  TEMPLATES,
} from "../../../shared/model.mjs";
async function telegram(method, body) {
  const form = body instanceof FormData;
  const r = await fetch(
    "https://api.telegram.org/bot" + env("ETMAM_TELEGRAM_TOKEN") + "/" + method,
    {
      method: "POST",
      ...(form
        ? { body }
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
      signal: AbortSignal.timeout(30000),
    },
  );
  const j = await r.json();
  if (!r.ok || !j.ok) throw Error("telegram_delivery_failed");
  return j.result;
}
export async function telegramActor(id) {
  const subject = await legacyHash(String(id));
  const legacy = String(
    await command(null, "resolve", { kind: "legacy", subject }),
  );
  await command(legacy, "identity.telegram", { subject });
  return legacy;
}
function rebuild(draft) {
  const d = { ...emptyResume(), ...draft.content };
  const s = createSession();
  answer(s, d.profile || "graduate");
  // Generate the same complete field definitions, including additional entries, without synthesizing answers.
  const groups = ["education", "experience", "projects"];
  for (const group of groups) {
    let more = s.steps.find((q) => q.repeat === group);
    for (let i = 1; i < (d[group] || []).length && more; i++) {
      const originalIndex = s.index;
      s.index = s.steps.indexOf(more);
      answer(s, "yes");
      s.index = originalIndex;
      more = s.steps.find((q) => q.repeat === group && q.index === i);
    }
  }
  s.id = draft.id;
  s.data = d;
  s.profile = d.profile;
  s.index = s.steps.length;
  s.revision = draft.revision;
  s.confirmedRevision =
    draft.approved_revision === draft.revision ? s.revision : null;
  s.history = [];
  return s;
}
export async function processTelegram(actor, update) {
  const message = update.message || update.callback_query?.message;
  const from = update.message?.from || update.callback_query?.from;
  if (
    !message ||
    message.chat?.type !== "private" ||
    String(message.chat.id) !== String(from?.id)
  )
    return;
  const id = String(from.id);
  const send = (chat, text, keyboard) =>
    telegram("sendMessage", {
      chat_id: chat,
      text,
      ...(keyboard ? { reply_markup: keyboard } : {}),
    });
  if (update.callback_query)
    await telegram("answerCallbackQuery", {
      callback_query_id: update.callback_query.id,
    }).catch(() => {});
  const link = message.text?.match(/^\/start link_([a-f0-9]{48})$/);
  const linkConfirm = update.callback_query?.data?.match(
    /^link:([a-f0-9]{48})$/,
  );
  if (link) {
    await send(
      id,
      "هل تريد ربط حساب تيليجرام هذا بحسابك في موقع إلمام CV؟\n\nرمز المطابقة: " +
        link[1].slice(-8).toUpperCase() +
        "\nطابق الرمز مع الرمز الظاهر في حسابك بالموقع قبل التأكيد. إذا لم تطلب الربط اختر «إلغاء».\nستتاح المسودات والباقات نفسها في الموقع والبوت. لا تشارك رابط الربط مع أحد.",
      {
        inline_keyboard: [
          [{ text: "تأكيد ربط حسابي", callback_data: "link:" + link[1] }],
          [{ text: "إلغاء", callback_data: "m:home" }],
        ],
      },
    );
    return;
  }
  if (linkConfirm) {
    try {
      await command(actor, "link.consume", {
        hash: await digest(linkConfirm[1]),
        subject: await legacyHash(id),
      });
      await send(id, "تم ربط حسابك ✅\nيمكنك العودة للموقع وتحديث حالة الربط.");
    } catch (e) {
      await send(id, publicError(e).message + "\nالدعم: @mohamdto21");
    }
    return;
  }
  let state = await command(actor, "session.get"),
    activeDraft = null;
  let exportedTitle = "";
  if (state?.active_draft) {
    activeDraft = await command(actor, "drafts.get", {
      id: state.active_draft,
    });
    if (activeDraft.revision !== state.base_revision) {
      state.body = rebuild(activeDraft);
      state.base_revision = activeDraft.revision;
    }
  }
  if (
    message.text === "/templates" ||
    update.callback_query?.data === "m:templates"
  ) {
    const a = await command(actor, "me");
    if (!a.membership?.active) {
      await send(id, "فعّل الباقة أو جدّدها لتغيير القالب.");
      return;
    }
    if (!activeDraft) {
      await send(id, "اختر مسودة من مسوداتك أولًا.", {
        inline_keyboard: [[{ text: "مسوداتي", callback_data: "p:drafts" }]],
      });
      return;
    }
    await send(
      id,
      "اختر قالب سيرتك. سيُستخدم القالب نفسه في الموقع وملف PDF.",
      {
        inline_keyboard: [
          ...TEMPLATES.map((t) => [
            {
              text: (activeDraft.design.template === t.id ? "✓ " : "") + t.name,
              callback_data: "t:" + t.id,
            },
          ]),
          [{ text: "القائمة الرئيسية", callback_data: "m:home" }],
        ],
      },
    );
    return;
  }
  const template = update.callback_query?.data?.match(
    /^t:(classic|modern|compact)$/,
  );
  if (template) {
    if (!activeDraft) {
      await send(id, "اختر مسودة أولًا.");
      return;
    }
    const approved = activeDraft.approved_revision === activeDraft.revision;
    activeDraft = await command(actor, "drafts.save", {
      id: activeDraft.id,
      revision: activeDraft.revision,
      title: activeDraft.title,
      content: activeDraft.content,
      design: { ...activeDraft.design, template: template[1] },
    });
    if (approved)
      activeDraft = await command(actor, "drafts.approve", {
        id: activeDraft.id,
        revision: activeDraft.revision,
      });
    await send(
      id,
      "تم تغيير القالب إلى «" +
        TEMPLATES.find((t) => t.id === template[1]).name +
        "». يظهر الاختيار نفسه في الموقع.",
      {
        inline_keyboard: [
          [{ text: "القائمة الرئيسية", callback_data: "m:home" }],
        ],
      },
    );
    return;
  }
  const sessionMap = new Map();
  if (state) sessionMap.set(id, state.body);
  const sessions = {
    get: async () => sessionMap.get(id) || null,
    set: async (_, s) => {
      const complete =
        s.confirmedRevision === s.revision &&
        s.index >= s.steps.length &&
        !s.edit &&
        !s.listDraft;
      const body = s,
        content = validateResume({
          ...emptyResume(),
          ...s.data,
          language: s.data.language || "ar",
          profile: s.profile || s.data.profile || "graduate",
        });
      state = await command(actor, "session.set", {
        version: state?.version || 0,
        body,
        content,
        draftId: activeDraft?.id || null,
        baseRevision: activeDraft?.revision || null,
        approved: complete,
      });
      sessionMap.set(id, s);
      if (activeDraft)
        activeDraft = await command(actor, "drafts.get", {
          id: activeDraft.id,
        });
    },
    delete: async () => {
      await command(actor, "session.delete");
      sessionMap.delete(id);
      state = null;
      activeDraft = null;
    },
  };
  const accessFor = async () => {
    const a = await command(actor, "me");
    if (!a.membership) return { mode: "none", active: false, readable: false };
    const m = a.membership;
    return {
      mode: "paid",
      active: m.active,
      readable: true,
      maxDrafts: m.maxDrafts,
      expires: new Date(m.expires).getTime(),
      activated: new Date(m.activated).getTime(),
      aiLimit: m.aiLimit,
      aiUsed: m.aiUsed,
      aiRemaining: m.aiRemaining,
      activeDraft: activeDraft?.id || null,
    };
  };
  const paid = {
    redeem: async (_, code) => {
      const raw = normalizeCode(code);
      if (!/^(?:[A-F0-9]{24}|[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8})$/.test(raw))
        throw Error("رمز التفعيل غير صحيح.");
      await command(actor, "redeem", {
        hash: await legacyHash("activation:" + raw),
      });
      return accessFor();
    },
    listDrafts: async () => {
      const ds = await command(actor, "drafts.list");
      return ds.map((d) => ({
        id: d.id,
        label: d.title || d.content.name || "مسودة",
        language: d.content.language,
        updated: new Date(d.updated_at).getTime(),
      }));
    },
    createDraft: async (_, s) => {
      activeDraft = await command(actor, "drafts.create", {
        title: "سيرتي الذاتية",
        content: emptyResume(),
        design: defaultDesign(),
      });
      s.id = activeDraft.id;
      await sessions.set(id, s);
      return s;
    },
    openDraft: async (_, draftId) => {
      activeDraft = await command(actor, "drafts.get", { id: draftId });
      const s = rebuild(activeDraft);
      await sessions.set(id, s);
      return s;
    },
    removeDraft: async (_, draftId) => {
      await command(actor, "drafts.delete", { id: draftId });
      if (activeDraft?.id === draftId) {
        activeDraft = null;
        await sessions.delete();
      }
    },
    approvedData: async (_, draftId) => ({ etmamDraftId: draftId }),
  };
  async function renderPdf(data) {
    const d = data?.etmamDraftId
      ? await command(actor, "drafts.get", { id: data.etmamDraftId })
      : activeDraft;
    if (!d) throw Error("احفظ مسودة معتمدة أولًا.");
    exportedTitle = d.title;
    const job = await command(actor, "jobs.create", {
      kind: "export",
      draftId: d.id,
      revision: d.revision,
      idempotencyKey: "tg-pdf-" + update.update_id,
    });
    await runJob(actor, job.id);
    const result = await command(actor, "jobs.get", { id: job.id });
    if (result.state !== "completed") throw Error("تعذر إنشاء الملف حاليًا.");
    const r = await fetch(await signPDF(actor, result.result.objectPath));
    if (!r.ok) throw Error("تعذر تحميل الملف.");
    return new Uint8Array(await r.arrayBuffer());
  }
  let ticket = null;
  const handler = createTelegramHandler({
    sessions,
    seen: { has: async () => false, add: async () => {} },
    paid,
    accessFor,
    entitled: async () => (await accessFor()).readable,
    isAdmin: async () => id === "7446648364",
    saveFeedback: (_, message) => command(actor, "feedback.save", message),
    listFeedback: (page) => command(actor, "feedback.list", { page }),
    sendMessage: send,
    editMessage: async (chat, message_id, text, reply_markup) =>
      telegram("editMessageText", {
        chat_id: chat,
        message_id,
        text,
        reply_markup,
      }),
    sendDocument: async (chat, bytes, name) => {
      const form = new FormData();
      form.set("chat_id", chat);
      form.set(
        "document",
        new Blob([bytes], { type: "application/pdf" }),
        pdfFilename(exportedTitle || activeDraft?.title || name),
      );
      await telegram("sendDocument", form);
    },
    renderPdf,
    reserveAI: async (_, kind) => {
      if (!activeDraft) throw Error("اختر مسودة أولًا.");
      ticket = await command(actor, "jobs.create", {
        kind,
        consent: true,
        draftId: activeDraft.id,
        revision: activeDraft.revision,
        idempotencyKey: "tg-ai-" + update.update_id,
      });
      ticket = await command(actor, "jobs.claim", { id: ticket.id });
      if (!ticket) throw Error("الطلب قيد المعالجة أو اكتمل سابقًا.");
      return ticket;
    },
    improve: async (d) => {
      const result = await aiResult("improve", d, {});
      ticket.result = result;
      const facts = factsFor(d, "improve");
      return {
        facts,
        rewrites: facts.map((f) => ({
          id: f.id,
          text: get(result.content, f.id),
        })),
        kind: "improve",
      };
    },
    translate: async (d, targetLanguage) => {
      const result = await aiResult("translate", d, { targetLanguage });
      ticket.result = result;
      const facts = factsFor(d, "translate");
      return {
        facts,
        rewrites: facts.map((f) => ({
          id: f.id,
          text: get(result.content, f.id),
        })),
        kind: "translate",
        targetLanguage,
      };
    },
    finishAI: async (_, t, success) =>
      command(actor, "jobs.finish", {
        id: t.id,
        success,
        result: t.result || {},
        error: success ? undefined : "تعذرت العملية. لم تُخصم من الرصيد.",
      }),
  });
  await handler(update);
}
export async function drainTelegram(actor) {
  for (let i = 0; i < 5; i++) {
    const item = await command(actor, "telegram.claim");
    if (!item) return;
    try {
      await processTelegram(actor, item.body);
      await command(actor, "telegram.finish", { id: item.id, success: true });
    } catch (e) {
      console.error(
        JSON.stringify({ event: "etmam_telegram_failed", update: item.id }),
      );
      await command(actor, "telegram.finish", {
        id: item.id,
        success: false,
        error: publicError(e).message,
      });
      const from = item.body?.message?.from || item.body?.callback_query?.from;
      if (from?.id)
        await telegram("sendMessage", {
          chat_id: from.id,
          text:
            publicError(e).message +
            "\nافتح مسوداتك مجددًا لاستعادة أحدث نسخة.",
        }).catch(() => {});
    }
  }
}
