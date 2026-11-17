import fs from "node:fs";
import { pg } from "./pg.mjs";
const sql = fs.readFileSync(
  new URL(
    "../supabase/migrations/20261030215635_etmam_shared_cv.sql",
    import.meta.url,
  ),
  "utf8",
);
const test = fs.readFileSync(
  new URL("../tests/transactions.sql", import.meta.url),
  "utf8",
);
const refinement = fs.readFileSync(
  new URL(
    "../supabase/migrations/20261031050806_etmam_editor_package_refinement.sql",
    import.meta.url,
  ),
  "utf8",
);
const setup =
  "DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS;END IF;END$$;CREATE SCHEMA IF NOT EXISTS storage;CREATE TABLE IF NOT EXISTS storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);";
try {
  const selective = fs.readFileSync(
    new URL(
      "../supabase/migrations/20261031055723_etmam_selective_cv_proposals.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const selectionTest = fs.readFileSync(
    new URL("../tests/selective-proposals.sql", import.meta.url),
    "utf8",
  );
  const billing = fs.readFileSync(
    new URL(
      "../supabase/migrations/20261031221628_etmam_paddle_billing.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const billingTest = fs.readFileSync(
    new URL("../tests/paddle-billing.sql", import.meta.url),
    "utf8",
  );
  const billingRecovery = fs.readFileSync(
    new URL(
      "../supabase/migrations/20261031224057_etmam_paddle_checkout_recovery.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const billingChanges = fs.readFileSync(
    new URL(
      "../supabase/migrations/20261031225530_etmam_paddle_plan_changes.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const billingOrdering = fs.readFileSync(
    new URL(
      "../supabase/migrations/20261101025517_etmam_paddle_event_ordering.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const whop = fs.readFileSync(
    new URL("../supabase/migrations/20261110120817_etmam_whop_starter.sql", import.meta.url),
    "utf8",
  );
  const zid = fs.readFileSync(
    new URL("../supabase/migrations/20261102172356_etmam_zid_only_ten_operations.sql", import.meta.url),
    "utf8",
  );
  // The remaining Zid migration statements depend on Supabase Vault.
  const zidCommand = zid.slice(0, zid.indexOf("END$function$;") + "END$function$;".length);
  const whopTest = fs.readFileSync(new URL("../tests/whop-billing.sql", import.meta.url), "utf8");
  console.log(
    pg(
      "BEGIN;\n" +
        setup +
        "\n" +
        sql +
        "\n" +
        refinement +
        "\n" +
        selective +
        "\n" +
        billing +
        "\n" +
        billingRecovery +
        "\n" +
        billingChanges +
        "\n" +
        billingOrdering +
        "\n" +
        test +
        "\n" +
        selectionTest +
        "\n" +
        billingTest +
        "\n" +
        zidCommand +
        "\n" +
        whop +
        "\n" +
        whopTest +
        "\nROLLBACK;",
      {
        local: true,
      },
    ),
  );
  console.log("SQL_VALIDATION_PASSED_ROLLED_BACK");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
