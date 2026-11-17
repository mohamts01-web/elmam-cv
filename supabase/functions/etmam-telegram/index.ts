import { command, env, secretEqual, readJSON } from "../_shared/runtime.ts";
import { telegramActor, drainTelegram } from "../_shared/telegram.mjs";
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
Deno.serve(async (req) => {
  if (
    req.method !== "POST" ||
    !(await secretEqual(
      req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "",
      env("ETMAM_TELEGRAM_WEBHOOK_SECRET"),
    ))
  )
    return new Response("Unauthorized", { status: 401 });
  try {
    const update = await readJSON(req, 100000);
    const from = update.message?.from || update.callback_query?.from;
    const message = update.message || update.callback_query?.message;
    if (!from?.id || message?.chat?.type !== "private" || from.is_bot)
      return Response.json({ ok: true });
    const actor = await telegramActor(String(from.id));
    await command(actor, "telegram.enqueue", {
      id: update.update_id,
      body: update,
    });
    EdgeRuntime.waitUntil(drainTelegram(actor));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
});
