import fs from "node:fs";
import { pg } from "./pg.mjs";
const path = "E:/مشاريعي/.elmam-local-data/etmam-web/runtime.local.json",
  c = JSON.parse(fs.readFileSync(path, "utf8"));
c.rendererUrl = "https://etmam-cv-renderer.mohamts01.workers.dev";
fs.writeFileSync(path, JSON.stringify(c, null, 2));
const settings = {
  ETMAM_OPENAI_API_KEY: c.openaiKey,
  ETMAM_LEGACY_HMAC_KEY: c.legacyKey,
  ETMAM_TELEGRAM_TOKEN: c.telegramToken,
  ETMAM_RENDERER_URL: c.rendererUrl,
  ETMAM_RENDERER_SECRET: c.rendererSecret,
  ETMAM_MAINTENANCE_SECRET: c.maintenanceSecret,
  ETMAM_TELEGRAM_WEBHOOK_SECRET: c.webhookSecret,
  ETMAM_WEB_ORIGINS: ["http://127.0.0.1:4180", c.siteUrl]
    .filter(Boolean)
    .join(","),
  ETMAM_AI_MODEL: "gpt-6-luna",
};
const literal = (s) => "'" + s.replaceAll("'", "''") + "'";
try {
  pg(
    `DO $$DECLARE id uuid;BEGIN SELECT s.id INTO id FROM vault.secrets s WHERE name='etmam-runtime-v1';IF id IS NULL THEN PERFORM vault.create_secret(${literal(JSON.stringify(settings))},'etmam-runtime-v1','ETMAM server-only runtime configuration');ELSE PERFORM vault.update_secret(id,${literal(JSON.stringify(settings))},'etmam-runtime-v1','ETMAM server-only runtime configuration');END IF;END$$;`,
  );
  console.log(
    "ETMAM configuration encrypted in Vault. No credentials printed.",
  );
} catch {
  console.error("Vault configuration failed; no configuration was printed.");
  process.exitCode = 1;
}
