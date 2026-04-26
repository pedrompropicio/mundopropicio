ALTER TABLE public.bp_version_audit_log
  DROP CONSTRAINT IF EXISTS bp_version_audit_log_action_check;

ALTER TABLE public.bp_version_audit_log
  ADD CONSTRAINT bp_version_audit_log_action_check
  CHECK (action = ANY (ARRAY[
    'created',
    'approved',
    'superseded',
    'archived',
    'unarchived',
    'reverted_to',
    'auto_reconciled',
    'retroactive_override_applied',
    'retroactive_snapshot_added',
    'cascaded_from_master',
    'scenario_created',
    'scenario_promoted',
    'pinned',
    'unpinned'
  ]));