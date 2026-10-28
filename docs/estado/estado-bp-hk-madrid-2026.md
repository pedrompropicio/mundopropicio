# Estado — bp-hk-madrid-2026

> Reescrito por cima no fecho de cada sessão. Não é datado; o que está aqui é o que vale agora.
> **Confidencialidade:** o repo é público. Termos contratuais com parceiros, valores negociados e dados pessoais não entram aqui (D-ERP307); vivem no Projeto do Claude, no Drive com partilha restrita ou no chat.

## O evento

- **Henry & Klauss - Madrid** · `events.id` `bf9ce2d8-754e-4485-8427-e2d486c39919` · empresa Mundo Propício `7c858982-6ccd-47ca-bd65-e0dd3eebf01c`.
- Sala: UMusic Hotel Teatro Albéniz, Madrid. Primeira data registada: 21/11/2026. Estado `active`. Evento único (sem cidades filhas).
- `budget_mode` nulo no evento → herda o da empresa, `with_bp`.
- Origem: `SELECT … FROM events WHERE id = 'bf9ce2d8-…'`, 28/10/2026.

## Onde estamos

**BP de referência decidido pelo Pedro (28/10/2026):** a versão "BP Equipe Completa" + "BP sessões extras" da folha do Pedro (Google Sheets, partilha restrita). Ajustes decididos sobre essa versão:
- Período da equipa (salários, alimentação, som, lavandaria) em 2,5 meses, não 2 (a equipa está em Madrid de meados de novembro a finais de janeiro).
- Riggers/técnico de luz-LED: mantém-se a verba total da folha; a parte já contratada fica nas linhas existentes e o resto numa linha "verba por definir".
- Montagem e desmontagem do teatro numa linha própria, até se esclarecer se é custo do teatro (#215) ou outro.
- Revenue share da ECI: entra no BP à taxa de piso (a exclusividade não se mantém); o que for recebido acima entra pelo realizado (chão do realizado das linhas com fórmula).
- Variável da operadora do teatro: linha de despesa com fórmula sobre a receita de bilhetes.
- A comissão da bilheteira não é custo da MP: o recargo é pago pelo comprador (`PROC-vendas-onebox-madrid.md`: a captação grava só a Facturación).
- Taxas e parâmetros contratuais ficam fora do repo.

**Lista das linhas a lançar:** Projeto do Claude, `claude/bp-hk-madrid-linhas-a-lancar-2026-10-28.md`. Pedido registado no QUADRO para o chat 10.

Fotografia na base em 28/10/2026, antes de qualquer lançamento (consultar de novo antes de usar):
- BP de trabalho (`version_id IS NULL`): 20 linhas de despesa, base 650.210,44 €; nenhuma linha de receita manual; sem versões congeladas.
- Linha "Riggers Desmontagem" (6.610,00 €) sem categoria.
- Despesas aprovadas sem linha do BP: Digital 8.061,96 € e 2.ª metade do teatro 154.275,00 €.
- Bilheteira (linha sintética 1.1.01): previsto original fixado em 17.105,22 € a 08/09; 39 zonas / 34.827 lugares; facturación real 301.539,25 € até 28/10.
- Origem: `event_forecasts`, `transactions` (paid/approved, `forecast_id`), `events`, `event_ticket_zones`, `onebox_daily_sales`, 28/10/2026.

## Dúvidas em aberto (do Pedro)

1. Linha "IVA Real" da folha de referência: o que é.
2. Montagem e desmontagem do teatro: dentro do aluguer (#215) ou custo à parte.
3. Data prevista do fim da exclusividade da bilheteira.
4. Se outras bilheteiras que entrem depois cobram comissão à MP.

## Pedidos registados no QUADRO (28/10/2026)

- Chat 10: lançar as linhas aprovadas.
- Chat 3: bilheteira sintética sem previsto utilizável; dependência da #348 para o revenue share por canal.
- Chat 6: duas despesas aprovadas sem linha do BP.

## Issues ligadas

- #215 (MP-ERP) — aluguer do teatro, tratamentos de IVA e 2.ª metade sem documento.
- #348 (MP-ERP) — canal de venda nas importações, base do revenue share por fórmula.
- #80 (MP-CRM) — artes do portal H&K Madrid. Pertence ao 9.

## Fora deste chat

Regra de rateio/verbas → 5 · Vínculo transação↔linha → 6 · Fecho e sócios → `fecho-hk-madrid-2026` (a abrir depois do evento) · Bilheteira → 3 · Banco e tesouraria → 4 · Contratos → `juridico` · Plataforma → 2.
