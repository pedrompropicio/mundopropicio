-- #333 PROPOSTA GLOBAL SEPARADA: NÃO APLICAR. Necessita autorização/coordenacao #323.
-- Política FORTE proposta: apenas trim ASCII SPACE nas extremidades + caixa ASCII.
-- Preserva TODOS os separadores internos, pontuação, prefixos, zeros e não-ASCII.
-- FT1/23 <> FT12/3; AB-12 <> AB1-2. Sinal amplo nunca entra no índice.
-- Aprovação desta política/compatibilidade e preflight são pré-condições de aplicação.
-- Chaves NULL/vazias após trim ficam fora (documento incompleto não identifica fatura).
-- Pré-condição: levantamento de conflitos repetido com escritores parados; resolver manualmente,
-- sem DELETE/merge/backfill automático. Manter o índice canónico exato existente.
-- CREATE CONCURRENTLY fora de transação; controlar indisvalid/indisready após conclusão.
CREATE UNIQUE INDEX CONCURRENTLY uq_standalone_invoice_normalized_333
ON public.standalone_invoices (
 company_id,
 (translate(btrim(supplier_nif,' '),'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ') COLLATE "C"),
 (translate(btrim(invoice_number,' '),'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ') COLLATE "C")
)
WHERE nullif(btrim(supplier_nif,' '),'') IS NOT NULL
 AND nullif(btrim(invoice_number,' '),'') IS NOT NULL;
-- Rollback separado, também só com autorização: DROP INDEX CONCURRENTLY public.uq_standalone_invoice_normalized_333;
-- Falha de criação pode deixar índice inválido: inspecionar catálogo, remover só este índice
-- inválido com autorização e repetir levantamento; nunca apagar dados para fazer o índice caber.