# Verificação local — candidato D1-C2 da #486

Preparação parcial em 02/11/2026. Nenhum SQL novo foi executado, incluindo instalação, fixtures, pre/post, concorrência e rollback. Não existe prova de compilação PostgreSQL, catálogo instalado ou execução financeira neste relatório.

## Proveniência e âmbito

Checkout inicial limpo: `15d8203743f01549108f511fa4da604bf36fce19`. Plano D1-P/#496 presente. Arquivo offline version=2, commit #502 `df68d4ae5e4c2b467453655185436ffaf1ac7dc3`, 22 caminhos e SHA256 de todos os blobs conferidos antes de recuperar somente esses caminhos. SHA256 do arquivo XZ/Base85: `2b8d0d0491fed0bc2f63da29959d18df9e59e811b66ed39aef6fb674b8a3b75d`. Contexto histórico lido como fonte pública, sem restaurar os 17 caminhos históricos. #492/#502 não foram integradas.

Quality41530270627 verde/#502 inalterada são informação do despacho. A reconfirmação de main/quality, validade, comentários/jobs, fila e reserva única cabe ao coordenador antes de lançar. Sem consulta remota, commit/push/merge/fecho de Issue ou edição de reservas. Runner recolhe o diff; merge automático deve permanecer desligado.

Foram lidos INDEX/QUADRO, estados Tráfego Pago/Vínculo BP↔Transações, AGENTS raiz/supabase, PROC-despacho-executor/promocao/entrada-de-dados, plano integrado e memórias ads-invoices/bp-planilha/bp-excesso-de-verba. Fontes operacionais reais, fornecedores/NIFs/contas e catálogo fiel não foram consultados nem presumidos. Histórico/#475/#457 e #413/#404 conservados.

## Bytes e conferência estática

- Migração/cópia: 155853 bytes, SHA256 `08e2582fce027b0bd8ccd6882cbd4f4e6cc3ef1712775088e453c38c21e0605e`, byte-idênticas.
- Rollback comentado: 14258 bytes, SHA256 `c4395a476f89d5e77448f82b6e2948804ee7d9c79417d016dda86ecdf74f8595`.
- Function-identities: 35 identidades, md5 do conteúdo literal entre delimitadores (prosrc esperado), SHA256 do CREATE literal incluindo ponto e vírgula, retorno, owner esperado, linguagem, volatility, SECURITY DEFINER, proconfig e grants esperados.
- Instalação, pós-verificação e rollback usam a mesma tabela de identidades; os valores de proconfig incluem também SET sem espaços em torno de `=`, anteriormente omitidos no candidato.
- Pré-imagens das três funções legadas são conferidas na instalação e no preflight; rollback exige manifesto integral correspondente e ausência de qualquer dado/contexto/atividade v1 antes dos DROPs RESTRICT.
- A conferência final encontrou exatamente os 27 caminhos autorizados.
- A conferência local de aspas/comentários/delimitadores passou e é somente textual; não equivale a parser SQL, pg_get_functiondef, compilação ou execução de ACL.

As identidades foram derivadas por leitura dos bytes, sem abrir PostgreSQL. O operador autorizado terá de comparar prosrc/proconfig/owner/ACL efetiva e catálogo real com pre/post. Ausência de dependência/tipo/controle é falha do ensaio, sem stub/skip. O manifesto não certifica ausência de consumidores dinâmicos nem adulteração coordenada pelo owner.

## Critério → ficheiro/assert preparado

Todos os itens desta tabela são roteiros **não executados**, com asserts sobre comandos reais e sem dependências simuladas para substituir o comportamento candidato.

| Prova | Cobertura preparada | Ficheiros / asserts identificáveis |
|---|---|---|
| P1 destinos | Taxa positiva; negativo explícito/integral e proporcional; company incluído/outside; base zero; Master e duas parcelas adotadas; split humano; carreira TikTok vinculada à conta atestada, empresa/música/artista | sintetico-destinos.sql: positive_fee_exact, explicit_negative_integral, zero_media_base_denied, two_adopted_city_purposes, human_split_keeps_all_parts, verified_career_company_costs, campaign_id_alone_does_not_select_account |
| P2 BP | Lote100/70/20+20, uma elevação10; linha/rubrica; mãe completa/parcial; duas finalidades na mesma rubrica; criação/aprovação separadas | sintetico-parcela.sql: 100_70_20_20; sintetico-financeiro.sql: one_raise_for_batch, complete_parent_counted_once, partial_parent_refused, same_category_separate_purposes; destinos: no_master_double_budget |
| P3 moeda/deny/tenant | Empresa BRL + PDF EUR + company; moeda de BP incompatível e metadados BP/compromisso; deny inclusive platform_admin; falta de papel de aprovação; retoma/documento/atestação de outro tenant recusados | sintetico-writers.sql: company_currency_in_hash, company_brl_blocked, currency_metadata_refused, bp_currency, deny_zero_write; financeiro: bp_approval_required; documental: bad_callbacks_zero_write |
| P4 auditoria | Baseline100 preservada no aumento110; auditoria de raise única; criação EUR com selos e baseline; snapshot canónico | sintetico-financeiro.sql: budget_baseline, single_canonical_raise_audit, approved_new_budget_with_baseline, canonical_snapshot_preserved |
| P5 identidade/hash/retry | Chaves estáveis/colisão entre faturas, observações vinculadas; duplicado exato/fornecedor/período/nulo/Avulsa/separadores; mudanças de BP, metadados, compromisso, evento, rubrica, fornecedor, conta, ator e permissões | financeiro: same_key_same_ids, different_key_same_cycle_same_ids, one_operation_after_cross_invoice_key, separators_not_collapsed; writers: hash_source_change; parcela: changed_source_invalidates_hash |
| P6 falhas integrais | Failpoints transacionais em criação, aprovação, raise, auditoria, mãe, filha, vínculo, operação/tarefas e applied; digests de Ads/financeiro/BP/documentos/auditorias/versões/contexto | sintetico-financeiro.sql: atomic_rollback_* e atomic_create_bp/atomic_approve_bp; fixture.sql: ads486_digest/ads486_expect invoker com erro exato e zero alteração |
| P7 documentos/manutenção | Original/filha, digest, tenant, vínculo, retry documental; list/ack/error/retry/recibos/ordem e cleanup após reversão; callback posterior recusa | sintetico-documentos.sql: same_document_on_retry, all_tasks_required, ack_exact_retry, explicit_retry_advances_attempt, outbox_drained, revert_task_bound; concorrencia-legado-a/b.sql com callback_race/revert_first |
| P8 import/reopen/revert | Reimport idêntico/1:1/material/applied; atestação válida/sem identidade/repetição/nova revisão; reopen conserva plano e tarefas; reversão idempotente e sete impedimentos isolados | parcela: attestation_exact_retry, source_change_unlocks_old_confirmation; financeiro: applied_identical_import_noop; reversao: blocked_reversal_atomic_*, idempotent_revert, retry_never_regenerates_reverted |
| P9 sessões | CAS mesma fatura; duas faturas/mesma linha com commit/rollback; moeda entre confirmação/geração; operação/preview sem bloquear writer de empresa B; callback×revert nas duas ordens/commit/rollback; writer legado tardio; v1 fechado por RPC em teste sequencial | concorrencia.md e seis sessões SQL; financeira: concurrent_brl_must_refuse, rollback_currency_keeps_eur_generation, reads_only_access_share; legado: committed_revert_refuses_callback; writers: recusas feature_disabled para todas as RPCs mutantes |

## Lacunas de preparação e gates de promoção

A aceitação 2 (todos os cenários P1–P9) continua **parcial**. O conjunto adicional acima não preenche os casos abaixo e não os marca como skip/TODO/sucesso:

- P2/P3/P5: falta completar a enumeração de todas as identidades/fontes e combinações de metadados/moedas/âncoras/falhas transitivas, incluindo clones de identidade com total igual e aceites múltiplos por efeito numa operação com vários efeitos.
- P8: faltam fixtures fiéis isoladas de transaction_payments, settlement_id, card_session_id e fecho selado/histórico, além de reimport com identidades repetidas/ambíguas e perda de outside. As guardas continuam no candidato; não há prova sintética preparada completa desses ramos.
- P9: faltam scripts de mesma rubrica/BPs distintos, criação concorrente, escritor de compromisso já dentro do UPDATE/DELETE, mãe v0 já escrita, todos os commit/rollback de vencedores/ações e não interferência independente com controlo fechado. Os scripts legados originais pausam antes da primeira escrita; não provam esses ramos.
- Nenhum ensaio PostgreSQL foi autorizado/executado. Compilação, catálogo/ACL/triggers/dependências reais, sobreposição/PIDs, prazos, contenção entre empresas, equivalência de adoções e rollback continuam sem prova. O cerco financeiro global em generate/revert é limitação material explícita.
- D2/D3 continuam separados: tipos/adaptadores/textos/testes juntos, modal, bytes/Storage/PDF, consumidor idempotente da manutenção, deploy coordenado e drenagem dos handlers/efeitos externos legados. Não há callback/worker pressuposto pelo SQL.
- NIF/ID/conta/fonte reais e a disponibilidade desses dados são gates de promoção, sem nomes/IDs operacionais fabricados. Revisão operacional/fiscal do fornecedor e compatibilidade de pagamentos/fechos são obrigatórias antes de ativar.
- Rollback-ensaio.md mantém roteiro de instalação/reversão/preimagem, dados v1 e divergências de catálogo; nenhuma dessas variantes foi ensaiada. Dados v1, inclusive operação reverted/tarefa/atestação, impedem rollback destrutivo.

Estas lacunas impedem declarar a preparação D1 L1–L6 completa. O candidato conserva enabled=false e está entregue para revisão parcial, sem autorização de instalação/promoção.

## Checks locais

`bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`: exit 0, sem erros.

`bunx vitest run`: exit 0; 345 ficheiros passaram, 2 ficheiros skipped; 3583 testes passaram, 6 skipped e 11 todo já existentes. Nenhuma expectativa/skip foi alterada. Estes checks validam o código/testes existentes do repositório; não executam nem certificam o SQL novo 0305 ou estes roteiros.

A repetição final de tsgo terminou com exit 0. A segunda corrida integral de Vitest (`bunx vitest run --reporter=dot`, início 22:31:43 UTC, duração 205,31s) terminou com exit 0 e os mesmos 3583 aprovados/6 skipped/11 todo. Não houve alteração do SQL candidato durante essa corrida.

A conferência final de caminhos/bytes/delimitadores e o resultado do último check estão também em `.executor/resumo.md`. CI do diff/PR e o HEAD remoto final não foram observados nesta execução offline. Não foram feitas instalações SQL, dados reais, chamadas MP/Live, segredos, envios externos, Publish/deploy, ativação, commit/push/merge ou fecho de Issue.
