REVOKE SELECT (iban, iban_2, iban_3, swift_bic, swift_bic_2, swift_bic_3) ON public.suppliers FROM authenticated;
REVOKE SELECT (iban, iban_2, iban_3, swift_bic, swift_bic_2, swift_bic_3) ON public.suppliers FROM anon;

COMMENT ON COLUMN public.suppliers.iban IS 'Dados bancarios: sem grant de SELECT a authenticated/anon. Acesso exclusivamente via public.get_supplier_bank_details() (verifica papel + current_company_id()).';
COMMENT ON COLUMN public.suppliers.iban_2 IS 'Dados bancarios: sem grant de SELECT a authenticated/anon. Acesso exclusivamente via public.get_supplier_bank_details().';
COMMENT ON COLUMN public.suppliers.iban_3 IS 'Dados bancarios: sem grant de SELECT a authenticated/anon. Acesso exclusivamente via public.get_supplier_bank_details().';
COMMENT ON COLUMN public.suppliers.swift_bic IS 'Dados bancarios: sem grant de SELECT a authenticated/anon. Acesso exclusivamente via public.get_supplier_bank_details().';
COMMENT ON COLUMN public.suppliers.swift_bic_2 IS 'Dados bancarios: sem grant de SELECT a authenticated/anon. Acesso exclusivamente via public.get_supplier_bank_details().';
COMMENT ON COLUMN public.suppliers.swift_bic_3 IS 'Dados bancarios: sem grant de SELECT a authenticated/anon. Acesso exclusivamente via public.get_supplier_bank_details().';

COMMENT ON POLICY "Suppliers viewable by tenant members" ON public.suppliers IS 'Autoriza a LINHA a membros do tenant (admin, manager, marketing_manager, editor, viewer, producer, field_producer, accountant), sempre em conjunto com a policy RESTRICTIVE company_isolation_suppliers. As COLUNAS bancarias (iban, iban_2, iban_3, swift_bic, swift_bic_2, swift_bic_3) NAO estao acessiveis: nao ha grant de SELECT nessas colunas para authenticated. Nunca executar GRANT SELECT ON public.suppliers TO authenticated (grant a tabela inteira reabriria as 6 colunas).';