-- Modelo: triagem-de-issues
-- Blocos curtos e separados, prontos a copiar. Só leitura.
-- Parâmetros: {{supabase_ref}}, {{request_id}}, {{company_id}}

-- 1) Pedir a lista de Issues abertas à edge function github-issues.
--    Devolve um request_id; a resposta lê-se no bloco 2.
--    A chave vem do vault — nunca escrever o segredo num chat, Issue ou documento.
select net.http_post(
  url := 'https://{{supabase_ref}}.supabase.co/functions/v1/github-issues',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret
                                     from vault.decrypted_secrets
                                    where name = 'email_queue_service_role_key')),
  body := '{"action":"list","state":"open"}'::jsonb
) as request_id;


-- 2) Ler a resposta: número, título e labels de cada issue aberta.
select i->>'number' as numero,
       i->>'title'  as titulo,
       (select string_agg(l->>'name', ' ' order by l->>'name')
          from jsonb_array_elements(i->'labels') l) as labels
from net._http_response r,
     lateral jsonb_array_elements((r.content::jsonb)->'issues') i
where r.id = {{request_id}}
order by (i->>'number')::int;


-- 3) Contagem por prioridade e por módulo, para o cabeçalho do relatório.
with issues as (
  select i
  from net._http_response r,
       lateral jsonb_array_elements((r.content::jsonb)->'issues') i
  where r.id = {{request_id}}
), labels as (
  select (i->>'number')::int as numero, l->>'name' as label
  from issues, lateral jsonb_array_elements(i->'labels') l
)
select label, count(*) as n
from labels
group by label
order by n desc;


-- 4) Confirmar que a resposta veio completa (a lista é paginada a 100 por página).
select (r.content::jsonb)->>'page'     as pagina,
       (r.content::jsonb)->>'has_more' as ha_mais,
       jsonb_array_length((r.content::jsonb)->'issues') as issues_nesta_pagina
from net._http_response r
where r.id = {{request_id}};


-- 5) Molde de verificação em Live. Nunca classificar uma issue pelo enunciado:
--    medir em Live o predicado que ela afirma, e registar o número com a data.
--    Substituir {{predicado_da_issue}} pela condição que a issue descreve.
select count(*) as linhas_que_ainda_cumprem_o_predicado
from public.transactions t
where t.company_id = '{{company_id}}'
  and {{predicado_da_issue}};
