import fs from "node:fs";
const config = JSON.parse(
  fs.readFileSync(
    "E:/مشاريعي/.elmam-local-data/etmam-web/runtime.local.json",
    "utf8",
  ),
);
fs.writeFileSync(
  new URL("../.env.local", import.meta.url),
  "VITE_SUPABASE_URL=" +
    config.supabaseUrl +
    "\nVITE_SUPABASE_PUBLISHABLE_KEY=" +
    config.publishableKey +
    "\nVITE_ETMAM_API_URL=" +
    config.supabaseUrl +
    "/functions/v1/etmam-api\nVITE_EMAIL_LOGIN_READY=" +
    String(config.emailLoginReady === true) + "\n",
);
console.log("Public web configuration ready.");
