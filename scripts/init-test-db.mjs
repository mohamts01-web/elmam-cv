import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
const root = path.resolve("private").replace("E:\\مشاريعي", "E:\\BA94~1"),
  folder = path.join(root, "pg-test"),
  passwordFile = path.join(root, "test-db-password.local");
fs.mkdirSync(root, { recursive: true });
if (!fs.existsSync(passwordFile))
  fs.writeFileSync(passwordFile, crypto.randomBytes(24).toString("base64url"), {
    flag: "wx",
  });
const bin = "E:/BA94~1/ELMAM-~2/pgsql/bin/";
function run(name, args) {
  const r = spawnSync(bin + name + ".exe", args, {
    encoding: "utf8",
    timeout: 25000,
  });
  if (r.status !== 0) throw Error(r.stderr || r.stdout || name + "_failed");
  console.log(name + ": OK");
}
if (!fs.existsSync(path.join(folder, "PG_VERSION")))
  run("initdb", [
    "-D",
    folder,
    "-U",
    "postgres",
    "--pwfile",
    passwordFile,
    "--auth=scram-sha-256",
    "--encoding=UTF8",
    "--locale=C",
  ]);
const status = spawnSync(bin + "pg_ctl.exe", ["status", "-D", folder], {
  encoding: "utf8",
});
if (status.status !== 0)
  run("pg_ctl", [
    "start",
    "-D",
    folder,
    "-o",
    "-h 127.0.0.1 -p 55439",
    "-l",
    path.join(root, "test-postgres.log"),
    "-w",
  ]);
