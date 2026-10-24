# #358 — Correspondência segura na captura diária Ticketline (plano R2)

## Situação de partida (confirmada no código)
- `runCaptureDay` (fetch-ticketline-reports/index.ts, ~1432–1629) pega em todos os configs `enabled=true` da company, faz um único relatório do dia e liga linha→config:
  1. por código (`[106160/127631]` no label) quando o config tem `ticketline_report_codes`;
  2. senão, por nome — inclui apenas os segmentos do nome do evento ("RG - Braga" → "rg", "braga") com `includes` em ambos os sentidos.
- Problemas: o segmento de cidade sozinho apanha RG e Deive (ambiguidade que aborta o lote); a chave "rg" (≥3? não, mas "deive"/cidade sim) e o `includes` invertido permitem match por fragmento; linhas sem match são ignoradas em silêncio; qualquer config sem linha vai a **0/0** no UPSERT, sem distinguir "não vendeu" de "não consegui ligar".
- Não há testes para esta função; não há ficheiro `_shared` com a lógica de match.

## Comportamento proposto (regras exatas)
Separar a decisão numa função pura `resolveCaptureMapping(rows, targets, nameById)` que devolve `{ assignments, unmatchedRows, decisions, errors }`. O UPSERT só corre se `errors` estiver vazio.

1. **Linha com código conhecido** (códigos normalizados, como conjunto ordenado, iguais aos de exatamente 1 config): atribui a esse config. Igual a 2+ configs → erro `capture_day_ambiguous_match` (antes de qualquer escrita).
2. **Linha com código desconhecido** (não pertence a nenhum config): nunca cai para match por nome. Fica em `unmatchedRows` como "fora dos configs" — legítimo no relatório global; não aborta e não é atribuída. Exceção: se o nome completo da linha coincidir exatamente com um config **sem** códigos → erro `capture_day_code_unknown_for_named_config` (sinal de código em falta/errado; não adivinhar).
3. **Config sem código**: só aceita linha sem código ou desconhecida por **nome completo seguro**: chave normalizada do nome completo do evento (ex.: "rg braga") igual à do label sem `[..]` e sem sufixo `|...`, ou o label começa por essa chave seguida de separador. Proibido casar só pelo segmento da cidade ou de artista; proibido `k.includes(lk)`. Chave completa <2 tokens → não elegível para nome (config fica "sem regra segura").
4. **Label longo** (nome do evento + data/local/sessão): aceite apenas pela regra 3 (prefixo com nome completo + separador). Se dois configs tiverem prefixo compatível → ambiguidade, falha.
5. **Duplicados**: 2+ linhas para o mesmo config, ou 1 linha para 2+ configs → falha antes do UPSERT (mantém-se).
6. **Zero legítimo vs falha de correspondência** — antes de escrever 0/0 num config sem linha:
   - Config **com códigos** e sem linha → 0/0 legítimo (o relatório omite eventos sem movimento; o código é identificador forte).
   - Config **sem códigos** e sem linha → só 0/0 se nenhuma linha não atribuída for "candidata fraca" (partilha o token da cidade ou do artista). Se existir candidata fraca → **não escreve** esse config (fica sem linha para o dia, não a zero) e a corrida termina `partial_unmatched` com o detalhe na auditoria; os restantes configs seguros escrevem-se. Alternativa mais estrita (a decidir): abortar a corrida inteira nesse caso.
7. Mantidos sem alteração: escopo `enabled`+company, confirmação do período na sessão, validação TOTAL = soma das linhas (sobre todas as linhas, incluindo fora dos configs), limite de qty, `onConflict event_id,sale_date`, formato da resposta e de `import_audit` (só se acrescentam `decisions`, `unmatchedRows`, `skippedConfigs`).

## Ficheiros (R1)
- novo `supabase/functions/_shared/ticketline-capture-mapping.ts` — função pura acima (regra AGENTS: partilha só via `_shared/`).
- `supabase/functions/fetch-ticketline-reports/index.ts` — `runCaptureDay` passa a chamar a função pura; o bloco 5–6 é substituído; nada mais muda; `VERSION` incrementada.
- novo `src/test/ticketline-capture-mapping.test.ts` (Vitest, importa o `_shared`), e opcional `supabase/functions/_shared/ticketline-capture-mapping_test.ts` (Deno).

## Fixtures sintéticas mínimas (sem dados Live)
Nomes fictícios ("Artista X - Cidade A", "Artista Y - Cidade A", códigos `900001/900002`, valores pequenos):
- código conhecido único → atribuído; código em 2 configs → falha sem escrita.
- código desconhecido de evento alheio → ignorado, sem abortar, TOTAL continua a bater.
- duas linhas da mesma cidade, artistas diferentes, configs sem código → cada uma pelo nome completo; nunca pela cidade.
- label longo "Artista X - Cidade A | 25/10 21h" → atribuído pelo prefixo.
- config sem código + linha só "Cidade A" → candidata fraca → config não escrito, estado `partial_unmatched`.
- config com código e sem linha → 0/0 legítimo.
- duplicado (2 linhas para 1 config) → falha antes do UPSERT.
- regressão: cenário equivalente ao Braga sem código (RG/Deive) já não aborta nem atribui ao Deive.
- teste estático: o ficheiro `index.ts` não contém `k.includes(lk)` e chama `resolveCaptureMapping` antes de `.upsert(`.

## Validações
- `bunx vitest run src/test/ticketline-capture-mapping.test.ts` + suite completa; `tsgo`; `deno check` da função; CI do SHA reportado ao controller.
- Prova pré-deploy por leitura: aplicar a função pura (localmente) a `import_audit.reportRows` das últimas corridas de sucesso via SELECT, só contagens/decisões no relatório (sem labels/valores Live copiados para docs).

## Separação R1 / R2 e efeitos Live
- Neste ambiente, alterações em `supabase/functions/**` são implantadas automaticamente ao fim da mensagem; não consigo garantir ausência de efeito Live. Logo **a edição da edge function é R2**: só com o "Sim" a este plano.
- Passo A (pode ser R1): criar só `_shared/ticketline-capture-mapping.ts` + testes, sem tocar em `index.ts`. Nota: ficheiro novo em `_shared` não altera o comportamento de nenhuma função até ser importado, mas a reimplantação pode mesmo assim acontecer — confirmar com o Pedro se o trata como R1.
- Passo B (R2): ligar em `index.ts` e implantar só `fetch-ticketline-reports`; verificar OPTIONS/403 sem invocar captura; a primeira captura automática seguinte (cron existente) serve de prova, lida por SELECT.
- Sem DML, DDL, cron, captura manual nem Publish em nenhum passo. D+1 de 24/10 continua pendente e separado.

## Rollback
- Repor o bloco anterior de `runCaptureDay` (commit anterior ao passo B) e reimplantar só a função; dados não são alterados pela mudança (não há backfill), por isso não há rollback de dados.
- Se o passo B produzir `partial_unmatched` inesperado, nada fica a zero indevidamente; recuperar por decisão humana (código no config) em R2 próprio.

## Decisões em aberto para o Pedro
1. Regra 6: config sem código com candidata fraca → (a) saltar só esse config e marcar `partial_unmatched` [recomendado] ou (b) abortar a corrida inteira.
2. Passo A como R1 isolado [recomendado] ou tudo junto em R2.
3. Exigir códigos em todos os configs ativos no futuro (eliminaria o match por nome) — fora deste âmbito, R2 de dados separado.
