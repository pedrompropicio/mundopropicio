-- 0314 — #218: marca explícita do BP congelado no fecho final.
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Autorização 6618990686 (Pedro, 04/11/2026, opção B): só preparação.
-- Ordem: migração; backfill à mão só com confirmação; depois Publish.
-- Sem backfill automático: a descrição não prova que uma versão é final.
-- Reconcluir move a marca para a nova versão, no Master e nos Splits, atomicamente.
-- A função existente valida permissão e empresa antes de criar qualquer snapshot
-- (20260920202855_62cedbbe-e0ab-46e1-b652-261a8cf30d9c.sql, D-ERP38).
-- Rollback: supabase/manual/rollback_0314_issue218_bp_final_close_flag_comentado.sql

ALTER TABLE public.bp_versions
  ADD COLUMN IF NOT EXISTS is_final_close boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bp_versions.is_final_close IS
  'Snapshot do fecho final; no máximo uma versão por evento. Não inferir pela descrição.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_bp_versions_one_final_close_per_event
  ON public.bp_versions (event_id) WHERE is_final_close;

CREATE OR REPLACE FUNCTION public.create_final_close_bp_snapshot(
  _event_id uuid,
  _description text,
  _created_by_label text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  -- O portão de acesso e a autoria canónica são os da RPC existente.
  -- Só alterar marcas depois do seu sucesso; qualquer erro reverte toda a chamada.
  v_id := public.create_bp_snapshot(
    _event_id, _description, true, NULL, NULL, false, NULL, _created_by_label
  );

  UPDATE public.bp_versions
     SET is_final_close = false
   WHERE is_final_close
     AND (event_id = _event_id OR event_id IN (
       SELECT id FROM public.events WHERE parent_event_id = _event_id
     ));

  UPDATE public.bp_versions
     SET is_final_close = true
   WHERE id = v_id OR cascaded_from_version_id = v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_final_close_bp_snapshot(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_final_close_bp_snapshot(uuid, text, text) TO authenticated, service_role;
