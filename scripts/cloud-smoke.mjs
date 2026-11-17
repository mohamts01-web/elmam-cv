import fs from "node:fs";
import { sampleResume, defaultDesign } from "../shared/model.mjs";
const c = JSON.parse(
  fs.readFileSync(
    "E:/مشاريعي/.elmam-local-data/etmam-web/runtime.local.json",
    "utf8",
  ),
);
const results = [];
for (const path of ["etmam-api/me", "etmam-telegram", "etmam-maintenance"]) {
  const r = await fetch(c.supabaseUrl + "/functions/v1/" + path, {
    method: path.includes("/me") ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: path.includes("/me") ? undefined : "{}",
  });
  results.push({ path, status: r.status, expected: 401 });
}
const maintenance = await fetch(
  c.supabaseUrl + "/functions/v1/etmam-maintenance",
  {
    method: "POST",
    headers: { Authorization: "Bearer " + c.maintenanceSecret },
  },
);
results.push({
  path: "maintenance_authenticated",
  status: maintenance.status,
  result: await maintenance.json(),
});
const r = await fetch(c.rendererUrl + "/render", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + c.rendererSecret,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ content: sampleResume, design: defaultDesign() }),
});
results.push({ path: "pdf_authenticated", status: r.status });
if (r.ok) {
  const bytes = new Uint8Array(await r.arrayBuffer());
  fs.writeFileSync("private/cloud-sample-ar.pdf", bytes);
  results.at(-1).bytes = bytes.length;
}
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.status !== (r.expected || 200))) process.exitCode = 1;
