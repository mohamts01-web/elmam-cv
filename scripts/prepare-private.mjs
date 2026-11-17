import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
const folder = "E:/مشاريعي/.elmam-local-data/etmam-web";
fs.mkdirSync(folder, { recursive: true });
const file = folder + "/runtime.local.json";
const previous = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, "utf8"))
  : {};
const random = () => crypto.randomBytes(32).toString("hex");
const config = {
  ...previous,
  projectRef: "okwqqkcifvmaoarlemix",
  supabaseUrl: "https://okwqqkcifvmaoarlemix.supabase.co",
  telegramToken: fs.readFileSync("E:/pas/ETMAM-CV-TELEGRAM.txt", "utf8").trim(),
  openaiKey: fs
    .readFileSync("E:/pas/API-GPT.txt", "utf8")
    .match(/sk-[A-Za-z0-9_-]+/)?.[0],
  legacyKey: fs
    .readFileSync("E:/مشاريعي/etmam-cv-bot/data/encryption-key.local")
    .toString("base64"),
  rendererSecret: previous.rendererSecret || random(),
  maintenanceSecret: previous.maintenanceSecret || random(),
  webhookSecret: previous.webhookSecret || random(),
};
if (!config.openaiKey) throw Error("openai_key_missing");
const r = spawnSync(
  "E:/مشاريعي/.elmam-local-tools/supabase/supabase.exe",
  [
    "projects",
    "api-keys",
    "--project-ref",
    config.projectRef,
    "--reveal",
    "--output",
    "json",
  ],
  { encoding: "utf8", timeout: 25000 },
);
if (r.status === 0) {
  try {
    const output = JSON.parse(r.stdout);
    const keys = Array.isArray(output)
      ? output
      : output.api_keys || output.keys || [];
    for (const k of keys) {
      if (k.name === "service_role" || k.type === "secret")
        config.serviceKey = k.api_key || k.key;
      if (k.name === "anon" || k.type === "publishable")
        config.publishableKey = k.api_key || k.key;
    }
  } catch {
    console.log(
      "CLI key response could not be parsed; existing credentials kept.",
    );
  }
} else
  console.log(
    "CLI authentication unavailable; using existing publishable config only.",
  );
if (!config.publishableKey) {
  const pub = JSON.parse(
    fs.readFileSync(
      "E:/مشاريعي/.elmam-local-data/career-cloud-launch/public-config.local.json",
      "utf8",
    ),
  );
  config.publishableKey = pub.anonKey;
}
fs.writeFileSync(file, JSON.stringify(config, null, 2));
console.log(
  JSON.stringify({
    privateConfigurationSaved: true,
    hasServiceKey: !!config.serviceKey,
    hasPublishableKey: !!config.publishableKey,
  }),
);
