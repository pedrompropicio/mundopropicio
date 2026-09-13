# Estado — Fecho, Fechamentos e Sócios (#146)

Actualizado em 2026-09-13 (g3). **Nada publicado** — tudo construído e provado em
Live por leitura; o Publish é decisão do Pedro.

## Construído

- **(b)** `event_settlement_id` em transações e linhas de BP.
- **(c)** motor puro dos fechamentos (`src/lib/event-settlement-engine.ts`).
- **(d)** operações de terceiros (bares, bengaleiro, …) com participações por nó.
- **(e)** espelho `event_partners` a partir de qualquer fechamento + trigger de sync.
- **(e2)** critério de custo do evento na BD (`events.cost_expense_source`,
  `cost_include_overhead`) — igual em todos os computadores.
- **(f)** selo do fechamento (`seal_event_settlement`, snapshot + validações C1/C2).
- **(g1)** casa em qualquer fechamento, IVA dedutível devolvido ao nó, nominal gap.
- **(g2)** Anitta EDA 2026 a três níveis provada em Live (ANITTA 417.293,42 ao
  cêntimo antes e depois; nível 3 547.906,69; C1 e C2 a 0,00).
- **(g3)** resultado do evento = perímetro da raiz, em toda a app e no Portal do
  Sócio; card sempre com o critério da BD.

## Falta

- **Prova formal contra a planilha v23** (02/09): EDA 417.677,51 · MP+EIN
  597.502,78 · EIN 298.751,39 — à espera dos números oficiais do Pedro.
- **Selar** o fechamento da Anitta depois dessa prova.
- **Publish** — não feito, por decisão explícita.

## Notas

- DRE Empresarial e DRE Brasil são vistas de EMPRESA e mantêm os exclusivos.
- 1 cêntimo de diferença de apresentação no Encontro de Contas da raiz
  (417.293,41 no ecrã vs 417.293,42 no motor) — truncatura, não cálculo.

## (g4) — base por fechamento + prestação de contas (13/09/2026)

- Motor: a base (c/IVA ou s/IVA) é do fechamento; todos os participantes do nó,
  casa incluída, calculam nessa base. `expense_includes_iva` deixou de ser lido.
- Aba Sócios: percentagem atribuída por fechamento; coluna "Base IVA" removida.
- Documento do sócio (Portal e export da equipa): prestação de contas em PDF e
  Excel, estanque — "Sócios locais — NN%" ou "Mundo Propício — NN%".
- Ficheiros de prova: `Prestacao_de_Contas_Anitta_EDA_2026_ANITTA` (resultado
  596.133,45 · parte 417.293,42) e `..._EVERYTHINGISNEW` (resultado 547.906,69 ·
  parte 273.953,35).
- Testes: motor 21 · perímetro 6 · documento 6; `tsgo --noEmit` limpo.
- Sem Publish. Sem DML.
