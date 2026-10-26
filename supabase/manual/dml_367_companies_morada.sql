-- #367 — DML por aprovar pelo Pedro. NÃO aplicado. companies.address é jsonb (hoje '{}').
-- O código trata address como objeto livre (Record<string, any>); chaves propostas: street, postal_code, city, country (ISO).
begin;
update public.companies
   set address = jsonb_build_object('street','Rua Prista Monteiro 13B','postal_code','1600-792','city','Lisboa','country','PT')
 where id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c' and address = '{}'::jsonb;
-- esperado: UPDATE 1
commit;
-- rollback: update public.companies set address = '{}'::jsonb where id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
