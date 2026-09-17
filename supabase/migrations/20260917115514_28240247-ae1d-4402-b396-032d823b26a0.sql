UPDATE public.transactions t SET transitory_reason = 'partner_advance'
 WHERE t.is_transitory AND t.transitory_reason IS NULL
   AND EXISTS (SELECT 1 FROM public.partner_advance_expenses p WHERE p.transaction_id = t.id);

UPDATE public.transactions t SET transitory_reason = 'aporte_socio'
 WHERE t.is_transitory AND t.transitory_reason IS NULL
   AND (EXISTS (SELECT 1 FROM public.partner_aporte_mirror m WHERE m.aporte_transaction_id = t.id)
        OR EXISTS (SELECT 1 FROM public.account_categories ac WHERE ac.id = t.category_id AND ac.code = '10.1.01'));

UPDATE public.transactions t SET transitory_reason = 'emprestimo_socio'
 WHERE t.is_transitory AND t.transitory_reason IS NULL
   AND EXISTS (SELECT 1 FROM public.account_categories ac WHERE ac.id = t.category_id AND ac.code = '10.1.04');

UPDATE public.transactions t SET transitory_reason = 'carga_cartao'
 WHERE t.is_transitory AND t.transitory_reason IS NULL
   AND EXISTS (SELECT 1 FROM public.account_categories ac WHERE ac.id = t.category_id AND ac.code LIKE '10.3%');

UPDATE public.transactions t SET transitory_reason = 'repasse'
 WHERE t.is_transitory AND t.transitory_reason IS NULL AND t.description ILIKE 'Repasse%';

UPDATE public.transactions t SET transitory_reason = 'caucao'
 WHERE t.is_transitory AND t.transitory_reason IS NULL AND t.description ILIKE 'Cau%';

UPDATE public.transactions t SET transitory_reason = 'entrada_a_repassar'
 WHERE t.is_transitory AND t.transitory_reason IS NULL AND t.type = 'income';

ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_transitory_reason_required;

-- Verificador de invariantes (D-ERP80): Extra do Sócio declarado sem linha de extra.
INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES (
  'transitoria_partner_advance_sem_linha',
  'Transitória com motivo «Extra do Sócio» sem linha em partner_advance_expenses.',
  'error', 'global', 0,
  'Criada em 17/09/2026 com o motivo da transitória (D-ERP80). Antes a verificação tinha de adivinhar pela descrição.'
)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      severity = EXCLUDED.severity,
      scope = EXCLUDED.scope,
      reference_count = EXCLUDED.reference_count,
      notes = EXCLUDED.notes;