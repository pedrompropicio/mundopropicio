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

**Fotografia na base — `SELECT` de 31/10/2026 19:58 UTC** (consultar de novo antes de usar):
- BP de trabalho (`version_id IS NULL`): **53 linhas de despesa, base 1.292.005,19 €**, e **2 linhas de receita, base 26.046,03 €**. Sem versões congeladas. Zero linhas sem categoria.
- Transações no evento: **123**.
- Três linhas continuam variáveis por natureza e `fixed`: Revenue Share ECI 1,5% (21.516,87 €), acréscimo do período de exclusividade (4.529,16 €, remedir no fim da exclusividade) e Variável GTS 10% (130.405,29 €). Conversão em fórmula na Issue #393 — depende de lotes de planeamento e `event_simulator_config`, que este evento não tem.
- A linha "Riggers Desmontagem" (6.610,00 €) tem categoria 4.2.03; com a "Riggers Montagem" somam os 11.700,00 € já contratados que justificam a verba de 12.300,00 € do técnico de luz/LED.
- Despesas aprovadas sem linha do BP: Digital 8.061,96 € (liga à linha 3.2.01 "Mídia online") e 2.ª metade do teatro 154.275,00 € (liga à linha existente "Aluguel do Teatro"). Pedido ao 6 no QUADRO.
- Bilheteira (linha sintética 1.1.01): previsto original fixado em 17.105,22 € a 08/09; 39 zonas / 34.827 lugares; vendido real 301.944,25 € bruto / 274.494,77 € líquido (5.443 bilhetes, IVA 10% do lote) — `SELECT` de 28/10/2026.

**Aviso medido a 31/10 19:58 UTC:** entre 28/10 e 31/10 o BP perdeu a linha 2.2.02 da hospedagem da equipa H&K sem que este chat a tivesse apagado; a 28/10 eram 41 linhas / 1.258.265,73 € e a 31/10, antes do lançamento, 44 linhas / 1.248.490,16 €. A linha foi recriada (ver abaixo); a causa das restantes diferenças não foi investigada.

## Despesas pagas pela H&K no Brasil — lançado a 31/10/2026

Fonte: relatório Controlle da Ilusion, tag iNVESTIMENTO_MADRID2027, gerado 23/10/2026 15:31 — 59 lançamentos, R$ 967.080,56. Detalhe no Projeto do Claude, `claude/hk-madrid-despesas-pagas-hk-brasil-2026-10-31.md`.

**Reconciliação do relatório:** 21 lançamentos já estavam na base (R$ 612.347,29) e 38 não estavam (R$ 354.733,27). 21 + 38 = 59; a soma fecha nos R$ 967.080,56 do relatório. Das 10 linhas que o relatório mostra como pendentes, 8 são parcelas das passagens e seguros da equipa (cartão Clara) já reconhecidas em bloco a 23/09 nos 12.392,83 € — o parcelamento é da H&K e para a MP o assunto está liquidado.

**Ajustes de BP feitos** (decisão do Pedro de 31/10):
- Linha 2.2.02 "Hospedagem - Equipe Henry e Klaus" **recriada**, 25.067,57 €.
- Linha 4.5.02 "Transfer Material Magia Portugal x Espanha" subida de 4.100,00 para **14.226,90 €** (3.333,33 € já pagos, confirmados por transação ligada, + 10.893,57 € de Pop Cargo). `baseline_amount` mantido nos 4.100,00.
- **8 linhas novas** com o valor realizado, 8.320,56 €: 2.2.07 fretes e carregadores no Brasil, 2.2.01 visita técnica H&K, 2.2.01 passagens Henry & Klauss, 3.1.01 audiovisual, 2.5.01 cenografia, 4.1.11 figurino, 2.3.02 backline, 2.6.05 locação de espaço para ensaios.

**Lançamentos feitos:** 38 despesas, **61.816,40 €** — 36 pagas (60.867,14 €) e 2 aprovadas e por pagar (949,26 €: Viraliza 2/2 a 05/11 e hospedagem a 12/11, com taxa provisória de 30/10 a recalcular no dia do pagamento). Cada uma com `currency = BRL`, `original_amount`, `fx_rate` e linha do BP; zero sem linha. As 36 pagas com conta, uma perna de pagamento e o aporte espelhado; as 2 pendentes sem conta, sem perna e sem aporte.

**Conta de acerto** `Pgto Mágicos Acerto Madrid` (`251d708e-…`): 165.677,65 € de despesa contra 165.677,65 € de aporte, saldo zero. **Aportes do evento: 61, 414.677,65 €** — 59 em `partner_settlement` (165.677,65 €) e 2 em `event_cash` (249.000,00 €, não tocados). Origem: `SELECT` de 31/10/2026 19:58 UTC.

**Catering:** não foi tocado. Continua lançado por sessão (8.850 €) e a folha prevê por dia de espetáculo (31 dias → 1.550 €). Aguarda confirmação da equipa.

## A conta-espelho gera o aporte sozinha — não se lança à mão

A conta `Pgto Mágicos Acerto Madrid` tem `mirror_partner_aporte = true` e `partner_id` do sócio. A função `public.sync_partner_aporte_mirror` cria sozinha o aporte, a ponte em `partner_aporte_mirror` e o movimento em `partner_capital_moves` quando a despesa fica paga. **Lança-se só a despesa.**

No lançamento de 31/10 este chat criou os 36 aportes à mão sem o saber e ficou com 36 duplicados (60.867,14 €) durante cerca de sete minutos; foram apagados com as pernas e os movimentos, pelos ids devolvidos pelo próprio INSERT, e a conta ficou conferida. Mecanismo documentado em `.lovable/memory/features/partner-aporte-mirror.md`.

## Desvio 0295 — descrição do aporte espelhado

A 31/10 este chat substituiu em Live a função `sync_partner_aporte_mirror` para a descrição do aporte deixar de nascer com o prefixo `Aporte automatico — ` e o marcador passar para a observação. Migração `drizzle/migrations/0295_partner_aporte_mirror_descricao_sem_prefixo.sql`, commit `1456ff5f`. **Foi um desvio às regras temporárias da homologação** (#352): é cosmético e podia esperar. Decisão do 0 · Cowork de 31/10: **a 0295 fica, não se reverte**, desvio declarado na #352.

**Consequência conhecida, não é defeito:** o backfill das **59** descrições antigas está parado até a homologação ser aceite (é R2 e vai pelo fluxo de promoção). Até lá a base tem dois formatos ao mesmo tempo — os aportes espelhados novos, incluindo os das duas pendentes de 05/11 e 12/11, nascem **sem** prefixo, e os 59 antigos ficam **com** prefixo. Não há diferença em valores. Contagem de 31/10 19:58 UTC: 59 com prefixo.

## Dúvidas em aberto (do Pedro)

1. Linha "IVA Real" da folha de referência: o que é.
2. Montagem e desmontagem do teatro: dentro do aluguer (#215) ou custo à parte.
3. Data prevista do fim da exclusividade da bilheteira.
4. Se outras bilheteiras que entrem depois cobram comissão à MP.

## Pendente neste chat

- Backfill das 59 descrições — parado até a homologação (#352) ser aceite.
- Entrada **D-ERP339** no `docs/DECISIONS.md` — o ficheiro tem 771.125 caracteres e não se reescreve pelo conector; texto entregue ao 0 para edição cirúrgica por git.
- Linha da reserva no `docs/QUADRO.md` — idem, entregue ao 0 para a Frente 2 editar por git. **A reserva mantém-se:** a demanda não fechou.
- Inventário dos automatismos de entrada de dados (triggers que criam transações, pernas ou movimentos sozinhos), autorizado pelo Pedro a 31/10 — por fazer.

## Pedidos registados no QUADRO

- Chat 10: lançar as linhas aprovadas — feito a 28/10 (D-ERP330) e as despesas da H&K a 31/10.
- Chat 3: bilheteira sintética sem previsto utilizável; dependência da #348 para o revenue share por canal.
- Chat 6: duas despesas aprovadas sem linha do BP.

## Issues ligadas

- #352 (transversal) — homologação isolada; o desvio 0295 está lá declarado.
- #215 (MP-ERP) — aluguer do teatro, tratamentos de IVA e 2.ª metade sem documento.
- #393 (MP-ERP) — converter em fórmula as duas linhas variáveis quando a bilheteira estiver configurada.
- #348 (MP-ERP) — canal de venda nas importações, base do revenue share por fórmula.
- #80 (MP-CRM) — artes do portal H&K Madrid. Pertence ao 9.

## Fora deste chat

Regra de rateio/verbas → 5 · Vínculo transação↔linha → 6 · Fecho e sócios → `fecho-hk-madrid-2026` (a abrir depois do evento) · Bilheteira → 3 · Banco e tesouraria → 4 · Contratos → `juridico` · Plataforma → 2.
