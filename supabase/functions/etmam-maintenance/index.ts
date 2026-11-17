import { client, env, secretEqual } from "../_shared/runtime.ts";
import { runJob } from "../_shared/jobs.ts";
import { drainTelegram } from "../_shared/telegram.mjs";
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
Deno.serve(async (req) => {
  if (
    req.method !== "POST" ||
    !(await secretEqual(
      req.headers.get("Authorization") || "",
      "Bearer " + env("ETMAM_MAINTENANCE_SECRET"),
    ))
  )
    return new Response("Unauthorized", { status: 401 });
  const { data, error } = await client().rpc("etmam_maintenance");
  if (error) return Response.json({ ok: false }, { status: 503 });
  EdgeRuntime.waitUntil(
    (async () => {
      for (const j of data.jobs) await runJob(j.account_id, j.id);
      for (const t of data.telegram) await drainTelegram(t.account_id);
    })(),
  );
  return Response.json({
    ok: true,
    queuedJobs: data.jobs.length,
    queuedTelegram: data.telegram.length,
  });
});
