ALTER TABLE public.bp_version_audit_log
  DROP CONSTRAINT IF EXISTS bp_version_audit_log_action_check;

ALTER TABLE public.bp_version_audit_log
  ADD CONSTRAINT bp_version_audit_log_action_check
  CHECK (action = ANY (ARRAY[
    'created'::text,
    'scenario_created'::text,
    'scenario_draft_created'::text,
    'cascaded_from_master'::text,
    'approved'::text,
    'superseded'::text,
    'archived'::text,
    'unarchived'::text,
    'discarded'::text,
    'frozen'::text,
    'retroactive_snapshot'::text,
    'cascaded'::text,
    'scenario_promoted'::text,
    'pinned'::text,
    'unpinned'::text,
    'reverted'::text,
    'reconciled'::text,
    'orphans_relinked'::text,
    'kept_after_sibling_promotion'::text,
    'retroactive_snapshot_created'::text,
    'retroactive_override_applied'::text
  ]));