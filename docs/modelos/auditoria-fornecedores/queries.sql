-- Modelo: auditoria-fornecedores
-- Blocos curtos e separados, prontos a copiar. Só leitura.
-- Parâmetros: {{company_id}}
-- Colunas de suppliers verificadas em Live a 23/10/2026:
--   id, name, nif, email, phone, address, iban, iban_2, iban_3, swift_bic*,
--   trade_name, is_partner, doc_locale, country, is_active, company_id

-- 1) Ponto de partida: quantos têm NIF e quantos não têm.
select count(*)                                    as fornecedores,
       count(*) filter (where nif is not null)     as com_nif,
       count(*) filter (where nif is null)         as sem_nif
from public.suppliers
where company_id = '{{company_id}}'
  and is_active = true;


-- 2) Fornecedores sem NIF, por valor pago decrescente. É por aqui que se começa:
--    o rendimento por lote é decrescente por construção.
select s.id,
       s.name,
       s.trade_name,
       count(t.id)                                       as n_transacoes,
       round(sum(coalesce(t.paid_amount, t.amount)), 2)   as pago
from public.suppliers s
join public.transactions t on t.supplier_id = s.id
where s.company_id = '{{company_id}}'
  and s.nif is null
  and (t.status = 'paid' or coalesce(t.paid_amount, 0) > 0)
group by s.id, s.name, s.trade_name
order by pago desc;


-- 3) Para cada fornecedor sem NIF, o documento mais provável de ser fatura.
--    Exclui comprovativos de lote; prioriza nomes de fatura.
select s.id, s.name, d.name as documento, d.file_url
from public.suppliers s
join public.transactions t on t.supplier_id = s.id
join public.transaction_documents d on d.transaction_id = t.id
where s.company_id = '{{company_id}}'
  and s.nif is null
  and d.file_url not like '%payment-lists/%'
  and (d.name ~* '(fatura|invoice|recibo|\mFT\M|\mFR\M|NFS)')
order by s.name, d.name;


-- 4) VALIDADOR do dígito de controlo do NIF português (pesos 9→2, mod 11).
--    Devolve as fichas cujo NIF de 9 dígitos NÃO passa no cálculo.
--    Nenhum NIF se grava sem passar aqui.
with s as (
  select id, name, regexp_replace(nif, '\D', '', 'g') as n
  from public.suppliers
  where company_id = '{{company_id}}'
    and nif is not null
    and regexp_replace(nif, '\D', '', 'g') ~ '^[0-9]{9}$'
)
select s.id, s.name, s.n as nif,
       case when (11 - (v.soma % 11)) >= 10 then 0 else (11 - (v.soma % 11)) end as dv_calculado,
       substring(s.n, 9, 1)::int as dv_do_nif
from s
cross join lateral (
  select sum(substring(s.n, i, 1)::int * (10 - i)) as soma
  from generate_series(1, 8) as i
) v
where case when (11 - (v.soma % 11)) >= 10 then 0 else (11 - (v.soma % 11)) end
      <> substring(s.n, 9, 1)::int;


-- 5) Colisões de NIF: duas fichas com o mesmo número.
--    Duas fichas da mesma entidade em empresas diferentes do grupo NÃO são duplicado.
select regexp_replace(nif, '\D', '', 'g') as nif_normalizado,
       count(*)                           as n_fichas,
       string_agg(name, ' | ' order by name) as fichas
from public.suppliers
where company_id = '{{company_id}}'
  and nif is not null
group by 1
having count(*) > 1
order by n_fichas desc;


-- 6) Colisões de IBAN, nos três campos.
--    Índices únicos por IBAN activos desde 12/09/2026.
with ibans as (
  select id, name, upper(replace(iban,   ' ', '')) as iban from public.suppliers
    where company_id = '{{company_id}}' and iban   is not null
  union all
  select id, name, upper(replace(iban_2, ' ', '')) from public.suppliers
    where company_id = '{{company_id}}' and iban_2 is not null
  union all
  select id, name, upper(replace(iban_3, ' ', '')) from public.suppliers
    where company_id = '{{company_id}}' and iban_3 is not null
)
select iban,
       count(distinct id)                      as n_fichas,
       string_agg(distinct name, ' | ')        as fichas
from ibans
group by iban
having count(distinct id) > 1
order by n_fichas desc;


-- 7) Candidatos a ficha duplicada por nome, para rever à mão.
--    O nome comercial pode não bater com o nome legal: confirmar sempre por IBAN e NIF.
select a.id, a.name, b.id as id_irmao, b.name as nome_irmao, a.nif, b.nif as nif_irmao
from public.suppliers a
join public.suppliers b
  on b.company_id = a.company_id
 and b.id <> a.id
 and lower(regexp_replace(b.name, '[^a-zA-Z0-9]', '', 'g'))
   = lower(regexp_replace(a.name, '[^a-zA-Z0-9]', '', 'g'))
where a.company_id = '{{company_id}}'
  and a.id < b.id;


-- 8) Documentos inalcançáveis: linha na base sem objeto no bucket.
--    Foi esta varredura que revelou 141 ficheiros com um prefixo a mais no file_url.
select d.id, d.transaction_id, d.file_url
from public.transaction_documents d
where d.file_url not like 'camarim://%'
  and d.file_url not like 'card://%'
  and d.file_url not like 'bank://%'
  and not exists (
        select 1 from storage.objects o
         where o.bucket_id = 'transaction-documents'
           and o.name = d.file_url)
order by d.file_url;
