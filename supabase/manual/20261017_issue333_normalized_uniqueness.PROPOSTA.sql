-- #333 PROPOSTA GLOBAL SEPARADA: NÃO APLICAR. Necessita autorização/coordenacao #323.
-- NIF/número: apenas ASCII A-Z/0-9, maiúsculas, remove separadores.
-- NÃO remove prefixo de país, zeros ou acentos por aproximação.
-- Chaves NULL/vazias após normalização ficam fora (documento incompleto não identifica fatura).
-- Pré-condição: levantamento de conflitos repetido com escritores parados; resolver manualmente,
-- sem DELETE/merge/backfill automático. Manter o índice canónico exato existente.
-- CREATE CONCURRENTLY fora de transação; controlar indisvalid/indisready após conclusão.
CREATE UNIQUE INDEX CONCURRENTLY uq_standalone_invoice_normalized_333
ON public.standalone_invoices (
 company_id,
 upper(regexp_replace(supplier_nif,'[^A-Za-z0-9]','','g')),
 upper(regexp_replace(invoice_number,'[^A-Za-z0-9]','','g'))
)
WHERE nullif(upper(regexp_replace(supplier_nif,'[^A-Za-z0-9]','','g')),'') IS NOT NULL
 AND nullif(upper(regexp_replace(invoice_number,'[^A-Za-z0-9]','','g')),'') IS NOT NULL;
-- Rollback separado, também só com autorização: DROP INDEX CONCURRENTLY public.uq_standalone_invoice_normalized_333;
-- Falha de criação pode deixar índice inválido: inspecionar catálogo, remover só este índice
-- inválido com autorização e repetir levantamento; nunca apagar dados para fazer o índice caber.