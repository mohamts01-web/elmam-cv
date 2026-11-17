import fs from "node:fs";
import { spawnSync } from "node:child_process";
const root = "E:/مشاريعي";
export function pg(query, { local = false } = {}) {
  const env = {
    ...process.env,
    PGHOST: local ? "127.0.0.1" : "db.okwqqkcifvmaoarlemix.supabase.co",
    PGPORT: local ? "55439" : "5432",
    PGUSER: "postgres",
    PGDATABASE: "postgres",
    PGPASSWORD: fs
      .readFileSync(
        local
          ? new URL("../private/test-db-password.local", import.meta.url)
          : "E:/pas/SUPA-PAS.txt",
        "utf8",
      )
      .replace(/^\uFEFF/, "")
      .trim(),
    PGSSLMODE: local ? "disable" : "verify-full",
    ...(!local
      ? {
          PGSSLROOTCERT:
            root +
            "/.elmam-local-data/cloud-readiness/supabase-prod-ca-2021.crt",
        }
      : {}),
    PGCONNECT_TIMEOUT: "10",
    PGCLIENTENCODING: "UTF8",
  };
  const r = spawnSync(
    root + "/.elmam-local-tools/pgsql/bin/psql.exe",
    ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: query, env, encoding: "utf8", timeout: 30000 },
  );
  if (r.status !== 0)
    throw Error(r.stderr || r.error?.message || "database_unavailable");
  return r.stdout.trim();
}
if (process.argv[2] === "inspect") {
  try {
    console.log(
      pg(
        "select table_schema,table_name from information_schema.tables where table_schema in ('public','etmam') order by 1,2",
      ),
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
