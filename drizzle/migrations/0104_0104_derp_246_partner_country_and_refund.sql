-- D-ERP246 (#85, por confirmar pelo Pedro): sede do sócio + motivo transitório da devolução
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'PT';
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_country_iso2 CHECK (country ~ '^[A-Z]{2}$');
COMMENT ON COLUMN public.suppliers.country IS 'D-ERP246: país da sede (ISO-2). Decide o IVA do redébito de despesas pagas pelo sócio.';

ALTER TABLE public.transactions DROP CONSTRAINT transactions_transitory_reason_domain;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_transitory_reason_domain CHECK (
  transitory_reason IS NULL OR transitory_reason = ANY (ARRAY['partner_advance','repasse','caucao','emprestimo_socio','carga_cartao','aporte_socio','entrada_a_repassar','devolucao_socio']::text[])
);

COMMENT ON TABLE public.partner_paid_expenses IS 'D-ERP246: LEGADO só leitura para o painel novo. Fonte única = transactions.paying_partner_id. O Fecho continua a lê-la até alinhamento (comando em DECISIONS).';