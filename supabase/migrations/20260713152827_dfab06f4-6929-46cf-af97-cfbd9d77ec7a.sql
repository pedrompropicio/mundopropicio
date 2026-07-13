
-- Fase 1: schema para conta-corrente por sessão + responsável explícito

-- 1) Novas colunas em camarim_sessions
ALTER TABLE public.camarim_sessions
  ADD COLUMN IF NOT EXISTS fund_holder_type text NOT NULL DEFAULT 'employee',
  ADD COLUMN IF NOT EXISTS fund_holder_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fund_holder_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS advance_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.camarim_sessions
  DROP CONSTRAINT IF EXISTS camarim_sessions_fund_holder_type_check;
ALTER TABLE public.camarim_sessions
  ADD CONSTRAINT camarim_sessions_fund_holder_type_check
  CHECK (fund_holder_type IN ('employee','supplier'));

-- Coerência do responsável
ALTER TABLE public.camarim_sessions
  DROP CONSTRAINT IF EXISTS camarim_sessions_fund_holder_ref_check;
ALTER TABLE public.camarim_sessions
  ADD CONSTRAINT camarim_sessions_fund_holder_ref_check
  CHECK (
    (fund_holder_type = 'employee' AND fund_holder_supplier_id IS NULL)
    OR (fund_holder_type = 'supplier' AND fund_holder_user_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_camarim_sessions_advance_account
  ON public.camarim_sessions(advance_account_id);
CREATE INDEX IF NOT EXISTS idx_camarim_sessions_fund_holder_supplier
  ON public.camarim_sessions(fund_holder_supplier_id);

-- 2) Auto-criar financial_accounts (type='camarim_session', hidden) ao criar sessão
CREATE OR REPLACE FUNCTION public.ensure_camarim_advance_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acc_id uuid;
  v_name text;
BEGIN
  IF NEW.advance_account_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_name := 'Camarim · ' || COALESCE(NEW.title, NEW.id::text);

  INSERT INTO public.financial_accounts (
    name, type, description, initial_balance,
    is_active, balance_visible_to_all, is_hidden,
    skip_balance_check, company_id
  ) VALUES (
    left(v_name, 200),
    'camarim_session',
    'Conta-corrente automática da sessão de camarim ' || NEW.id::text,
    0,
    true,
    false,
    true,        -- oculta dos seletores globais
    true,        -- não bloquear por saldo negativo temporário
    NEW.company_id
  )
  RETURNING id INTO v_acc_id;

  NEW.advance_account_id := v_acc_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_camarim_sessions_ensure_advance_account ON public.camarim_sessions;
CREATE TRIGGER trg_camarim_sessions_ensure_advance_account
BEFORE INSERT ON public.camarim_sessions
FOR EACH ROW EXECUTE FUNCTION public.ensure_camarim_advance_account();

-- Também renomear a conta quando o título da sessão muda
CREATE OR REPLACE FUNCTION public.sync_camarim_advance_account_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.advance_account_id IS NOT NULL
     AND NEW.title IS DISTINCT FROM OLD.title THEN
    UPDATE public.financial_accounts
       SET name = left('Camarim · ' || NEW.title, 200),
           updated_at = now()
     WHERE id = NEW.advance_account_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_camarim_sessions_sync_account_name ON public.camarim_sessions;
CREATE TRIGGER trg_camarim_sessions_sync_account_name
AFTER UPDATE ON public.camarim_sessions
FOR EACH ROW EXECUTE FUNCTION public.sync_camarim_advance_account_name();

-- 3) Retro-preencher advance_account_id para sessões existentes ainda não integradas
DO $$
DECLARE
  r RECORD;
  v_acc_id uuid;
BEGIN
  FOR r IN
    SELECT id, title, company_id
      FROM public.camarim_sessions
     WHERE advance_account_id IS NULL
       AND status <> 'integrated'
  LOOP
    INSERT INTO public.financial_accounts (
      name, type, description, initial_balance,
      is_active, balance_visible_to_all, is_hidden,
      skip_balance_check, company_id
    ) VALUES (
      left('Camarim · ' || COALESCE(r.title, r.id::text), 200),
      'camarim_session',
      'Conta-corrente automática da sessão de camarim ' || r.id::text,
      0, true, false, true, true, r.company_id
    )
    RETURNING id INTO v_acc_id;

    UPDATE public.camarim_sessions
       SET advance_account_id = v_acc_id
     WHERE id = r.id;
  END LOOP;
END $$;

-- 4) Aprovação de camarim_items exige documento fiscal completo (fornecedor + nº + data)
CREATE OR REPLACE FUNCTION public.validate_camarim_item_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND COALESCE(NEW.approved_without_document, false) = false THEN
    IF NEW.supplier_id IS NULL THEN
      RAISE EXCEPTION 'Fornecedor é obrigatório para aprovar um item de camarim';
    END IF;
    IF NEW.document_number IS NULL OR btrim(NEW.document_number) = '' THEN
      RAISE EXCEPTION 'Número do documento é obrigatório para aprovar um item de camarim';
    END IF;
    IF NEW.document_date IS NULL THEN
      RAISE EXCEPTION 'Data do documento é obrigatória para aprovar um item de camarim';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_camarim_item_approval ON public.camarim_items;
CREATE TRIGGER trg_validate_camarim_item_approval
BEFORE INSERT OR UPDATE ON public.camarim_items
FOR EACH ROW EXECUTE FUNCTION public.validate_camarim_item_approval();

-- 5) RLS: as camarim_session accounts têm de ser lidas por quem gere o camarim
-- (financial_accounts já tem policies; a criação vai por SECURITY DEFINER — OK)
