# #333 — proposta de unicidade global (NÃO aplicada)

## Definição e impacto

`supabase/manual/20261017_issue333_normalized_uniqueness.PROPOSTA.sql` adicionaria um segundo índice, preservando o exato. Igualdade por empresa + NIF + número em maiúsculas ASCII, sem pontuação/espaços. Prefixos de país e zeros mantidos; NULL/normalizado vazio não identificam fatura e ficam excluídos. Não é deduplicação por semelhança.

Isto altera TODOS os escritores de `standalone_invoices`: scanner, ingestão legada, assistente e edição. Inserts/updates com variação apenas de caixa/separadores passariam a receber 23505. O helper do scanner reconhece 23505; a ingestão legada pode precisar de uma conferência explícita de duplicado em vez de erro genérico. Não transformar o conflito em sucesso/reused sem comparar documento e metadados. Nenhum escritor, trigger ou índice global foi alterado nesta tarefa.

## Levantamento somente SELECT

17/10/2026, consulta agregada do agente: 0 grupos de conflito normalizado; 32 chaves incompletas. Catálogo: sessions ausente, commit ausente, 0 buckets staging. Zero grupos agora NÃO autoriza ativação e não protege inserts futuros. Nenhum NIF, nome, ID de fatura ou documento incluído nesta prova.

```sql
SELECT count(*) AS conflict_groups FROM (
 SELECT company_id, upper(regexp_replace(supplier_nif,'[^A-Za-z0-9]','','g')),
 upper(regexp_replace(invoice_number,'[^A-Za-z0-9]','','g'))
 FROM public.standalone_invoices
 WHERE nullif(upper(regexp_replace(supplier_nif,'[^A-Za-z0-9]','','g')),'') IS NOT NULL
 AND nullif(upper(regexp_replace(invoice_number,'[^A-Za-z0-9]','','g')),'') IS NOT NULL
 GROUP BY 1,2,3 HAVING count(*)>1
) x;
```

## Rollout seguro, pendente

1. Autorização explícita da mudança global e coordenação com #323. Upload/execute continuam fechados.
2. Inventariar escritores/edições, testar 23505 e apresentação de divergência; repetir SELECT privado imediatamente antes da janela.
3. Se surgir conflito: suspender rollout e rever individualmente com Pedro. Sem apagar/mesclar/backfill implícito.
4. Migração tracked própria; execução CONCURRENTLY fora de transação; verificar índice válido, grants inalterados e regressões em escritores legados antes de eventual ativação #333.
5. Falha: não ativar. Inspecionar índice inválido e só remover esse índice com autorização. Rollback DROP INDEX CONCURRENTLY; manter índice exato, dados e auditoria intactos. Rollback implica #333 fechada por regressar a janela de duplicação.

## Provas locais

PostgreSQL real descartável, duas ligações: tabela fictícia independente com a mesma expressão; legado/novo em ambas as ordens bloqueados por 23505, NULL/vazio repetidos permitidos e empresas distintas independentes. O índice canónico da fixture #333 continua intacto, incluindo o teste que comprova a limitação atual.