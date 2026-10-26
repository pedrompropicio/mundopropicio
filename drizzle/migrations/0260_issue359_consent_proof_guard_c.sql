-- #359 RASCUNHO — NÃO APLICADO. Migração C: anti-forja das 3 colunas de prova em lead_capture.
-- Ordem: A (0250) → grants (0251) → C → B. Atribuição pura: nunca RAISE, nunca bloqueia a captação.
-- Papéis de confiança: service_role (portal-track), postgres (dono das funções SECURITY DEFINER
-- crm_ingest_lead_captures / crm_ingest_clube_captures_by_ids / process_lead_captures_batch / confirmar_lista), supabase_admin.
DO $$ BEGIN
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='lead_capture'
     AND column_name IN ('consent_email_text_version','consent_whatsapp_text_version','consent_decided_at')) <> 3
 THEN RAISE EXCEPTION 'source_drift_359_c'; END IF;
END $$;

CREATE FUNCTION public._lead_capture_consent_proof_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('service_role','postgres','supabase_admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.consent_email_text_version := NULL;
    NEW.consent_whatsapp_text_version := NULL;
    NEW.consent_decided_at := NULL;
  ELSE
    NEW.consent_email_text_version := OLD.consent_email_text_version;
    NEW.consent_whatsapp_text_version := OLD.consent_whatsapp_text_version;
    NEW.consent_decided_at := OLD.consent_decided_at;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._lead_capture_consent_proof_guard() FROM PUBLIC, anon, authenticated;

-- Nome "zzz_" para correr depois dos restantes BEFORE (ordem alfabética): nenhum outro pode repor as colunas.
CREATE TRIGGER zzz_lead_capture_consent_proof_guard BEFORE INSERT OR UPDATE ON public.lead_capture
  FOR EACH ROW EXECUTE FUNCTION public._lead_capture_consent_proof_guard();
