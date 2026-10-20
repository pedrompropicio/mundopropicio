# #333 fase12g — correções do executor pedidas pelo controller (LOCAL, FECHADO no Cloud)

Base: main = Lovable 4dd202f3b254d8c352664d170cb50da993ef12b9; CI run39454108623 SUCCESS (controller). Sem Cloud DDL/DML, deploy, Publish, gates, modelo ou Gmail reais.

## Corrigido (só `20261020_issue333_assistant_executor.*` + 1 mensagem em `_shared/assistant-executor.ts`)
1. a2: antes de `confirm_ticket_office_statement`, lock do cabeçalho e linhas (FOR UPDATE) e comparação EXATA com os efeitos persistidos: empresa, bilheteira, estado draft, número, data, total; linhas como lista ordenada (posição, tipo, descrição, cêntimos, evento, sem vínculos). a1 usa a mesma comparação no readback.
2. Fail-closed: todas as validações passam a `IS DISTINCT FROM` / `condição IS NOT TRUE`; `count(*) FILTER (WHERE (ok) IS NOT TRUE)` em par TRF, pós-update e deduções (LEFT JOIN: dedução apagada conta como inválida). JSON dos efeitos validado por `_de333_cents` (inteiro, mínimo) e `_de333_req` (texto obrigatório). Vendas sem valor definido recusam (antes somavam 0). Contrato de ações e `blocked_reason` ausente recusam. a5 confere contas ativas da empresa no momento.
3. a5 "já liquidado" só se, por perna: status paid, paid_amount = valor, payment_date = data, exatamente 1 pagamento pago/valor/data/conta da perna/empresa/transferência/sem estorno. Crédito preexistente divergente → `liquidated_divergent` (recusa, nunca "conferido").
4. Link a3: mantém `/bilheteiras` — a rota não aceita abrir um fecho específico; não foi inventada.

## Prova PG17 (`pg/canon12f.sh` → `pg/canon12f.out.txt`, novos grupos 24b–24e; 1–30 continuam iguais)
- 24b a2: valores trocados (mesma contagem/soma), tipo, evento, descrição, linha extra 0 €, data, bilheteira, total NULL → `data_changed`; apuramento fica draft, 0 execuções; sem adulteração confirma. `amount` NULL na linha: impedido pela constraint real `tosl_amount_or_pending`.
- 24c JSON sem chaves (hash recalculado): a1 sem total / linha sem cêntimos, plano de fecho sem cada uma das 9 chaves, dedução sem cêntimos, net null, a5 sem valor/data/conta → `data_incomplete`, 0 apuramentos.
- 24d pernas: event_id/account_id NULL, exclude_from_result false, moeda BRL → `data_changed`; bilheteira/conta destino inativas → `context_mismatch`. company_id, amount, currency, exclude_from_result, status, paid_amount, iva_rate, payment_method NULL: impossíveis (NOT NULL reais). Controlo sem adulteração liquida (em ROLLBACK).
- 24e já creditado: evidência 17/10 vs crédito 16/10, pagamento noutra data/conta/sem conta/estornado/duplicado → `liquidated_divergent`; controlo exato → conferido, 0 escritas.
Testes Vitest 12f/12e/12: 31/31; Deno check data-entry limpo.

## Limitações (inalteradas)
Snapshot de funções/triggers, não aplicação integral das migrações; RLS não replicada. Locks de linhas não bloqueiam INSERT concorrente de nova linha por outro caminho se não houver FK; a comparação completa recusa na mesma, mas só detecta o que existe no momento do lock.

## SHA-256 dos SQL INERTES
```
b071c52d689740b17a9d3f4072ff6576e19bc3ba69c3f94f70623c20e650a4d0  20261020_issue333_assistant_review.INERTE.sql
5e0f389aac65091f6ac954e300c63bf1c1b350212135687a13e728568a1e8d8f  20261020_issue333_assistant_review.ROLLBACK-INERTE.sql
157df181fc5503ae8a19d62a34c70fe360a0de527c5390718db9afbe68fea061  20261020_issue333_assistant_review.readback.SELECT.sql
9f38ca4a2798eb8a2fa7c4362d52b6fd09fe88ba570520cad6d30c09b953ac37  20261020_issue333_assistant_executor.INERTE.sql
fc62244dbbd849e5767be74be2a9c7717377de84ad828168029171bd4db731ee  20261020_issue333_assistant_executor.ROLLBACK-INERTE.sql
0d0fdde0c615e189ed32698d7427bc7acdaf55adb7f4ebcdaed09cecc48fe6fc  20261020_issue333_assistant_executor.readback.SELECT.sql
```
Pacote de ativação: igual ao de `fase12f-fecho-liquidacao.md` com estes hashes. Nada ativado.
