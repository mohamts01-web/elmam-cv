ALTER TABLE etmam.whop_intents
  ADD COLUMN referral_job_id bigint CHECK (referral_job_id BETWEEN 1 AND 999999999999);

CREATE FUNCTION public.etmam_whop_attribute_job(
  p_actor uuid, p_intent uuid, p_job bigint
) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  UPDATE etmam.whop_intents
  SET referral_job_id = p_job
  WHERE account_id = p_actor AND id = p_intent AND environment = 'live'
    AND referral_job_id IS NULL AND configuration_id IS NULL
    AND payment_id IS NULL AND p_job BETWEEN 1 AND 999999999999;
$$;

REVOKE ALL ON FUNCTION public.etmam_whop_attribute_job(uuid,uuid,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etmam_whop_attribute_job(uuid,uuid,bigint)
  TO service_role;
