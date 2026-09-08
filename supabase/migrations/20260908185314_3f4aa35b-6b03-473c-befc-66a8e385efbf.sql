ALTER TABLE public.bp_version_audit_log
  DROP CONSTRAINT bp_version_audit_log_action_check;

ALTER TABLE public.bp_version_audit_log
  ADD CONSTRAINT bp_version_audit_log_action_check
  CHECK (action = ANY (ARRAY[
    'created','scenario_created','scenario_draft_created','cascaded_from_master',
    'approved','superseded','archived','unarchived','discarded','frozen',
    'retroactive_snapshot','cascaded','scenario_promoted','scenario_promoted_to_active',
    'scenario_promoted_to_active_cascade','pinned','unpinned','reverted','reconciled',
    'orphans_relinked','kept_after_sibling_promotion','retroactive_snapshot_created',
    'retroactive_override_applied',
    'renamed','scenario_promoted_cascade','scenario_draft_discarded','scenario_draft_discarded_cascade'
  ]::text[]));