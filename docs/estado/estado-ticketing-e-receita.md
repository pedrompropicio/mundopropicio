# ESTADO — Ticketing & Receita

Atualizado: 2026-10-02 · Issues: `agora` #267, #272 · `a-seguir` #271, #206 · `depois` #73, #78 · `bloqueada` #211 (transversal, plataforma-e-infra)

## Em vigor

- **Vigia ticketline-crosscheck (D-ERP152).** Corrida diária 06:50 UTC (cron `ticketline-crosscheck-daily`, jobid 1640), tabela `ticketline_crosscheck_runs`, alerta como condição **(e)** de `check_ticketing_sync_health()`. Limiar revisto a 02/10: alerta com **pelo menos 3 bilhetes E pelo menos 1% da quantidade do portal**, em duas leituras diárias seguidas; o valor em euros deixou de ser gatilho e é só informação no email; evento não encontrado no portal alerta logo à primeira leitura. Motivo da revisão: com o limiar absoluto de 100 €, o SM Porto alertava com 2 bilhetes de diferença em 4.921 (0,04%). O texto do email foi separado: a (e) tem secção própria ("Divergência com o portal de Produtores") e já não aparece debaixo de "Sync de bilheteira parado", que dizia falsamente que as vendas estavam congeladas.
- **Série diária do BOL.** A validação deixou de depender só da linha TOTAL do Mapa Diário: passa a aceitar também a validação pelo total do M2 da mesma corrida (soma dos dias = M2 em quantidade e valor ao cêntimo; `validated_by = m2_total` + aviso) e recusa quando nenhum dos dois bate. Quando falha, grava `daily_debug` no `import_audit` com a janela de tokens à volta de cada ocorrência de TOTAL. Alerta novo: condição **(f)** — 6 corridas seguidas com status ≠ `success` na mesma config (warning conta), mesmo email e anti-spam 12h.

## A trabalhar agora

- **#267 — RG Almada e RG Braga.** A hipótese de devoluções está **DESCARTADA**. O portal de Produtores está parado nestes dois (751 / 24.305,00 € e 1.273 / 39.755,00 € ao cêntimo em três leituras seguidas, 30/09–02/10) enquanto o RG Estoril (127648), lido na mesma corrida e com o mesmo login, se actualiza todos os dias. Correspondência verificada no portal a 02/10 e está correcta; não existe outro evento ou sessão com a mesma data e recinto. **Defeito do lado da Ticketline.** Próximo passo: contactar a Ticketline com os ids 127631 e 127627, as datas das sessões e as três leituras.
- **#272 (P1) — modal de fecho de bilheteira conta a perna da transferência como dedução ao reabrir um fecho confirmado.** Afecta todos os fechos confirmados. Até estar corrigido: **fecho confirmado abre-se para ver, nunca para confirmar outra vez**.
- **#271 (P2)** — não há vista de fechos por evento nem vista única; o separador Fechos é por bilheteira (`financial_account_id`).

## Bloqueios

- **#211 (plataforma-e-infra)** — o `notify_sync_action_needed()` aponta em Live para o projeto de TEST antigo e é um no-op; bilheteira já não depende dele, mas Coala e Fever continuam sem aviso próprio.
- **#78** — o import da Ticketline não limpa a série antiga quando o formato muda.
- **#73** — corte por tipo de bilhete.

## Fechado hoje (02/10/2026)

- **Fecho de bilheteira da Conferência de Mulheres Plenitude (BOL):** bruto **112.842,00 €**, deduções **33.342,96 €** (8 despesas do Coliseu, FT 002/6102, 002/6110, 002/6113), líquido **79.499,04 €** transferido para o Banco Santander Totta a 01/10. Par criado por `create_settlement_transfer` (`operation_key TRF-FECHO-D7042A04`) e as 8 despesas ligadas por `settlement_id`. Substituiu um par lançado à mão a 02/10 fora do fluxo, que foi apagado. Saldo do BOL passou a **72.950,00 €** (Deive Lisboa, RG Coimbra e RG Santa Maria da Feira, os três por fechar).

## Factos que não se reinvestigam

- **Fecho de bilheteira (fluxo completo):** ler `.lovable/memory/features/settlement-transfer-pair.md`, `venue-retained-door-sales.md`, `ticket-office-reconciliation.md` e `ticket-office-sales-scope.md` antes de diagnosticar.
- **Vigia de sync:** `.lovable/memory/features/ticketing-sync-health.md` (condições a/b/c/d/e/f, canais, anti-spam 12h).
- **Crosscheck portal de Produtores:** `.lovable/memory/features/ticketline-crosscheck.md` (correspondência por data+recinto, limiar 3 bilhetes E 1%).
- **Série diária por evento:** `public.vw_event_daily_sales` — precedência por evento (espelhos vs `ticket_sales`), as duas famílias nunca se somam no mesmo evento.
- **Conta-corrente MP↔Ticketline:** o débito que transita decompõe-se em Ivete (−215.582,23) + H&K Porto (−55.834,14) = −271.416,37; a posição da conta é positiva para a MP (283.427,63 € a 13/09). Não voltar a confundir saldo de fecho com posição da conta.
- **Transferência entre contas** = par `expense`+`income` na rubrica 10.3 via `create_settlement_transfer`; nunca `type: 'transfer'`. Estorno apaga as duas pernas pela `operation_key`.

## Onde ler mais

- `.lovable/memory/features/` — índice gerado por `node scripts/gen-memory-index.mjs` (D-ERP158); secção "Por onde começar" do índice.
- Regra do ritual: antes de diagnosticar um fluxo já implementado, nomear o ficheiro de `.lovable/memory/features/` que foi lido (D-ERP162).
