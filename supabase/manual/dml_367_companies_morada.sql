-- #367 — DML por aprovar pelo Pedro. NÃO aplicado. Confirmar primeiro a coluna de morada:
-- select column_name from information_schema.columns where table_schema='public' and table_name='companies' and column_name ilike '%address%';
begin;
update public.companies
   set address = 'Rua Prista Monteiro 13B, 1600-792 Lisboa, Portugal'
 where id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
   and (address is null or address = '');
-- esperado: UPDATE 1
commit;
-- rollback: update public.companies set address = null where id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
