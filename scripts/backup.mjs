import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";
import { spawnSync } from "node:child_process";
const folder =
  "E:/مشاريعي/.elmam-local-data/etmam-web/backups/" +
  new Date().toISOString().replaceAll(":", "-");
fs.mkdirSync(folder, { recursive: true });
const data = "E:/مشاريعي/etmam-cv-bot/data";
const db = new DatabaseSync(data + "/etmam.sqlite3", { readOnly: true });
await backup(db, folder + "/etmam.sqlite3");
db.close();
fs.copyFileSync(
  data + "/encryption-key.local",
  folder + "/encryption-key.local",
  fs.constants.COPYFILE_EXCL,
);
const r = spawnSync(
  "E:/مشاريعي/.elmam-local-tools/pgsql/bin/pg_dump.exe",
  [
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--file",
    folder + "/elmam-before-etmam.dump",
  ],
  {
    env: {
      ...process.env,
      PGHOST: "db.okwqqkcifvmaoarlemix.supabase.co",
      PGPORT: "5432",
      PGUSER: "postgres",
      PGDATABASE: "postgres",
      PGPASSWORD: fs
        .readFileSync("E:/pas/SUPA-PAS.txt", "utf8")
        .replace(/^\uFEFF/, "")
        .trim(),
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT:
        "E:/مشاريعي/.elmam-local-data/cloud-readiness/supabase-prod-ca-2021.crt",
      PGCONNECT_TIMEOUT: "10",
    },
    encoding: "utf8",
    timeout: 180000,
  },
);
if (r.status !== 0)
  throw Error(
    "cloud_backup_failed: " + (r.stderr || r.error?.message || "unknown"),
  );
const manifest = {
  createdAt: new Date().toISOString(),
  files: fs.readdirSync(folder).map((name) => ({
    name,
    sha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(folder, name)))
      .digest("hex"),
    bytes: fs.statSync(path.join(folder, name)).size,
  })),
  restoreVerified: false,
};
fs.writeFileSync(folder + "/manifest.json", JSON.stringify(manifest, null, 2));
console.log(
  JSON.stringify({
    backupFolder: folder,
    files: manifest.files.map((f) => ({ name: f.name, bytes: f.bytes })),
    restoreVerified: false,
  }),
);
