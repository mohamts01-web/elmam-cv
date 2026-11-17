import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { whopClient } from "../supabase/functions/_shared/whop.mjs";

const [action, value] = process.argv.slice(2);
const intentDirectory = new URL("../private/whop-sandbox-intents/", import.meta.url);
const intentFile = (configurationId) => new URL(configurationId + ".txt", intentDirectory);
if (action !== "checkout" && action !== "verify") {
  console.error("Use checkout [intentId] or verify <paymentId>.");
  process.exitCode = 1;
} else {
  try {
    const apiKey = await readFile("E:/pas/WHOP-ETMAM-SANDBOX.txt", "utf8").catch((error) => {
      if (error.code === "ENOENT") throw Error("whop_sandbox_key_missing");
      throw error;
    });
    const whop = whopClient({
      apiKey: apiKey.trim(),
      companyId: "biz_3Yk2qaUWvCvjbu",
      planId: "plan_ACrYY34JvPqFT",
      returnUrl: "https://etmam-cv.netlify.app/plans",
    });
    if (action === "checkout") {
      const intentId = value ?? randomUUID();
      const checkout = await whop.createCheckout(intentId);
      await mkdir(intentDirectory, { recursive: true });
      const file = intentFile(checkout.configurationId);
      await writeFile(file, intentId, { flag: "wx" }).catch(async (error) => {
        if (error.code !== "EEXIST" || await readFile(file, "utf8") !== intentId) throw error;
      });
      console.log(JSON.stringify({ intentId, ...checkout }));
    } else {
      const paid = await whop.reconcilePaid(value, (configurationId) =>
        readFile(intentFile(configurationId), "utf8").catch((error) => {
          if (error.code === "ENOENT") return null;
          throw error;
        }));
      console.log(JSON.stringify(paid));
    }
  } catch (error) {
    const known = /^(?:whop_[a-z0-9_]+)$/.test(error.message);
    console.error(known ? error.message : "whop_sandbox_request_failed");
    process.exitCode = 1;
  }
}
