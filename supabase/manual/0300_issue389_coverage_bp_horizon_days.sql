-- 0300 — Issue #389 (Lote B, #435): horizonte do BP em dias por evento raiz.
-- Data: 2026-11-01. Classe R2. PREPARAÇÃO: só ficheiro, sem executar.
-- Aplicação: 0 · Cowork pelo PROC-promocao (mp-homolog-3 → Live com "Sim" do Pedro).
-- Referências: Issue #389, Posição Financeira / P5c e migração 0289.
-- Conferência Live por SELECT em 2026-11-01: public.event_coverage_scenarios existe;
-- RLS ativa (relrowsecurity=true; relforcerowsecurity=false). Colunas atuais:
-- event_id uuid NOT NULL, company_id uuid NOT NULL, modo text NOT NULL (default 'real'),
-- percentagem numeric NOT NULL (default 0), receita_manual_bruta numeric NULL,
-- viragem_real_dias integer NULL, updated_by uuid NULL,
-- updated_at timestamptz NOT NULL (default now()). bp_horizon_days ainda não existe.
-- Políticas existentes para authenticated:
-- company_isolation_event_coverage_scenarios: RESTRICTIVE ALL, USING e WITH CHECK
-- row_belongs_to_current_company(company_id).
-- event_coverage_scenarios_select: PERMISSIVE SELECT, is_platform_admin(auth.uid())
-- OR has_permission(auth.uid(), 'view_financial_position'). Não permite escrita.
-- event_coverage_scenarios_write: PERMISSIVE ALL, USING e WITH CHECK
-- is_platform_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)
-- OR has_role(auth.uid(), 'manager'::app_role).
-- A escrita autenticada já está limitada a admin/manager, com a exceção existente
-- de platform_admin e isolamento por empresa; nenhuma política nova é criada.
-- Coluna opcional por evento raiz: NULL = 30 dias por defeito; 0 desliga;
-- contagem a partir do primeiro dia do evento. Sem backfill nem alteração de dados.
-- A lógica de ecrã da linha «compromisso previsto até ao evento» é tarefa R1 separada,
-- só depois de a coluna estar em Live (PROC-promocao, passo 7).

-- ROLLBACK COMENTADO — não executar nesta preparação.
-- ALTER TABLE public.event_coverage_scenarios DROP COLUMN IF EXISTS bp_horizon_days;

-- ALTERAÇÃO PREPARADA — não aplicada.
ALTER TABLE public.event_coverage_scenarios
  ADD COLUMN IF NOT EXISTS bp_horizon_days integer NULL
  CHECK (bp_horizon_days IS NULL OR bp_horizon_days >= 0);

COMMENT ON COLUMN public.event_coverage_scenarios.bp_horizon_days IS
  'Horizonte do BP em dias por evento raiz: NULL = 30 dias por defeito; 0 desliga a regra nesse evento; valores positivos definem o horizonte, contado a partir do primeiro dia do evento.';
