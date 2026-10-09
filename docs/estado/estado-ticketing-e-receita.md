# ESTADO — Ticketing & Receita

Atualizado: 2026-10-08 · Issues: `agora` #283 (parte 5), #267, #271 · `a-seguir` #206 · `depois` #73, #78 · `bloqueada` #211 (transversal, plataforma-e-infra)

## Em vigor

- **Vigia ticketline-crosscheck (D-ERP152).** Corrida diária 06:50 UTC (cron `ticketline-crosscheck-daily`, jobid 1640), tabela `ticketline_crosscheck_runs`, alerta como condição **(e)** de `check_ticketing_sync_health()`. Limiar revisto a 02/10: alerta com **pelo menos 3 bilhetes E pelo menos 1% da quantidade do portal**, em duas leituras diárias seguidas; o valor em euros deixou de ser gatilho e é só informação; evento não encontrado no portal alerta logo à primeira leitura. Motivo da revisão: com o limiar absoluto de 100 €, o SM Porto alertava com 2 bilhetes de diferença em 4.921 (0,04%).
- **Série diária do BOL.** A validação deixou de depender só da linha TOTAL do Mapa Diário: passa a aceitar também a validação pelo total do M2 da mesma corrida (soma dos dias = M2 em quantidade e valor ao cêntimo; `validated_by = m2_total` + aviso) e recusa quando nenhum dos dois bate. Quando falha, grava `daily_debug` no `import_audit` com a janela de tokens à volta de cada ocorrência de TOTAL. Alerta novo: condição **(f)** — 6 corridas seguidas com status ≠ `success` na mesma config (warning conta), anti-spam 12h.
- **Conferência portal de Produtores (D-ERP191/192).** Fonte = variação do occupation.xlsx; o PDF é só informativo; sinal **(g)** = "PDF parado com xlsx a mexer".
- **A vigia NÃO manda email nem WhatsApp (decisão do Pedro, 08/10).** O canal é o indicador no Dashboard: `TicketingDivergenceIndicator`, no bloco "Por bilheteira" do SalesPositionWidget, a ler `get_ticketing_divergences()`, isolado por `row_belongs_to_current_company`. Mostra só as condições (e) e (g), e distingue em texto problema nosso de problema do fornecedor. Provado por impersonação em Live a 08/10: utilizador do Michel (empresa activa Coala, não platform_admin) vê 0 divergências; o Pedro vê 2.
- **Lembrete `ticketing_sync_stalled` desactivado a 08/10 14:32** — o cron `system-reminders-daily` (07:30) envia WhatsApp para um número único sem filtro de empresa.

## A trabalhar agora

- **#283 parte 5 — auditoria multiempresa às edge functions.** 29 das 54 edge functions com service_role e ids vindos do cliente, por ler à mão. Prioridade: `sync-coala-from-drive`, `crm-google-ads-sync`, `crm-meta-publish-*`, `crm-meta-create-*`, `crm-google-*`. Também `probe-ticketline-produtores`, publicada e com a guarda por confirmar.
- **#267 — Mapa de Ocupação (PDF) da Ticketline parado.** O PDF do portal está parado há dez dias — Braga 1.273 sem mexer, Almada 751 → 755 — enquanto o occupation.xlsx mexe e bate certo com as nossas vendas. Defeito do fornecedor; o indicador já o diz. Email à Ticketline redigido e por enviar.
- **#271 (P2)** — não há vista de fechos por evento.

## Parado à espera de decisão do Pedro

- **Cron ticketing-sync-health (jobid 217) DESACTIVADO desde 08/10.** Religá-lo só volta a servir as condições (a) a (d), que o indicador não mostra.

## Bloqueios

- **#211 (plataforma-e-infra)** — o `notify_sync_action_needed()` aponta em Live para o projeto de TEST antigo e é um no-op; bilheteira já não depende dele, mas Coala e Fever continuam sem aviso próprio.
- **#78** — o import da Ticketline não limpa a série antiga quando o formato muda.
- **#73** — corte por tipo de bilhete.

## Fechado a 08/10/2026

- **#282 (fuga de dados entre empresas nos alertas) — FECHADA.** `check_ticketing_sync_health` filtra destinatários por `ur.company_id = v_company`; platform_admin só entra com papel nessa empresa. A função deixou de enviar: devolve o plano por empresa e escreve o lembrete. Dry-run de 08/10: uma só empresa no plano, Mundo Propício.
- **#272 (modal de fecho de bilheteira) — fechada**, verificada em ecrã pelo Pedro.
- **Fecho da bilheteira do Plenitude refeito pelo fluxo:** bruto 112.842,00 €, deduções 33.342,96 €, líquido 79.499,04 €, par `TRF-FECHO-D7042A04`. Saldo BOL 72.950,00 €.
- **Série diária BOL reposta** com um segundo validador pelo total do M2, que apanhou o defeito real (906 vs 982).
- **Sync Onebox reposto** (2.917 / 164.029,25 €) e acrescentado à vigia de saúde.
- **Índice de memória** passa a ser gerado por `scripts/gen-memory-index.mjs`, com teste que falha se o ficheiro for editado à mão.

## Factos que não se reinvestigam

- **Fecho de bilheteira (fluxo completo):** ler `.lovable/memory/features/settlement-transfer-pair.md`, `venue-retained-door-sales.md`, `ticket-office-reconciliation.md` e `ticket-office-sales-scope.md` antes de diagnosticar.
- **Vigia de sync:** `.lovable/memory/features/ticketing-sync-health.md` (condições a/b/c/d/e/f, canais, anti-spam 12h).
- **Crosscheck portal de Produtores:** `.lovable/memory/features/ticketline-crosscheck.md` (correspondência por data+recinto, limiar 3 bilhetes E 1%).
- **Série diária por evento:** `public.vw_event_daily_sales` — precedência por evento (espelhos vs `ticket_sales`), as duas famílias nunca se somam no mesmo evento.
- **Conta-corrente MP↔Ticketline:** o débito que transita decompõe-se em Ivete (−215.582,23) + H&K Porto (−55.834,14) = −271.416,37; a posição da conta é positiva para a MP (283.427,63 € a 13/09). Não voltar a confundir saldo de fecho com posição da conta.
- **Transferência entre contas** = par `expense`+`income` na rubrica 10.3 via `create_settlement_transfer`; nunca `type: 'transfer'`. Estorno apaga as duas pernas pela `operation_key`.
- **A perna da transferência do fecho nunca é dedução** — está excluída da lista de elegíveis do modal por `id = transfer_transaction_id` e por `operation_key TRF-FECHO-%`. Um fecho com transferência lançada não se reconfirma; estorna-se.
- **Uma correcção corre de ponta a ponta ou não começa.** Apagar metade e deixar o resto por fazer deixa dois saldos errados.
- **Verificar o papel não é filtrar a linha (D-ERP194).**
- **A receita de bilheteira vive em `ticket_sales`, não em `transactions`. É por desenho.**

## Onde ler mais

- `.lovable/memory/features/` — índice gerado por `node scripts/gen-memory-index.mjs` (D-ERP158); secção "Por onde começar" do índice.
- Regra do ritual: antes de diagnosticar um fluxo já implementado, nomear o ficheiro de `.lovable/memory/features/` que foi lido (D-ERP162).
