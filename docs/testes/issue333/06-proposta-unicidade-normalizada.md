# #333 — proposta de unicidade global (NÃO aplicada)

## Definição e impacto

PROPOSTA REVISTA 17/10/2026: `supabase/manual/20261017_issue333_normalized_uniqueness.PROPOSTA.sql` adicionaria um segundo índice, preservando o exato. Igualdade por empresa + NIF + número com APENAS trim ASCII SPACE exterior e conversão ASCII a-z→A-Z. Collation C explícita. Todos os separadores internos, pontuação, prefixos, zeros e não-ASCII preservados. NULL/vazio após trim fora do índice. Política proposta para revisão, não aplicada nem decisão comercial fechada.

Exemplos: ` ft1/23 ` = `FT1/23`; `FT1/23` distinto de `FT12/3`; `AB-12` distinto de `AB1-2`; `FT01/23` distinto de `FT1/23`; `PT001` distinto de `001`, `PT01`, `PT 001` e `PT-001`. Tabs, NBSP e acentos não são colapsados. `FT1/23`/`FT12/3` e `AB-12`/`AB1-2` dão sinal amplo ambíguo, NUNCA bloqueio automático/reused. A normalização destrutiva anterior foi rejeitada como identidade.

Isto altera todos os INSERT/UPDATE de chaves, inclusive acesso direto futuro. Caixa ASCII e espaços exteriores equivalentes passariam a 23505. Número sem significado conhecido: preservar literalmente, não inferir formato de fornecedor. Compatibilidade preparada em `patches/issue333/compatibility.PENDENTE.patch`, não aplicada: definição partilhada banco/#333/scanner/ingestão/edição, mensagens seguras, reused só com identidade forte + metadados completos + bytes SHA256. Campos insuficientes/divergentes → 409. INSERT novo com campos opcionais continua permitido conforme legado; insuficiência não vira equivalência. EUR/USD/BRL/GBP legadas preservadas; #333 só EUR.

## Levantamento somente SELECT

Levantamento ANTERIOR, política ampla: 0 grupos e 32 chaves incompletas (prova05). NÃO é preflight da política forte atual. Nenhuma consulta Live nesta continuação. Catálogo ausente informado pela revisão do Pedro; não reconsultado. Antes de janela autorizada repetir SELECT agregado abaixo e revisão privada; nunca publicar linhas pessoais/documentos.

```sql
SELECT count(*) AS conflict_groups FROM (
 SELECT company_id,
 translate(btrim(supplier_nif,' '),'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ') COLLATE "C",
 translate(btrim(invoice_number,' '),'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ') COLLATE "C"
 FROM public.standalone_invoices
 WHERE nullif(btrim(supplier_nif,' '),'') IS NOT NULL
 AND nullif(btrim(invoice_number,' '),'') IS NOT NULL
 GROUP BY 1,2,3 HAVING count(*)>1
) x;
```

## Rollout seguro, pendente

1. Rever política forte (caixa ASCII/exterior trim) e patches/contratos; autorização futura de aplicação separada, coordenação com reserva operacional #323. Nada executado agora.
2. Compatibilidade PRIMEIRO: validar hashes base/prepared, aplicar patch em janela autorizada, testes e deploy/publicação especificamente autorizados. Confirmar clientes atualizados/sem sessões antigas antes do índice. Conservação de candidatos privados em erro/unknown; sem cron.
3. Preflight agregado imediato, catálogo/definição do índice exato e contagem de chaves incompletas, backups/restore aprovados. Qualquer conflito forte → parar/rever privadamente com Pedro; zero merge/delete/backfill. Sinal amplo separado sem bloquear distintas.
4. Com escritores coordenados, índice EXATO PROPOSTO CONCURRENTLY fora de transação, por mecanismo de aplicação autorizado; SQL manual fora de migrações autoaplicadas nesta etapa. Falha/cancelamento pode deixar índice inválido; verificar pg_index.indisvalid/indisready e pg_get_indexdef. Não usar IF NOT EXISTS para esconder índice inválido.
5. Validar grants/RLS/índice exato anteriores intactos, 23505 em INSERT/UPDATE e comportamento de todos os clientes. #333 permanece fechado até prova Cloud real, SQL/RPC próprios e auditoria/retoma revisados; índice sozinho NÃO autoriza ativação.
6. Falha/rollback: manter #333 fechado, conservar compatibilidade segura; inspecionar índice inválido e remover SOMENTE o índice proposto, com autorização (`DROP INDEX CONCURRENTLY public.uq_standalone_invoice_normalized_333`). Não apagar dados/anexos para fazê-lo caber. Retorno sem índice reinstaura janela equivalente — não ativar.

## Provas locais

36/36 PostgreSQL real descartável, pgcrypto, duas ligações: SQL proposta byte a byte CONCURRENTLY na própria tabela standalone_invoices compatível (não só tabela ilustrativa), #333 preparado×legado ambas ordens; legado×legado; INSERT×UPDATE; rollback; NULL/vazios/prefixos/zeros; ambíguas distintas; adapter ingest preparado + storage falso + 23505/unknown. Fonte core com política forte em `patches/issue333/core.PENDENTE.sql`; core anterior não foi aplicado/modificado em Live. 26/26 compatibilidade fake; 20/20 handler; 35 regressões (inclui13 UI); geral1334. Prova08 e outputs09. Cloud ACL/storage e corpos Live não provados.