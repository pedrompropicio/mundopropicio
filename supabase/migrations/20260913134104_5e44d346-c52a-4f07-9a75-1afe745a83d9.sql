DROP TRIGGER IF EXISTS trg_set_company_id ON public.email_send_state;

ALTER TABLE public.email_send_state
  ALTER COLUMN company_id SET DEFAULT COALESCE(
    public.current_company_id(),
    '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'::uuid
  );