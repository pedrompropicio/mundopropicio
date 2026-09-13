# Estado — Fecho de evento e sócios

Última actualização: 2026-09-13 (épica #146, pontos (f) + (g1) + (g2) construídos e
por publicar).

## Onde estamos

- **(g2) Anitta EDA 2026 configurada a três níveis em LIVE — feita, provada, POR
  PUBLICAR (o código da (f)/(g1)/(g2) continua sem Publish).**
  - Aplicado por transacção única com verificações V1–V9 (nada gravado se falhar) e
    por migration para o DDL prévio.
  - **DDL:** `check_partner_percentage_trigger` **removido** de `event_partners`. Com
    fechamentos em árvore o espelho soma legitimamente 140% (ANITTA 70 + EIN 50 +
    Rafael Lobo 20). A regra dos 100% deixou de ser invariante.
  - **Árvore:** raiz "Fechamento Anitta" (ANITTA `settles` 70/0, RAFAEL LOBO
    `nominal` 10/10, casa `nominal` 20/20 = pool que desce) + dois filhos irmãos:
    "Fechamento Rafael Lobo" (quota 30% c/IVA, RAFAEL LOBO `settles` 20/20) e
    "Fechamento MP + EIN" (quota 20% c/IVA, `returns_parent_deductible_vat = true`,
    EIN `settles` 50/50 e casa `settles` 50/50). A EIN saiu da raiz.
  - **Supplier novo:** `RAFAEL LOBO` (`is_partner = true`, sem utilizador, sem
    portal, sem pagador/ordenador). "Lobinho"/"Carvalheira" é a mesma entidade.
  - **Receitas exclusivas do nível 3** — transações do EVENTO marcadas com
    `event_settlement_id`: 1% Ticketline 22.111,70 (era `event_id NULL`; passou a
    ter evento e fechamento no mesmo statement), bengaleiro 138,82 e patrocínio
    Câmara de Oeiras 50.000,00 (criadas, base s/IVA, 2026-08-31, aprovadas).
    Total 72.250,52.
  - **Operação de terceiros** "A&B Bares — ficheiro do operador" (`outro`,
    `manual`, bruto 287.138,58, resultado do operador 194.468,13): raiz
    `gross_pct` 35% = 100.498,50; nível 3 `result_share` 100% → adicional
    194.468,13 − 100.498,50 = 93.969,63.
  - **O resultado da raiz não mudou:** as exclusivas entram no evento e são
    marcadas no mesmo acto, e a raiz é "totais − marcadas". Perímetro da raiz
    2.527.352,94 de receita, igual ao de antes.
  - **Fechamento de teste dos Mágicos `e810ede8…` apagado.**

- **(g1) Motor dos três níveis — construída, testada, POR PUBLICAR.**
  - `event_settlements.returns_parent_deductible_vat` (boolean, default false):
    o fechamento devolve a si o **IVA dedutível das despesas do perímetro do pai**.
    Índice único parcial `event_settlements_one_vat_return_per_parent` (um filho por
    pai) + CHECK `event_settlements_root_no_vat_return` (a raiz nunca). O motor
    valida o mesmo, com erro legível.
  - `validate_settlement_participant` deixou de limitar a **casa** à raiz: a casa
    pode existir em qualquer fechamento, uma por fechamento. Na raiz pode ficar em
    **Nominal** (pool que desce).
  - Motor: parte declarada da MP = Σ das partes da casa nos nós onde ela liquida;
    base dos participantes do pai = `resultNet − vatReturnedOut`; **nominal gap** =
    Σ (parte nominal − parte real) dos sócios que liquidam noutro fechamento; nominal
    órfão = erro de configuração explícito.
  - **Bug encontrado na prova da (g2) e corrigido:** `PartnerSettlementTab` mostrava
    a nota «IVA dedutível devolvido» mas **não somava `vatReturnedIn` à receita do
    nó** — o nível 3 aparecia com 285.446,84 em vez de 547.906,69. Corrigido em
    `totalRevenueNet`.

- **(f) Selo do fechamento — construída, POR PUBLICAR.**
  - `is_sealed`, `sealed_at`, `sealed_by`, `sealed_snapshot`, `seal_note`,
    `sealed_bp_version_id`; RPCs `seal_event_settlement` / `unseal_event_settlement`
    (selar exige C1 e C2 a 0,00 €; reabrir exige motivo); guarda por trigger com
    `app.settlement_seal_op`. `create_bp_snapshot` recusa eventos Split.
  - **Nada foi selado.**

- **Correcção A — quota do fechamento acima é opcional.**
- **Correcção B — espelho `event_partners` deixa de apagar sócios.**

## Números em Live (13/09/2026)

Critério do evento: base c/IVA, overhead ligado, despesa comprometida. Receita
2.599.603,46 · despesa s/IVA 1.668.759,64 · c/IVA 1.931.219,49 · IVA dedutível
262.459,85.

| nó | quota do pai | resultado | participante | parte |
| --- | --- | --- | --- | --- |
| raiz | — | s/IVA 858.593,30 · c/IVA 596.133,45 | ANITTA `settles` 70% | **417.293,42** |
| raiz | — | | RAFAEL LOBO `nominal` 10% | 59.613,35 |
| raiz | — | | casa `nominal` 20% | 119.226,69 |
| Fech. Rafael Lobo | 178.840,04 | 178.840,04 | RAFAEL LOBO `settles` 20% | 35.768,01 |
| Fech. MP + EIN | 119.226,69 | 547.906,69 | EIN `settles` 50% | 273.953,35 |
| Fech. MP + EIN | | | casa `settles` 50% | 273.953,35 |

Nível 3 = 119.226,69 + 262.459,85 + 72.250,52 + 93.969,63 = 547.906,69.
Casa: residual 297.798,68 = declarada 273.953,35 + nominal gap 23.845,34 + IVA 0,00.
**C1 e C2 a 0,00.** A parte da ANITTA é a mesma antes e depois, ao cêntimo.

Diferença face aos valores de 02/09 (EDA 417.677,51 · MP+EIN 597.502,78 · EIN
298.751,39): não é do modelo, é da base. A planilha de 02/09 implica um resultado
c/IVA de 596.682,16 (417.677,51 ÷ 0,7) contra 596.133,45 em Live — 548,71 € de
despesa comprometida que entrou depois; e um IVA dedutível ~311.946 contra
262.459,85 em Live. Os dois blocos que não dependem da base — exclusivos 72.250,52
e adicional dos bares 93.969,63 — batem exactamente.

## Pendentes

- Versão de BP de teste `b0038ec3-0892-4c2c-80e3-a5de5736c41f` — fica como histórico.
- 1 cêntimo de diferença de apresentação no Encontro de Contas (o ecrã trunca, o
  motor arredonda): 417.293,41 vs 417.293,42.

## Próximos passos

1. Publicar (f) + (g1) + (g2) — pedido explícito do Pedro, ainda não feito.
2. Receber os seis números da planilha v23 e correr
   `V23='{…}' bun /tmp/g2/after.ts` para a comparação formal.
3. Encerrar a épica #146 depois de publicado e da v23 conferida.
