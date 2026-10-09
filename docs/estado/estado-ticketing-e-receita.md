# ESTADO — Ticketing & Receita

Atualizado: 2026-10-08 · Issues: `agora` #283 (parte 5), #267, #271 · `a-seguir` #206 · `depois` #73, #78 · `bloqueada` #211 (transversal, plataforma-e-infra)

## Em vigor

- **Vigia ticketline-crosscheck (D-ERP152).** Corrida diária 06:50 UTC (cron `ticketline-crosscheck-daily`, jobid 1640), tabela `ticketline_crosscheck_runs`, alerta como condição **(e)** de `check_ticketing_sync_health()`. Limiar revisto a 02/10: alerta com **pelo menos 3 bilhetes E pelo menos 1% da quantidade do portal**, em duas leituras diárias seguidas; o valor em euros deixou de ser gatilho e é só informação; evento não encontrado no portal alerta logo à primeira leitura. Motivo da revisão: com o limiar absoluto de 100 €, o SM Porto alertava com 2 bilhetes de diferença em 4.921 (0,04%).
- **Série diária do BOL.** A validação deixou de depender só da linha TOTAL do Mapa Diário: passa a aceitar também a validação pelo total do M2 da mesma corrida (soma dos dias = M2 em quantidade e valor ao cêntimo; `validated_by = m2_total` + aviso) e recusa quando nenhum dos dois bate. Quando falha, grava `daily_debug` no `import_audit` com a janela de tokens à volta de cada ocorrência de TOTAL. Alerta novo: condição **(f)** — 6 corridas seguidas com status ≠ `success` na mesma config (warning conta), anti-spam 12h.
- **Conferência portal de Produtores (D-ERP191/192, 08/10).** Fonte = variação do occupation.xlsx; PDF só informativo; sinal (g) "PDF parado com xlsx a mexer". Email DESLIGADO (cron ticketing-sync-health jobid 217 inactivo: enviava a outra empresa). Aviso agora só no Dashboard (ícone ao lado de "Por bilheteira"), por empresa activa.
- **Alertas de saúde de sync sem email nem WhatsApp (08/10).** `check_ticketing_sync_health` filtra destinatários por `ur.company_id`; platform_admin só entra com papel nessa empresa. A função deixou de enviar: devolve o plano e escreve o lembrete. Decisão do Pedro: a vigia não manda email nem WhatsApp — o canal é o indicador no dashboard. O lembrete `ticketing_sync_stalled` foi desactivado a 08/10 14:32 para não disparar pelo cron `system-reminders-daily` (07:30, WhatsApp para um número único sem filtro de empresa).
- **Indicador de divergências no Dashboard.** `TicketingDivergenceIndicator` no bloco "Por bilheteira" (SalesPositionWidget), a ler `get_ticketing_divergences()`, isolado por `row_belongs_to_current_company`. Provado por impersonação em Live: michel 0 divergências, pedro 2 (Almada e Braga, condição (g)).

## A trabalhar agora

- **#283 parte 5 — auditoria multiempresa às edge functions.** 29 das 54 edge functions com service_role e ids do cliente, por ler à mão. Prioridade: `sync-coala-from-drive`, `crm-google-ads-sync`, `crm-meta-publish-*`, `crm-meta-create-*`, `crm-google-*`. Também `probe-ticketline-produtores`, que está publicada e com a guarda por confirmar.
- **#267 — Mapa de Ocupação (PDF) da Ticketline parado.** O PDF do portal de Produtores está parado há dez dias — Braga 1.273 sem mexer, Almada 751 → 755 — enquanto o occupation.xlsx continua a mexer e bate certo com as nossas vendas. É problema do fornecedor; o indicador já o diz em texto. Email à Ticketline redigido e por enviar.
- **#271 (P2)** — não existe vista de fechos por evento; o separador Fechos é por bilheteira (`financial_account_id`).

## Parado à espera de decisão do Pedro

- **Cron ticketing-sync-health (jobid 217) DESACTIVADO desde 08/10.** Religá-lo só volta a servir as condições (a) a (d), que o indicador não mostra. A decisão é dele.

## Bloqueios

- **#211 (plataforma-e-infra)** — o `notify_sync_action_needed()` aponta em Live para o projeto de TEST antigo e é um no-op; bilheteira já não depende dele, mas Coala e Fever continuam sem aviso próprio.
- **#78** — o import da Ticketline não limpa a série antiga quando o formato muda.
- **#73** — corte por tipo de bilhete.

## Fechado hoje (08/10/2026)

- **#282 (fuga de dados entre empresas nos alertas) — FECHADA no GitHub.** `check_ticketing_sync_health` filtra destinatários por `ur.company_id`; platform_admin só entra com papel nessa empresa. A função deixou de enviar: devolve o plano e escreve o lembrete.
- **#272 (modal de fecho de bilheteira) — fechada**, verificada em ecrã pelo Pedro.
- **Fecho da bilheteira do Plenitude refeito pelo fluxo:** bruto 112.842,00 €, deduções 33.342,96 €, líquido 79.499,04 €, par `TRF-FECHO-D7042A04`; saldo do BOL 72.950,00 €.
- **Série diária BOL reposta** com um segundo validador (total M2) que apanhou o defeito real (906 vs 982).
- **Sync Onebox reposto** (2.917 bilhetes / 164.029,25 €) e acrescentado à vigia de saúde.
- **Índice de memória** passa a ser gerado por `scripts/gen-memory-index.mjs`, com teste a falhar se for editado à mão.

## Regras que saíram desta sessão

- Uma correcção corre de ponta a ponta ou não começa. Apagar metade e deixar o resto por fazer deixa dois saldos errados.
- Verificar o papel não é filtrar a linha (D-ERP194).
- Antes de diagnosticar um fluxo, ler `.lovable/memory/features/` — o fluxo de fecho foi diagnosticado três vezes antes de alguém ler o ficheiro que o descreve.
- A receita de bilheteira vive em `ticket_sales`, não em `transactions`. É por desenho.

## Factos que não se reinvestigam

- **Fecho de bilheteira (fluxo completo):** ler `.lovable/memory/features/settlement-transfer-pair.md`, `venue-retained-door-sales.md`, `ticket-office-reconciliation.md` e `ticket-office-sales-scope.md` antes de diagnosticar.
- **Vigia de sync:** `.lovable/memory/features/ticketing-sync-health.md` (condições a/b/c/d/e/f, canais, anti-spam 12h).
- **Crosscheck portal de Produtores:** `.lovable/memory/features/ticketline-crosscheck.md` (correspondência por data+recinto, limiar 3 bilhetes E 1%).
- **Série diária por evento:** `public.vw_event_daily_sales` — precedência por evento (espelhos vs `ticket_sales`), as duas famílias nunca se somam no mesmo evento.
- **Conta-corrente MP↔Ticketline:** o débito que transita decompõe-se em Ivete (−215.582,23) + H&K Porto (−55.834,14) = −271.416,37; a posição da conta é positiva para a MP (283.427,63 € a 13/09). Não voltar a confundir saldo de fecho com posição da conta.
- **Transferência entre contas** = par `expense`+`income` na rubrica 10.3 via `create_settlement_transfer`; nunca `type: 'transfer'`. Estorno apaga as duas pernas pela `operation_key`.
- **A perna da transferência do fecho nunca é dedução** — está excluída da lista de elegíveis do modal por `id = transfer_transaction_id` e por `operation_key TRF-FECHO-%`. Um fecho com transferência lançada não se reconfirma; estorna-se.

## Onde ler mais

- `.lovable/memory/features/` — índice gerado por `node scripts/gen-memory-index.mjs` (D-ERP158); secção "Por onde começar" do índice.
- Regra do ritual: antes de diagnosticar um fluxo já implementado, nomear o ficheiro de `.lovable/memory/features/` que foi lido (D-ERP162).
