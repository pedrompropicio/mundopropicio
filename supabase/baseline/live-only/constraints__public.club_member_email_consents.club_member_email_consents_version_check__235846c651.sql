-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.club_member_email_consents.club_member_email_consents_version_check
-- stage: reconcile
-- provenance: {"live_absence": false, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "e596c56cb087b3d6469d2e8fc0ee6cabccfb16fe02dfe949fcda73a30566929b", "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "3268af279be94716f2ccbb716bfef4523c1b598ffe35b8de7780e78783ca89e8", "review": 6445145238, "rule": "live_definition_prevails", "source_sql_sha256": "e2da54b0ace4adc60a066041d38e28a4e1a0f6eaf41391a934cce6b277100d99", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 2ad98cc4851886f2a992a30b78396a3e67122e142a18fb829ad1defe8a6775be
ALTER TABLE public.club_member_email_consents DROP CONSTRAINT IF EXISTS "club_member_email_consents_version_check";

DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.club_member_email_consents'::regclass AND conname='club_member_email_consents_version_check') THEN
  ALTER TABLE public.club_member_email_consents ADD CONSTRAINT "club_member_email_consents_version_check" CHECK ((version = ANY (ARRAY['email-v3'::text, 'email-v4'::text, 'clube-newgang-v2'::text, 'legacy-sem-versao'::text, 'legacy-form-a-2026-10'::text, 'legacy-form-b-2026-10'::text])));
 END IF;
END $baseline_constraint$;
-- END OPERATION 2ad98cc4851886f2a992a30b78396a3e67122e142a18fb829ad1defe8a6775be
