import fs from "node:fs";
const source = fs.readFileSync(
  "supabase/migrations/20261031225530_etmam_paddle_plan_changes.sql",
  "utf8",
);
let gateway = source.slice(
  source.indexOf("CREATE OR REPLACE FUNCTION public.etmam_billing("),
);
const old = "updated_event,paid_transaction) VALUES";
if (!gateway.includes(old)) throw Error("Gateway source changed");
gateway = gateway
  .replace(old, "updated_event,paid_transaction,paid_event_at) VALUES")
  .replace(
    "offer.max_drafts,event_at,tx)",
    "offer.max_drafts,event_at,tx,event_at)",
  )
  .replace(
    "price_id=excluded.price_id,period_start=",
    "status=CASE WHEN etmam.billing_subscriptions.updated_event>event_at THEN etmam.billing_subscriptions.status ELSE excluded.status END,price_id=excluded.price_id,period_start=",
  )
  .replace(
    "updated_event=excluded.updated_event,revoked=false,paid_transaction=excluded.paid_transaction WHERE etmam.billing_subscriptions.account_id=actor AND etmam.billing_subscriptions.updated_event<=event_at",
    "updated_event=greatest(etmam.billing_subscriptions.updated_event,excluded.updated_event),revoked=false,paid_transaction=excluded.paid_transaction,paid_event_at=excluded.paid_event_at WHERE etmam.billing_subscriptions.account_id=actor AND etmam.billing_subscriptions.paid_event_at<=event_at",
  );
fs.writeFileSync(
  "supabase/migrations/20261101025517_etmam_paddle_event_ordering.sql",
  `-- Status notifications must not suppress a delayed, verified paid transaction.
ALTER TABLE etmam.billing_subscriptions ADD COLUMN paid_event_at timestamptz;
UPDATE etmam.billing_subscriptions s SET paid_event_at=coalesce((SELECT o.paid_at FROM etmam.billing_orders o WHERE o.environment=s.environment AND o.transaction_id=s.paid_transaction),s.updated_event);
ALTER TABLE etmam.billing_subscriptions ALTER COLUMN paid_event_at SET NOT NULL;
${gateway}`,
);
