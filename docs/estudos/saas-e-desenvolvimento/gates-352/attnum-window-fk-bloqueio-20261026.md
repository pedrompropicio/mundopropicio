# #352 — conflito de ordenação attnum_window / FK

26/10/2026. Parecer 6427891820. Estado: ciclo interrompido antes de alterar o plano e antes de novo G1/G2; reserva mantida.

## Par novo: entrada 269 resolvida

GitHub main = Lovable = 07819ed41a71f42cad175a9a89b4ed8bffc771c2, agentFinished=true na verificação. Live por SELECT em 2026-10-26 21:42:16.18709 UTC: 711 versões Supabase e 269 Drizzle. A entrada 269 corresponde exactamente a drizzle/migrations/0267_issue314_fase2b_birth_date_only.sql, SHA-256 125b43ce4c8e74af4ad556ecec6c5f5ea19274561d6becd2c3bdc60687eb0b77. O ficheiro foi publicado quando o agente terminou; não corresponde ao ficheiro supabase/migrations/20261026213000_iva_repasse_mp_transfers.sql. Não foi substituída uma origem pela outra. O novo par ainda não está incorporado num plano executado.

## Conflito a decidir antes da reconstrução

Catálogo confirmado por SELECT: financial_accounts.partner_id tem attnum 20 e tipo uuid nullable; mirror_partner_aporte tem attnum 21, boolean NOT NULL DEFAULT false; advance_retention_pct tem attnum 22, numeric nullable. Todos os tipos são base, não enum/domínio. A pesquisa do ledger por ALTER TABLE/ADD COLUMN encontrou zero definições destas três colunas.

Pela redacção literal de attnum_window, as três colunas entram imediatamente antes de 20260909194629, que acrescenta initial_balance_date (attnum 23). O limite inferior é 20260830193950, is_accounting (attnum 19).

Porém, financial_accounts_partner_id_fkey tem oid 208094 e refere event_partners(id). O objecto seguinte usado como limite na regra de OID, partner_aporte_mirror (oid 208099), já tem effective_at 2026-09-07T16:03:01Z no plano aprovado e prova anterior no manifesto. Aplicar a janela de OID da FK coloca-a antes dessa tabela e, portanto, antes da coluna colocada imediatamente antes da versão de 09/09. A FK exige que partner_id já exista.

Isto é uma incompatibilidade entre a posição imediatamente anterior ao limite de attnum e a janela independente da FK; não foi observado como erro num novo run. Nenhum erro de execução foi inventado.

Proposta para parecer: usar a intersecção das janelas de attnum e das dependências construtivas (incluindo FK), colocando a coluna antes da FK dentro do intervalo aprovado; ou indicar expressamente outra precedência. Não foi aplicada esta extensão por iniciativa do executor.

Proveniência do limite já aprovado: reconstructed/manifest.json, entrada oid 208099, parecer 6413327729; prova privada reconstructed/partner-aporte-proof.json. Não houve nova leitura de linhas da aplicação.

## Estado dos passos

Entrada Drizzle nova resolvida por hash. attnum_window bloqueada pela ordenação da FK. Reteste dos cinco manuais, reconstruções cash_watch/offset_balance e constraint, N8, pin pgmq 1.5.1, novo G1 e novo G2 não executados neste ciclo. O resultado anterior não foi apresentado como resultado novo. Reserva mantida; QUADRO e estado não alterados.

Evidência local exclusivamente de catálogo/ledgers autorizados, SHA-256: 4c988180ab6646113778a66a29d06ff96d8f95976892abf7a0c27fd665938fd7.
