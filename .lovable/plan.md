# Carreira — origens Spotify e comparação diária (25/10/2026)

## Provas já recolhidas
- `s4a-daily-sync` em dry_run para Litto: HTTP 200, D=23/10/2026, sem gravação de métricas; mantém o registo técnico de corrida existente.
- No endpoint atual de top-playlists, os testes `1day` e `7day` deram HTTP 200 e 100 linhas cada. Forma: `{data:[{uri,author,streams,title,dateAdded,thumbnailUrl,isAlgorithmic,isAlgotorial}],playlistOverall}`. Strings nos campos textuais/streams/playlistOverall; booleanos nos dois indicadores. Rádio: 36.634 em 1day, 152.489 em 7day e 274.939 em 28day. Não confundir essas janelas.
- Stats atual não contém categorias de origem. Não foi encontrado um endpoint de origens comprovado; não inventar caminho nem campos.
- UGC: 18/10=6.350, 19/10=5.746, ambos 29/29 sons e o mesmo ator. A maior contribuição é a queda de 5.377 para 4.851 no som principal (−526). Prova de menor contagem devolvida, não prova de vídeos removidos nem de mudança da versão do ator.
- Baseline Vitest: 2.464 PASS, 6 skip, 11 todo. Não foi executado tsgo manual; validação automática será conferida.
- A Visão comparativa pertence ao projeto Gestão Artística, não a este frontend. Foi localizado apenas um snapshot de leitura: não pode ser alterado daqui.

## Implementação autorizada neste projeto
1. Acrescentar ao dry_run do `s4a-daily-sync` as formas das respostas de top-playlists 1day/7day; reutilizar parser/identidade/limites existentes. Guardar 1day com period_days=1 nas próximas corridas reais, D=latest-date, sem backfill. Manter 28day e seus contratos. Não gravar 7day sem requisito.
2. Extrair helpers sem efeitos para normalização das playlists, derivação diária e deteção de quedas UGC; testes sintéticos com lançamento, lacunas, dependência D−28, duplicados, ausência versus zero e mudança de sons/fontes. Derivação nunca recebe uma semente inventada. Como 1day existe, a vista estimada não é necessária para a captura futura; o histórico sem base demonstrável fica nulo.
3. Preparar a extensão aditiva da comparação diária em `artist_ads_compare`, preservando autenticação, país, fuso, moeda, corte de captura e resultados atuais. Campos por música/data: total Spotify, Radio/percentagem, outras Spotify, ouvintes, resto somente com componentes conhecidos, categorias quando existirem; UGC total/delta/sons/alerta/cobertura. Custos por plataforma e moeda com numerador/denominador correspondentes. SQL pelo canal oficial, sem editar RPCs de saúde nem alargar permissões.
4. Origem das reproduções: continuar a descoberta apenas com caminho comprovado por pedido real do S4A. A gravação mantém-se desligada; parser/métricas apenas após forma real. Se não houver prova acessível, declarar este ponto bloqueado, sem um parser fictício que aparente implementação.
5. Entregar valores disponíveis de 10/10 a D com fonte/período e nulos explícitos; não retroatribuir a leitura 1day atual aos dias anteriores. Guardar apenas formas e agregados necessários, nunca tokens ou payloads pessoais.

## Frontend e limites
- Não copiar o frontend Gestão Artística para o ERP, nem criar uma segunda Visão comparativa. As colunas e o card de custo por plataforma precisam de implementação no projeto proprietário; daqui só é possível preparar o contrato e indicar os ficheiros de integração encontrados.
- Sem Publish, alteração ao smart link, consentimento, crons ou reenvio histórico. A flag de origens não é ativada.
- Reverter código não desfaz métricas captadas entretanto; qualquer recuperação de dados exige autorização própria.

## Ficheiros e validações
- `supabase/functions/s4a-daily-sync/index.ts`, novo helper `_shared/s4a-play-origins.ts`, testes em `src/test/`, migração aditiva da comparação se necessária, documentação de carreira/S4A e regra arquitetural em `AGENTS.md`.
- Vitest focado e suite antes/depois; verificação automática de tipos/build, Deno check se disponível; CI do SHA só se efetivamente consultável. Deploy exclusivamente das funções alteradas e dry_run Litto; prova OPTIONS/auth recusada, sem disparar captura real.
- Limitações pendentes: endpoint real das categorias de origem e escrita no projeto Gestão Artística. Não declarar toda a entrega concluída enquanto estes pontos estiverem por resolver.

<!-- Plano anterior #358 preservado abaixo apenas como histórico; já implementado, fora deste âmbito. -->

# #358 — Correspondência segura na captura diária Ticketline (plano final R2, passo único)

## Factos confirmados no código
- `runCaptureDay` (fetch-ticketline-reports/index.ts ~1432–1629) avalia todos os configs `enabled=true` da company (#184). Casa cada linha por código (igualdade exata, tirando apenas os espaços). Quando não há código, casa por segmentos do nome com `includes` nos dois sentidos. Qualquer alvo sem linha é gravado a 0/0.
- O estado da corrida é a própria string de fase (`fail(phase)` grava `status = phase`). Não existe hoje nenhuma fase `capture_day_unmatched_config`; essa referência do plano anterior estava errada.
- Saúde: as views/RPCs das migrações tratam como problema qualquer `status not in ('success','warning','skipped')`. A frescura da captura diária usa `triggered_by like 'capture_day:%' and status = 'success'`. Uma fase de falha nova é, portanto, apanhada pela saúde genérica sem mudar contratos. O UI marca as falhas pelo badge com o próprio status.

## Regras (todas avaliadas antes de qualquer UPSERT)
- Comparação de códigos: igual à atual (retirar espaços, sem reordenar, separadores mantidos).
- Nome completo seguro: normKey(label sem `[...]` e sem sufixo `|`) é igual a normKey(nome completo do evento), ou começa por ele seguido de espaço (labels longos). Um nome de evento com menos de 2 tokens não pode casar por nome.
- Candidata suspeita: linha não atribuída que contém um token de cidade ou de artista de um alvo, sem ser nome completo seguro dele.
- Consumidor da série: `daily_fallback_active = true` ou `promotores_migrated_at` preenchido. As duas colunas entram no SELECT dos alvos **só** para classificar a gravidade. Nenhum alvo deixa de ser avaliado ou captado.

Por linha:
1. Código conhecido em exatamente 1 alvo: atribui (tem prioridade). Código igual em 2 ou mais alvos: aborta `capture_day_ambiguous_match`.
2. Código desconhecido: nunca é atribuído por nome. Se o nome seguro identificar um alvo (com ou sem código), aborta `capture_day_code_conflict`. Se não identificar, é evento externo: ignora e audita.
3. Sem código: só casa com alvo sem código, por nome seguro. Se servir a 2 ou mais alvos, aborta ambígua. Se não servir a nenhum mas for suspeita, aborta `capture_day_suspect_match`. Se não, é externa: ignora e audita.
4. Mais de uma linha para o mesmo alvo: aborta `capture_day_ambiguous_match`.

Por alvo sem linha:
5. Com código: 0/0, desde que o relatório seja válido (período, TOTAL, qty) e não haja conflito nem suspeita pendente.
6. Sem código e não consumidor: fica fora do payload e o espelho existente é preservado. É auditado como `not_identifiable_no_movement`. Nunca se grava zero inferido.
7. Sem código e consumidor: aborta `capture_day_unmatched_consumer` antes do UPSERT, porque afeta uma fonte de leitura ativa.

Resultado:
- Qualquer aborto não grava nada. A fase fica no `status`, detalhe em `error_message` e `import_audit`.
- Sem aborto: um UPSERT com os alvos atribuídos mais os zeros do ponto 5. `status = 'success'` (mantém a frescura), com `import_audit.coverage = 'coded_and_matched'` e as contagens `matched`, `zeroed`, `omitted`, `external`, mais a lista `skippedConfigs` com a razão de cada um.
- Quando `omitted > 0`, `error_message` recebe um aviso curto com a contagem. A resposta HTTP inclui os mesmos campos. Não se cria nenhum estado novo.

## Implementação (um único passo R2, após "Sim" específico)
- Novo `supabase/functions/_shared/ticketline-capture-mapping.ts`: função pura `resolveCaptureMapping(rows, targets, nameById)` que devolve `{ abort?: {phase, message}, payload, decisions, externalRows, skippedConfigs, counts }`.
- `fetch-ticketline-reports/index.ts`: acrescentar as 2 colunas ao SELECT dos alvos. Substituir os blocos 5–6 pela função pura e montar run/resposta como acima. Extrair o núcleo pós-parse para `applyCaptureDay(admin, ctx, parsed)`, que se pode testar com um `admin` simulado. Subir `VERSION`. Nada mais muda.
- Novo `src/test/ticketline-capture-mapping.test.ts` (Vitest): função pura mais `applyCaptureDay`, com um `admin` simulado que regista `.upsert` e `updateRun`.

## Testes (fixtures sintéticas, nomes e códigos fictícios)
- **Obrigatório, forma da corrida recente:** 8 alvos com código e 5 sem código, não consumidores. O relatório tem 1 linha com código conhecido. Resultado esperado: `success`, 1 UPSERT com 8 linhas (1 real + 7 zeros), as 5 omitidas com `not_identifiable_no_movement`, histórico simulado das 5 intacto e `coverage`/contagens certas.
- **Obrigatório:** alvo sem código e consumidor sem linha → `capture_day_unmatched_consumer`, 0 chamadas a upsert.
- Código igual em 2 alvos; 2 linhas para 1 alvo; código desconhecido com nome seguro de alvo (com e sem código); linha só com a cidade ou só com o artista. Em todos: aborto, 0 upserts, fase gravada.
- Códigos `900001/900002` vs `900002/900001` não casam.
- Código desconhecido externo é ignorado e a linha conta para o TOTAL.
- Label longo `Artista X - Cidade A | 25/10 21h` casa; `Artista X - Cidade AB` não casa.
- Regressão RG/Deive fictícia na mesma cidade: nunca atribui ao Deive e nunca grava zero a um alvo sem código.

## Validações
- Vitest do ficheiro + suite completa, `tsgo`, `deno check` da função, CI do SHA.
- Prova só de leitura antes do deploy: aplicar a função pura ao `import_audit.reportRows` e aos alvos da última corrida com sucesso (SELECT). O resultado esperado é o mesmo do teste obrigatório. Reportam-se apenas contagens e decisões, sem labels nem valores Live em docs ou fixtures.

## R2 e limites
- O autodeploy está confirmado, por isso editar a fonte já é R2. O código, os testes e o deploy **só de `fetch-ticketline-reports`** fazem-se num só passo.
- Depois do deploy, verificar OPTIONS e um pedido sem autorização, sem invocar a captura. A prova funcional é a próxima captura do cron existente, lida por SELECT.
- Sem DML, DDL, crons, captura manual nem Publish. O D+1 de 24/10 fica separado. Exigir códigos em todos os configs fica fora deste âmbito.

## Rollback
- Repor o bloco anterior e reimplantar só esta função.
- Reverter o código não reverte as linhas que as capturas entretanto gravem. Preservar `ticketline_sync_runs.import_audit` como trilho. Qualquer correção em `ticketline_daily_sales` exige R2 de dados com autorização própria.
- Abortos não gravam nada; a série do dia fica intacta até decisão humana.
