import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const settings = {
  ENABLED: "true", API_KEY: "fixture", COMPANY_ID: "biz_fixture",
  PLAN_ID: "plan_fixture", RETURN_URL: "https://etmam-cv.netlify.app/plans",
  WEBHOOK_SECRET: "fixture",
};
const runtime = "data:text/javascript," + encodeURIComponent(
  "export const client=()=>globalThis.whopReferralFixture.client;" +
  "export const env=key=>globalThis.whopReferralFixture.env(key);" +
  "export const optionalEnv=env;",
);
const hook = registerHooks({ resolve(specifier, context, next) {
  return specifier === "./runtime.ts" && context.parentURL?.endsWith("/whop-billing.ts")
    ? { url: runtime, shortCircuit: true }
    : next(specifier, context);
} });
const { whopBilling } = await import("../supabase/functions/_shared/whop-billing.ts");
hook.deregister();

test("valid job records its referral and attribution failures preserve Whop checkout", async (t) => {
  for (const scenario of ["success", "unknown-job", "rpc-error", "network-error", "no-referral"]) {
    await t.test(scenario, async (st) => {
      const calls = [];
      const intentId = "d108400a-1f34-4927-8ec7-428a5a915b74";
      const actor = "ee9a0793-2294-4535-aff3-8595be58f539";
      const url = "https://whop.com/checkout/ch_fixture";
      globalThis.whopReferralFixture = {
        env(key) { return settings[key.replace("ETMAM_WHOP_LIVE_", "")] || ""; },
        client: {
          async rpc(name, args) {
            if (name === "etmam_whop_attribute_job") {
              calls.push("attribution");
              assert.deepEqual(args, { p_actor: actor, p_intent: intentId, p_job: 1426 });
              return scenario === "rpc-error" ? { error: {} } : {};
            }
            assert.equal(name, "etmam_whop_checkout");
            calls.push(args.p_action);
            return { data: { intentId, url: args.p_action === "bind" ? url : null } };
          },
        },
      };
      st.after(() => delete globalThis.whopReferralFixture);
      st.mock.method(globalThis, "fetch", async (input, options) => {
        if (input === "https://jobs.cvsira.com/api/cv-job/1426") {
          calls.push("listing");
          if (scenario === "network-error") throw Error("offline");
          return new Response("{}", { status: scenario === "unknown-job" ? 404 : 200 });
        }
        assert.equal(input, "https://api.whop.com/api/v1/checkout_configurations");
        assert.equal(JSON.parse(options.body).redirect_url, "https://cv.cvsira.com/plans");
        calls.push("whop");
        return Response.json({
          id: "ch_fixture", purchase_url: url, account_id: "biz_fixture", mode: "payment",
          variant: { id: "plan_fixture", billing_type: "one_time", currency: "sar",
            expiration_days: 30, initial_price: "10.00" },
        });
      });
      st.mock.method(console, "warn", () => {});
      const result = await whopBilling(actor, "test@example.com", "/billing/whop/checkout",
        "POST", { intentId, referralJobId: scenario === "no-referral" ? undefined : 1426 },
        "https://cv.cvsira.com/plans");
      assert.equal(result.url, url);
      assert.deepEqual(calls, ["create",
        ...(scenario === "no-referral" ? [] : ["listing"]),
        ...(["success", "rpc-error"].includes(scenario) ? ["attribution"] : []),
        "whop", "bind"]);
    });
  }
});
