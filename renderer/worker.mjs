import puppeteer from "@cloudflare/puppeteer";
import { resumeHTML } from "../shared/render.mjs";
import { validateResume } from "../shared/model.mjs";
import { fonts } from "./fonts.mjs";
async function equal(a, b) {
  if (!a || !b) return false;
  const encode = new TextEncoder();
  const x = new Uint8Array(
      await crypto.subtle.digest("SHA-256", encode.encode(a)),
    ),
    y = new Uint8Array(await crypto.subtle.digest("SHA-256", encode.encode(b)));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/health")
      return Response.json({ service: "etmam-pdf", version: "1" });
    if (
      path !== "/render" ||
      request.method !== "POST" ||
      !(await equal(
        request.headers.get("Authorization") || "",
        "Bearer " + env.RENDER_SECRET,
      ))
    )
      return new Response("Unauthorized", { status: 401 });
    let browser;
    try {
      const text = await request.text();
      if (text.length > 200000)
        return new Response("Too large", { status: 413 });
      const { content, design } = JSON.parse(text);
      const html = resumeHTML(validateResume(content), design, fonts);
      try {
        browser = await puppeteer.launch(env.BROWSER);
      } catch (error) {
        if (
          !String(error?.message).includes("429") ||
          String(error?.message).includes("time limit exceeded")
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 21000));
        browser = await puppeteer.launch(env.BROWSER);
      }
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", (r) =>
        r.url().startsWith("data:") || r.url() === "about:blank"
          ? r.continue()
          : r.abort(),
      );
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const bytes = await page.pdf({
        format: "A4",
        preferCSSPageSize: true,
        printBackground: true,
        tagged: true,
        displayHeaderFooter: false,
      });
      return new Response(bytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="ETMAM-CV.pdf"',
          "Cache-Control": "private, no-store",
        },
      });
    } catch {
      console.error(JSON.stringify({ event: "etmam_pdf_failed" }));
      return Response.json(
        { error: "PDF unavailable. Please try later." },
        { status: 503 },
      );
    } finally {
      if (browser) await browser.close();
    }
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const r = await fetch(env.MAINTENANCE_URL, {
          method: "POST",
          headers: { Authorization: "Bearer " + env.MAINTENANCE_SECRET },
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok)
          console.error(
            JSON.stringify({
              event: "etmam_maintenance_failed",
              status: r.status,
            }),
          );
      })(),
    );
  },
};
