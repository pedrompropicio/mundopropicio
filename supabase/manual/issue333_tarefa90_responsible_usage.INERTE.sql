-- NOT EXECUTABLE UNTIL PRIVATE PARAMETERS + REVIEW HASH ARE SUPPLIED AND ACTION AUTHORIZED.
-- Owner SQL only, no endpoint, no model/browser grant. Audit hash identifies reviewed decision,
-- not a secret/request/document hash. Never paste credentials or document bodies here.
-- Initial opening, only after availability/cost review and phase9 prerequisites:
SELECT public.data_entry_analysis_responsible_333('reopen',__EXACT_REVISION__,NULL,'__REVIEW_DECISION_SHA256__');
-- Close fences late completion but deliberately preserves an active/uncertain claim:
SELECT public.data_entry_analysis_responsible_333('close',__EXACT_REVISION__,__EXACT_CLAIM_OR_NULL__,'__REVIEW_DECISION_SHA256__');
-- ONLY after explicit technical conference: process stopped/no unresolved in-flight request,
-- responsible decision on uncertain outcome/cost documented and hashed; no automatic lease.
-- Conference releases exact claim but leaves state closed; reopening is a separate action.
SELECT public.data_entry_analysis_responsible_333('confer',__EXACT_REVISION__,__EXACT_CLAIM_OR_NULL__,'__REVIEW_DECISION_SHA256__');
