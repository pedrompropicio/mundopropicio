REVOKE ALL ON public.cache_payment_contracts FROM anon, authenticated;
REVOKE ALL ON public.cache_payment_contract_cities FROM anon, authenticated;
GRANT SELECT ON public.cache_payment_contracts TO authenticated;
GRANT SELECT ON public.cache_payment_contract_cities TO authenticated;