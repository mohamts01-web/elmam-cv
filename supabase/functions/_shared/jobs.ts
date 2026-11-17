import { client, command, env, digest, publicError } from "./runtime.ts";
import { aiResult } from "./ai.ts";
import { pdfFilename } from "../../../shared/presentation.mjs";
type Job = {
  id: string;
  account_id: string;
  kind: string;
  base_revision: number;
  source: {
    content: Parameters<typeof aiResult>[1];
    design: object;
    revision: number;
  };
  input: Record<string, unknown>;
};
export async function signPDF(
  actor: string,
  path: string,
  title = "سيرتي الذاتية",
) {
  if (!path.startsWith(actor + "/")) throw Error("unauthorized");
  const { data, error } = await client()
    .storage.from("etmam-private")
    .createSignedUrl(path, 300, { download: pdfFilename(title) });
  if (error) throw error;
  return data.signedUrl;
}
export async function runJob(actor: string, id: string) {
  const job = await command<Job | null>(actor, "jobs.claim", { id });
  if (!job) return;
  let providerStarted = false;
  try {
    let result: unknown;
    if (job.kind === "export") {
      const key = await digest(
        JSON.stringify({
          account: actor,
          ...job.source,
          renderer: "etmam-shared-v3-inline-sections",
        }),
      );
      const cached = await command<{ object_path: string } | null>(
        actor,
        "cache.get",
        { key },
      );
      let path = cached?.object_path;
      if (!path) {
        const response = await fetch(env("ETMAM_RENDERER_URL") + "/render", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + env("ETMAM_RENDERER_SECRET"),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(job.source),
          signal: AbortSignal.timeout(65000),
        });
        if (!response.ok) throw Error("pdf_unavailable");
        const bytes = await response.arrayBuffer();
        if (
          bytes.byteLength > 5 * 1024 * 1024 ||
          new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
        )
          throw Error("invalid_pdf");
        path = actor + "/" + key + ".pdf";
        const { error } = await client()
          .storage.from("etmam-private")
          .upload(path, bytes, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (error && !String(error.message).includes("already exists"))
          throw error;
        await command(actor, "cache.put", { key, path });
      }
      result = { objectPath: path };
    } else {
      providerStarted = true;
      result = await aiResult(job.kind, job.source.content, job.input);
    }
    await command(actor, "jobs.finish", { id, success: true, result });
  } catch (error) {
    const uncertain =
      providerStarted &&
      (error instanceof TypeError || error instanceof DOMException);
    await command(actor, "jobs.finish", {
      id,
      success: false,
      uncertain,
      error: publicError(error).message,
    });
    console.error(
      JSON.stringify({
        event: "etmam_job_failed",
        kind: job.kind,
        id,
        uncertain,
      }),
    );
  }
}
