import fs from "node:fs";
import { build } from "esbuild";
const base = new URL("../public/fonts/", import.meta.url);
let css = "";
for (const range of ["latin", "arabic"])
  for (const weight of [400, 700]) {
    const bytes = fs.readFileSync(
      new URL(`tajawal-${range}-${weight}-normal.woff2`, base),
    );
    css += `@font-face{font-family:ETMAMCV;src:url(data:font/woff2;base64,${bytes.toString("base64")});font-weight:${weight};${range === "arabic" ? "unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFF;" : ""}}`;
  }
fs.writeFileSync(
  new URL("../renderer/fonts.mjs", import.meta.url),
  "export const fonts=" + JSON.stringify(css) + ";",
);
await build({
  entryPoints: ["renderer/worker.mjs"],
  outfile: "renderer/dist/worker.mjs",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  external: ["node:*", "cloudflare:*"],
  minify: true,
});
console.log("Renderer bundle ready");
