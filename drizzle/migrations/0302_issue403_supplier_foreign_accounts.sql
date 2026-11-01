-- 0302 — Issue #403b (Lote B, #435): contas e identificador fiscal de fornecedor estrangeiro.
-- Data: 2026-11-01. Classe R2. PREPARAÇÃO: só ficheiro, sem executar.
-- Aplicação: 0 · Cowork pelo PROC-promocao (mp-homolog-3 → Live com "Sim" do Pedro).
-- Aditiva, sem backfill; não altera dados existentes nem abre a Fase 8 multi-país.
-- Conferência Live por SELECT em 2026-11-01: public.suppliers existe;
-- RLS ativa (relrowsecurity=true; relforcerowsecurity=false). Colunas atuais (24):
-- id uuid NOT NULL (default gen_random_uuid()), name text NOT NULL, nif text NULL,
-- contact_name text NULL, email text NULL, phone text NULL, address text NULL,
-- iban text NULL, payment_terms text NULL, category text NULL, notes text NULL,
-- is_active boolean NOT NULL (default true), created_at timestamptz NOT NULL (default now()),
-- updated_at timestamptz NOT NULL (default now()), swift_bic text NULL, trade_name text NULL,
-- is_partner boolean NOT NULL (default false), iban_2 text NULL, iban_3 text NULL,
-- swift_bic_2 text NULL, swift_bic_3 text NULL,
-- company_id uuid NOT NULL (default current_company_id()),
-- doc_locale text NOT NULL (default 'pt-PT'), country text NOT NULL (default 'PT').
-- foreign_bank_accounts, tax_id_foreign e tax_id_type ainda não existem.
-- Políticas atuais (sem criação ou alteração de políticas nesta preparação):
-- "Suppliers deletable by admin or manager": PERMISSIVE DELETE TO authenticated;
-- USING has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager').
-- "Suppliers insertable by admin, manager or editor": PERMISSIVE INSERT TO authenticated;
-- WITH CHECK has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')
-- OR has_role(auth.uid(), 'editor').
-- "Suppliers updatable by admin, manager or editor": PERMISSIVE UPDATE TO authenticated;
-- USING e WITH CHECK has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')
-- OR has_role(auth.uid(), 'editor').
-- "Suppliers viewable by tenant members": PERMISSIVE SELECT TO authenticated;
-- USING has_role(auth.uid(), papel), para admin, manager, marketing_manager, editor,
-- viewer, producer, field_producer ou accountant.
-- company_isolation_suppliers: RESTRICTIVE ALL TO authenticated;
-- USING e WITH CHECK company_id = current_company_id().
-- issue335_internal: PERMISSIVE ALL TO issue335_executor;
-- USING e WITH CHECK company_id = current_company_id().
-- As políticas existentes permanecem intactas; esta migração não alarga permissões.
-- UI SupplierFormModal (tipo de conta por slot, MOD-97 só para 'iban', país a sério)
-- é tarefa R1 separada, só depois das colunas em Live (PROC-promocao, passo 7).
-- A parte «MOD-97 só quando o slot é IBAN» já pertence ao Lote A, #403a.
-- O esquema e a unicidade por slot ficam documentados no COMMENT; o CHECK pedido
-- valida apenas que foreign_bank_accounts é um array, sem nova função ou trigger.

-- ROLLBACK COMENTADO — não executar nesta preparação.
-- ALTER TABLE public.suppliers DROP COLUMN IF EXISTS foreign_bank_accounts;
-- ALTER TABLE public.suppliers DROP COLUMN IF EXISTS tax_id_foreign;
-- ALTER TABLE public.suppliers DROP COLUMN IF EXISTS tax_id_type;

-- ALTERAÇÃO PREPARADA — não aplicada.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS foreign_bank_accounts jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(foreign_bank_accounts) = 'array'),
  ADD COLUMN IF NOT EXISTS tax_id_foreign text NULL,
  ADD COLUMN IF NOT EXISTS tax_id_type text NULL
    CHECK (tax_id_type IS NULL OR tax_id_type IN ('cpf','cnpj','ein','tin','vat','outro'));

COMMENT ON COLUMN public.suppliers.foreign_bank_accounts IS
  'Contas bancárias estrangeiras por slot, um elemento por slot. Esquema de cada elemento: {slot: 1|2|3, account_type: ''iban''|''aba_us''|''br_banco_agencia_conta''|''outro'', account_number, routing_number, bank_name, bank_address, intermediary_bank, beneficiary_name, swift_bic, notes}. O slot do tipo ''iban'' continua a viver em iban/iban_2/iban_3 + swift_bic/swift_bic_2/swift_bic_3; não duplicar esses dados neste array.';

COMMENT ON COLUMN public.suppliers.tax_id_foreign IS
  'Identificador fiscal estrangeiro do fornecedor, ao lado do nif, que fica reservado para PT. O tipo é indicado em tax_id_type; não altera dados fiscais das transações nem abre a Fase 8 multi-país.';

COMMENT ON COLUMN public.suppliers.tax_id_type IS
  'Tipo do identificador fiscal estrangeiro em tax_id_foreign: cpf, cnpj, ein, tin, vat ou outro; NULL quando não indicado. O nif mantém-se para PT.';
