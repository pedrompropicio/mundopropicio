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
- Revenue share da ECI, **revisto a 28/10 (D-ERP330)**: são 3% enquanto a ECI é exclusiva e 1,5% depois, e a fórmula não aceita duas taxas. Ficam **duas linhas** em 1.3.04: 1,5% sobre toda a temporada e, à parte, o acréscimo de 1,5% do período de exclusividade, remedido quando a exclusividade acabar. Não se usa o chão do realizado para compensar a diferença.
- Variável da operadora do teatro: 10% da receita líquida de bilhetes, em linha própria de 4.3.01.
- **As três linhas variáveis foram lançadas `fixed`, não em fórmula (D-ERP330):** o recálculo é automático e, sem lotes de planeamento nem `event_simulator_config`, cairia no real até à data. Conversão na Issue #393.
- A comissão da bilheteira não é custo da MP: o recargo é pago pelo comprador (`PROC-vendas-onebox-madrid.md`: a captação grava só a Facturación).
- Taxas e parâmetros contratuais ficam fora do repo.

**Lista das linhas a lançar:** Projeto do Claude, `claude/bp-hk-madrid-linhas-a-lancar-2026-10-28.md`. Pedido registado no QUADRO para o chat 10.

Fotografia na base em 28/10/2026, **depois do lançamento do chat 10** (consultar de novo antes de usar):
- BP de trabalho (`version_id IS NULL`): 41 linhas de despesa, base 1.258.265,73 €, e 2 linhas de receita, base 26.046,03 €. Sem versões congeladas.
- As 23 linhas lançadas a 28/10 estão em D-ERP330 e no QUADRO; as 20 anteriores (650.210,44 €) não foram tocadas.
- Três linhas são variáveis por natureza e ficaram `fixed`: Revenue Share ECI 1,5% (21.516,87 €), acréscimo do período de exclusividade (4.529,16 €, remedir no fim da exclusividade) e Variável GTS 10% (130.405,29 €). Conversão em fórmula na Issue #393 — depende de lotes de planeamento e `event_simulator_config`, que este evento não tem.
- A linha "Riggers Desmontagem" (6.610,00 €) já tem categoria 4.2.03; com a "Riggers Montagem" somam os 11.700,00 € já contratados que justificam a verba de 12.300,00 € do técnico de luz/LED.
- Despesas aprovadas sem linha do BP: Digital 8.061,96 € (liga à nova linha 3.2.01 "Mídia online") e 2.ª metade do teatro 154.275,00 € (liga à linha existente "Aluguel do Teatro"). Pedido ao 6 no QUADRO.
- Bilheteira (linha sintética 1.1.01): previsto original fixado em 17.105,22 € a 08/09; 39 zonas / 34.827 lugares; vendido real 301.944,25 € bruto / 274.494,77 € líquido (5.443 bilhetes, IVA 10% do lote) a 28/10.
- Origem: `event_forecasts`, `transactions` (paid/approved, `forecast_id`), `events`, `event_ticket_zones`, `event_ticket_lots`, `ticket_sales`, `event_simulator_config`, 28/10/2026.

## Despesas pagas pela H&K no Brasil (31/10/2026)

- Relatório Controlle da Ilusion (tag iNVESTIMENTO_MADRID2027, 59 lançamentos, gerado a 23/10) cruzado com a base: os lançamentos de passagens da equipa, consórcio, plano de saúde, tráfego e viagens pagos por conta da MP já estão (despesa + aporte ou só aporte); 38 lançamentos de produção da H&K não estavam.
- Decisão do Pedro (31/10): lançar todos, incluindo os que parecem pessoais — são custos do evento. Recriar a linha de hospedagem da equipa H&K (apagada depois de 28/10), subir a linha de transfer de material PT×ES e criar 8 linhas novas com o valor realizado. Pedido ao chat 10 no QUADRO; detalhe no Projeto do Claude (`claude/hk-madrid-despesas-pagas-hk-brasil-2026-10-31.md`).
- Catering: lançado por sessão (8.850 €); a folha prevê por dia de espetáculo (31 dias → 1.550 €). Aguarda confirmação da equipa antes de corrigir.

## Dúvidas em aberto (do Pedro)

1. Linha "IVA Real" da folha de referência: o que é.
2. Montagem e desmontagem do teatro: dentro do aluguer (#215) ou custo à parte.
3. Data prevista do fim da exclusividade da bilheteira.
4. Se outras bilheteiras que entrem depois cobram comissão à MP.

## Pedidos registados no QUADRO (28/10/2026)

- Chat 10: lançar as linhas aprovadas — **feito a 28/10/2026** (D-ERP330); conversão das variáveis em fórmula na #393.
- Chat 3: bilheteira sintética sem previsto utilizável; dependência da #348 para o revenue share por canal.
- Chat 6: duas despesas aprovadas sem linha do BP.

## Issues ligadas

- #215 (MP-ERP) — aluguer do teatro, tratamentos de IVA e 2.ª metade sem documento.
- #348 (MP-ERP) — canal de venda nas importações, base do revenue share por fórmula.
- #80 (MP-CRM) — artes do portal H&K Madrid. Pertence ao 9.

## Fora deste chat

Regra de rateio/verbas → 5 · Vínculo transação↔linha → 6 · Fecho e sócios → `fecho-hk-madrid-2026` (a abrir depois do evento) · Bilheteira → 3 · Banco e tesouraria → 4 · Contratos → `juridico` · Plataforma → 2.
