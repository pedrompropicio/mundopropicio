-- LOCAL disposable schema only. Columns/defaults/nullability/FK from Live SELECT 2026-10-18.
-- RLS/ACL hosted auth are not simulated by this table definition.
CREATE TABLE public.system_audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entity_type text NOT NULL, entity_id text NOT NULL, action text NOT NULL,
 changed_by text NOT NULL DEFAULT 'system', old_data jsonb, new_data jsonb, metadata jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 company_id uuid DEFAULT public.current_company_id() REFERENCES public.companies(id)
);
