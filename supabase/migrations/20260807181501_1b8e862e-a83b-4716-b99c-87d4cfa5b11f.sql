CREATE OR REPLACE FUNCTION public.get_or_create_generic_camarim_supplier(_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF _company_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id
    FROM public.suppliers
   WHERE company_id = _company_id
     AND is_active = true
     AND lower(btrim(name)) = lower('Diversos — Camarim')
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.suppliers (name, category, notes, is_active, company_id)
  VALUES (
    'Diversos — Camarim',
    'Camarim',
    'Fornecedor genérico para pequenas despesas de camarim sem cadastro próprio. O estabelecimento real fica registado no item e na descrição da transação.',
    true,
    _company_id
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
      FROM public.suppliers
     WHERE company_id = _company_id
       AND is_active = true
       AND lower(btrim(name)) = lower('Diversos — Camarim')
     LIMIT 1;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_generic_camarim_supplier(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_generic_camarim_supplier(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_camarim_item_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND COALESCE(NEW.approved_without_document, false) = false THEN
    -- Fornecedor deixou de ser obrigatório: pequenas despesas de camarim
    -- (lanchonete, combustível, farmácia…) não devem sujar o cadastro.
    -- Sem fornecedor associado, usa-se o genérico "Diversos — Camarim" da empresa.
    IF NEW.supplier_id IS NULL THEN
      NEW.supplier_id := public.get_or_create_generic_camarim_supplier(
        COALESCE(NEW.company_id, public.current_company_id())
      );
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