
-- ============================================================
-- PARTE 0: remover modelo antigo (abandonado, nunca foi a Live)
-- ============================================================
DROP TRIGGER IF EXISTS event_commercial_context_log_trg ON crm.event_commercial_context;
DROP TRIGGER IF EXISTS event_commercial_context_updated_at_trg ON crm.event_commercial_context;
DROP FUNCTION IF EXISTS crm.event_commercial_context_write_log() CASCADE;
DROP FUNCTION IF EXISTS crm.event_commercial_context_set_updated_at() CASCADE;
DROP TABLE IF EXISTS crm.event_commercial_context_log CASCADE;
DROP TABLE IF EXISTS crm.event_commercial_context CASCADE;

-- ============================================================
-- PARTE A: novo modelo de Gatilhos Estratégicos
-- ============================================================

-- 1) Catálogo global por company
CREATE TABLE crm.strategic_trigger_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  chave text NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('escassez','antecipacao','narrativa','calendario')),
  descricao text,
  carrega_afirmacao_factual boolean NOT NULL DEFAULT false,
  is_seed boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, chave)
);

-- 2) Gatilhos activos por evento
CREATE TABLE crm.event_active_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  trigger_id uuid NOT NULL REFERENCES crm.strategic_trigger_catalog(id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','expirado')),
  validade date,
  detalhe text,
  created_by uuid,
  activated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, trigger_id)
);

CREATE INDEX event_active_triggers_event_idx ON crm.event_active_triggers(event_id);
CREATE INDEX event_active_triggers_company_idx ON crm.event_active_triggers(company_id);

-- 3) Log append-only
CREATE TABLE crm.event_active_triggers_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid NOT NULL,
  active_trigger_id uuid,
  trigger_id uuid NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL CHECK (action IN ('insert','update','delete')),
  old_state jsonb,
  new_state jsonb
);

CREATE INDEX event_active_triggers_log_event_idx ON crm.event_active_triggers_log(event_id, changed_at DESC);

-- GRANTs (schema crm, padrão idêntico ao das outras tabelas crm)
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.strategic_trigger_catalog TO authenticated;
GRANT ALL ON crm.strategic_trigger_catalog TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.event_active_triggers TO authenticated;
GRANT ALL ON crm.event_active_triggers TO service_role;
GRANT SELECT ON crm.event_active_triggers_log TO authenticated;
GRANT ALL ON crm.event_active_triggers_log TO service_role;

-- 4) Triggers: updated_at + log
CREATE OR REPLACE FUNCTION crm.strategic_triggers_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, crm
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER strategic_trigger_catalog_updated_at_trg
BEFORE UPDATE ON crm.strategic_trigger_catalog
FOR EACH ROW EXECUTE FUNCTION crm.strategic_triggers_set_updated_at();

CREATE TRIGGER event_active_triggers_updated_at_trg
BEFORE UPDATE ON crm.event_active_triggers
FOR EACH ROW EXECUTE FUNCTION crm.strategic_triggers_set_updated_at();

CREATE OR REPLACE FUNCTION crm.event_active_triggers_write_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, crm
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO crm.event_active_triggers_log (
      company_id, event_id, active_trigger_id, trigger_id,
      changed_by, action, old_state, new_state
    ) VALUES (
      NEW.company_id, NEW.event_id, NEW.id, NEW.trigger_id,
      v_actor, 'insert', NULL, to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO crm.event_active_triggers_log (
      company_id, event_id, active_trigger_id, trigger_id,
      changed_by, action, old_state, new_state
    ) VALUES (
      NEW.company_id, NEW.event_id, NEW.id, NEW.trigger_id,
      v_actor, 'update', to_jsonb(OLD), to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO crm.event_active_triggers_log (
      company_id, event_id, active_trigger_id, trigger_id,
      changed_by, action, old_state, new_state
    ) VALUES (
      OLD.company_id, OLD.event_id, OLD.id, OLD.trigger_id,
      v_actor, 'delete', to_jsonb(OLD), NULL
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER event_active_triggers_log_trg
AFTER INSERT OR UPDATE OR DELETE ON crm.event_active_triggers
FOR EACH ROW EXECUTE FUNCTION crm.event_active_triggers_write_log();

-- 5) RLS — padrão crm.meta_campaign_diagnoses
ALTER TABLE crm.strategic_trigger_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.event_active_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.event_active_triggers_log ENABLE ROW LEVEL SECURITY;

-- strategic_trigger_catalog
CREATE POLICY service_role_bypass ON crm.strategic_trigger_catalog
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_isolation_select ON crm.strategic_trigger_catalog
  FOR SELECT TO authenticated USING (company_id = current_company_id());
CREATE POLICY tenant_isolation_insert ON crm.strategic_trigger_catalog
  FOR INSERT TO authenticated WITH CHECK (company_id = current_company_id());
CREATE POLICY tenant_isolation_update ON crm.strategic_trigger_catalog
  FOR UPDATE TO authenticated USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());
CREATE POLICY tenant_isolation_delete ON crm.strategic_trigger_catalog
  FOR DELETE TO authenticated USING (company_id = current_company_id());

-- event_active_triggers
CREATE POLICY service_role_bypass ON crm.event_active_triggers
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_isolation_select ON crm.event_active_triggers
  FOR SELECT TO authenticated USING (company_id = current_company_id());
CREATE POLICY tenant_isolation_insert ON crm.event_active_triggers
  FOR INSERT TO authenticated WITH CHECK (company_id = current_company_id());
CREATE POLICY tenant_isolation_update ON crm.event_active_triggers
  FOR UPDATE TO authenticated USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());
CREATE POLICY tenant_isolation_delete ON crm.event_active_triggers
  FOR DELETE TO authenticated USING (company_id = current_company_id());

-- event_active_triggers_log: só SELECT (escrita via trigger SECURITY DEFINER)
CREATE POLICY service_role_bypass ON crm.event_active_triggers_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_isolation_select ON crm.event_active_triggers_log
  FOR SELECT TO authenticated USING (company_id = current_company_id());

-- 6) Seed para Mundo Propício (idempotente)
INSERT INTO crm.strategic_trigger_catalog (company_id, chave, nome, tipo, descricao, carrega_afirmacao_factual, is_seed)
VALUES
  ('7c858982-6ccd-47ca-bd65-e0dd3eebf01c', 'mudanca_lote', 'Mudança de lote', 'escassez', 'O preço sobe na próxima virada de lote — incentiva a compra antes da subida.', true, true),
  ('7c858982-6ccd-47ca-bd65-e0dd3eebf01c', 'contagem_regressiva', 'Contagem regressiva do evento', 'antecipacao', 'Faltam X dias para o evento — urgência pela proximidade da data.', true, true),
  ('7c858982-6ccd-47ca-bd65-e0dd3eebf01c', 'ultimos_bilhetes', 'Últimos bilhetes', 'escassez', 'Stock a esgotar — escassez por disponibilidade.', true, true),
  ('7c858982-6ccd-47ca-bd65-e0dd3eebf01c', 'momento_artista', 'Momento do artista/evento', 'narrativa', 'Contexto do artista ou do evento que gera desejo/procura (lançamento, novidade, momento mediático).', false, true),
  ('7c858982-6ccd-47ca-bd65-e0dd3eebf01c', 'janela_liquidez', 'Janela de liquidez (início/fim do mês)', 'antecipacao', 'Momento do mês em que o público tem mais disponibilidade de caixa — induzir compra nessa janela.', false, true)
ON CONFLICT (company_id, chave) DO NOTHING;
