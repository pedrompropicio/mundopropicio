# #358 — Correspondência segura na captura diária Ticketline (plano R2, passo único)

## Ponto de partida (código atual, runCaptureDay ~1432–1629)
- Linha→config por código (igualdade exata depois de retirar espaços) e, se não houver, por nome com segmentos isolados (cidade/artista) e `includes` nos dois sentidos.
- Linhas sem correspondência são ignoradas sem aviso; todo o config sem linha é gravado a 0/0. Isto dá falsos zeros e atribuições pela cidade.
- Não há testes desta lógica.

## Regras (todas avaliadas antes de qualquer UPSERT; nada é gravado em parte)
Definições: `codes(x)` = valor retirando só os espaços; os separadores mantêm-se e a comparação é exata (como hoje). `fullKey(evento)` = normKey do nome completo do evento no ERP (se for vazio ou tiver só um token, o evento não pode ser casado por nome). `labelKey(linha)` = normKey do label sem `[...]` e sem o sufixo depois de `|`. **Nome completo seguro**: labelKey === fullKey, ou labelKey começa por fullKey seguido de espaço (é o caso dos labels longos). **Candidata fraca**: linha não atribuída cuja labelKey contém um token de cidade ou de artista de um alvo, sem ser nome completo seguro.

1. **Código conhecido único** (codes(linha) igual a codes de exatamente 1 alvo): atribui a esse alvo e tem prioridade. Se for igual em 2 ou mais alvos → falha `capture_day_ambiguous_match`.
2. **Código desconhecido** (a linha tem código, mas nenhum alvo o tem): não se atribui por nome. Se um nome completo seguro identificar um alvo, com ou sem código → falha `capture_day_code_conflict`. Se não, é um evento externo legítimo: fica ignorado e auditado.
3. **Linha sem código**: só casa com alvos sem código, e só por nome completo seguro. Se servir a 2 ou mais alvos → falha ambígua. Se não servir a nenhum mas for candidata fraca de algum alvo → falha `capture_day_suspect_match`. Se não, é externa: ignorada e auditada.
4. **Duplicados**: 2 ou mais linhas para o mesmo alvo → falha `capture_day_ambiguous_match`.
5. **Zeros**:
   - Alvo com código e sem linha → 0/0 só quando o relatório é válido (período confirmado, TOTAL = soma de todas as linhas, limite de qty) e nenhuma linha não atribuída é candidata fraca ou tem nome seguro desse alvo. Caso contrário, falha suspeita.
   - Alvo sem código e sem linha → nunca há zero presumido. Não entra no payload, a linha existente desse dia fica intacta, e o alvo é auditado em `omittedConfigs`.
6. **Como se comunicam as omissões**: se houver ≥1 alvo omitido, a corrida fecha com o estado de falha existente `capture_day_unmatched_config` e **nada é gravado** (nenhum success enganoso, nenhum estado novo de saúde). Assim a regra de "sem escrita parcial" vale para tudo e a omissão aparece onde as falhas já aparecem hoje. Com zero omissões e zero falhas → UPSERT de todos os alvos → `success`.
7. Ficam iguais: escopo enabled+company, login, confirmação do período, validação do TOTAL e da qty, `onConflict event_id,sale_date`, forma da resposta. Em `import_audit`/`debug` só se acrescentam `decisions`, `externalRows`, `omittedConfigs`.

Efeito no cenário que deu origem à #358: o config sem código que casava com RG e com Deive pela cidade passa a ser nome seguro ou falha clara. Nunca é atribuído ao Deive e nunca fica a zero.

## Implementação (um único passo R2)
- Novo `supabase/functions/_shared/ticketline-capture-mapping.ts`, com a função pura `resolveCaptureMapping(rows, targets, nameById)` → `{ ok, phase?, message?, payload, decisions, externalRows, omittedConfigs }`.
- `fetch-ticketline-reports/index.ts`: os blocos 5–6 passam a usar a função pura. O UPSERT só corre quando `ok` e sem omissões. `VERSION` sobe uma versão. Nada mais muda.
- Novo `src/test/ticketline-capture-mapping.test.ts` (Vitest) e um teste de integração do caminho de escrita: um `admin` simulado regista as chamadas `.upsert` e `updateRun`, e o runner é extraído para receber o fetch/parse injetado.

## Testes (fixtures sintéticas, nomes e códigos fictícios, sem dados Live)
Cada caso de falha confirma **zero chamadas a upsert** e o estado de falha gravado na corrida. Cada sucesso confirma o payload exato.
- Código único → atribuído; código em 2 alvos → falha, 0 escritas.
- Códigos `"900001/900002"` vs `"900002/900001"` → não casam (comparação exata mantida).
- Código desconhecido de evento externo → ignorado; os restantes gravam; TOTAL inclui a linha externa.
- Código desconhecido com nome seguro de um alvo (com código e sem código) → falha conflito, 0 escritas.
- Dois artistas na mesma cidade, alvos sem código → cada um pelo nome completo; uma linha só com a cidade → falha suspeita, 0 escritas.
- Label longo "Artista X - Cidade A | 25/10 21h" → atribuído; "Artista X - Cidade AB" → não casa por prefixo.
- 2 linhas para o mesmo alvo → falha, 0 escritas.
- Alvo com código e sem linha, relatório válido → 0/0 gravado; o mesmo caso com uma candidata fraca por mapear → falha, 0 escritas.
- Alvo sem código e sem linha → `capture_day_unmatched_config`, 0 escritas, linha existente intacta.
- Regressão #358: cenário RG/Deive fictício com a mesma cidade → nunca atribui ao Deive e nunca grava zero.

## Validações antes do deploy
- `bunx vitest run` desse ficheiro + suite completa; `tsgo`; `deno check` da função; CI do SHA reportado ao controller.
- Prova só de leitura: aplicar a função pura ao `import_audit.reportRows` das últimas corridas com sucesso (SELECT). Reportam-se só contagens e decisões; não se copiam labels nem valores para docs ou fixtures.

## R2 e limites
- O autodeploy está confirmado, por isso editar a fonte já é R2. Código, testes e deploy **só de `fetch-ticketline-reports`** acontecem num passo, depois de um "Sim" específico.
- Depois do deploy: OPTIONS e pedido sem autorização, sem invocar a captura. A prova funcional é a próxima captura automática do cron já existente, lida por SELECT (estado da corrida, decisões, linhas do dia).
- Sem DML, DDL, crons, captura manual nem Publish. O fecho D+1 de 24/10 continua separado.

## Rollback
- Repor o bloco anterior de `runCaptureDay` e reimplantar só esta função.
- Reverter o código não reverte as linhas que a primeira captura gravar. Preservam-se `ticketline_sync_runs.import_audit` (payload e decisões) como trilho. Qualquer correção de linhas em `ticketline_daily_sales` exige um R2 de dados com autorização própria.
- Uma falha bloqueante não grava nada: a série do dia fica como estava até haver uma decisão humana.
