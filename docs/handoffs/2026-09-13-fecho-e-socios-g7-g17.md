# HANDOFF — 2026-09-13 · fecho e sócios (g7 → g15-c)

> Arquivo. **Não é fonte de estado.** Para saber onde estamos, ver
> `docs/estado/estado-fecho-e-socios.md`.

**Frente:** fecho-e-socios · **Épico:** #146 · **Issues mexidas:** #158–#167
(fechadas), #168 aberta
**Executado em produção:** sim — Publish do Pedro (g7, g9c, g10, g11, g12, g13,
g13-b, g14) e Publish posterior (g15, g15-b, g15-c) e DML autorizado nos dados da
Anitta EDA 2026.

## 1. Congelamentos e avisos

- Números de referência da Anitta **não mudam** enquanto não houver decisão:
  IVA devolvido 262.459,85 · nível 3 547.906,69 · EIN 273.953,35 · ANITTA
  417.293,42 · RAFAEL LOBO 178.840,04.
- Nenhuma linha do BP da Anitta leva `vat_non_recoverable`.
- Fechamentos ainda **não selados** — selar só depois da prova v23.

## 2. Sequência da sessão

- **g7** — `transactions.held_by_supplier_id` ("Recebido por"), válido só em
  receitas por compensação, nasce pago; entra como quarta fonte de receitas em
  poder do sócio, incluindo Portal.
- **g9c** — `user_settlement_ids` só devolve `mode='settles'`; casa implícita
  mostra-se com o nome da casa; `FORBIDDEN_DOC_TERMS`; cache por identidade;
  ligação sócio ↔ utilizador na ficha do fornecedor.
- **g10** — base **efectiva** de despesa: nó que devolve IVA dedutível
  apresenta-se s/IVA (`src/lib/settlement-basis.ts`). Só rótulo.
- **g11** — `select` corrigido de `account_type` para `type`: as receitas em
  poder do sócio vinham a 0.
- **g12** — `PartnerDisbursementDetail` reutilizável: "Ver detalhe" por sócio no
  Encontro de Contas, com a conta por extenso e aviso de divergência.
- **g13** — documento em cascata: perímetro sempre da raiz
  (`collectSettlementExpenseDocLines` + `keepRootPerimeter`); dedução dos sócios
  acima pelo nome; ao lado e abaixo nunca.
- **g13-b** — a linha "+ IVA dedutível recuperado" nunca se esconde em cascata;
  rótulos de secção 3/4 na base da raiz.
- **g14** — `event_forecasts.vat_non_recoverable`: custo real, fora da devolução,
  abate ao resultado que ancora a C1.

## 3. Defeitos encontrados e corrigidos

1. Documento do sócio filho mostrava 587.610,42 c/IVA em vez de 1.931.219,49 —
   lia as linhas do apuramento do sócio em vez do perímetro da raiz.
2. Receitas em poder do sócio a 0 por causa do nome da coluna (`account_type`).
3. Cascata da EIN fechava com aviso de diferença 262.459,85 — faltava a linha do
   IVA dedutível recuperado, escondida pela regra g10.
4. Semântica inicial da g14 tratava o IVA marcado como valor retido pela casa;
   corrigido para custo real que abate ao resultado.
5. `soundcharts-*`: chamadas internas devolviam 403 porque a chave de serviço já
   não é JWT — resolvido com `_shared/internal-call.ts` (fora desta frente, mas
   feito na mesma sessão).

## 4. Provas em Live

- Anitta a três níveis: ANITTA 417.293,42 · nível 3 547.906,69 · C1 e C2 a 0,00.
- Encontro de Contas MP + EIN: parte 273.953,35 · desembolso 1.170.562,18 ·
  ajustes −34.304,72 · receitas em poder 1.179.220,45 · financiamento a devolver
  −42.962,99 · base a transferir 230.990,35.
- `vat_non_recoverable` = 0 linhas.
- `profiles.linked_supplier_id` ligado nos 2 sócios com utilizador.

## 5. Regras fixadas

- Cascata: **acima pelo nome; ao lado e abaixo nunca.**
- **IVA negocial sem fatura NÃO se marca** — é ativo da sociedade. `IVA não
  recuperável` = IVA pago e legalmente não dedutível = custo real.
- Aviso "a conta não fecha" é guarda permanente: desaparece por fechar.
- "Apresenta DDL" = escrever o ficheiro de migração e **parar**; nunca aplicar
  pela ferramenta de migração sem autorização.
- Descrições de transações e de linhas de BP são texto de negócio.
- **Documento não tem tolerância**: os totais do PDF são os do SSoT, nunca
  re-somados a partir de linhas já arredondadas (g15-b).
- O relatório interno é o documento **da Mundo Propício** — logótipo MP, nome da
  empresa no cabeçalho, sem marca de terceiros (g15-c).

## 5-bis. Adenda g15 → g15-c (Publish posterior)

- **g15** — relatório interno do Encontro de Contas reformulado. Novo modelo puro
  `src/lib/partner-settlement-internal-report.ts`
  (`buildInternalSettlementReport`, `partnerAccountLines`, `partnerBlockMismatch`)
  e novo gerador `src/lib/export-partner-settlement-internal-pdf.ts` (jsPDF, A4
  retrato, cabeçalho/rodapé em todas as páginas, sem quebras forçadas, tabelas
  pequenas keep-together, grandes com cabeçalho repetido). `exportPdf()` antigo
  de `PartnerSettlementTab.tsx` substituído por `exportInternalReport()`.
  Secções: cascata até ao fechamento, distribuição, linha g5 por sócio + quadros
  de detalhe da g12, Posição da Mundo Propício, anexo A bilheteira e **anexo B
  despesas na base do critério (previsto + excedido, c/IVA e s/IVA) =
  1.931.219,49**. Ficheiro `Fecho_<evento>_<fechamento>.pdf`. Anexo C (realizado)
  excluído.
- **g15-b** — zero cêntimos de diferença entre PDF e ecrã. Totais sempre do SSoT
  (`partnerDisbursement`, `partnerFinancingToReturn`, base a transferir);
  `reconcileDisplayValues` / `reconcileDisplayField` arredondam as linhas em
  round-half-even e empurram o residual para a linha de maior valor absoluto;
  `CLOSE_TOLERANCE` de 0,02 → 0,004. Teste falha se qualquer total do PDF
  divergir do modelo em ≥ 0,01. Base a transferir da EIN **230.990,35** em ambos.
- **g15-c** — resumo geral da Mundo Propício como secção 1 (independente do
  fechamento escolhido): resultado real do evento (âncora C1), "O que cada sócio
  leva de facto" com partes **reais** (ANITTA 417.293,42 · RAFAEL LOBO 35.768,01
  · EVERYTHINGISNEW 273.953,35) e **líquido final da MP 297.798,68** decomposto
  (parte declarada 273.953,35 + diferença de posição nominal 23.845,34), com a
  prova C1 = 0 impressa na própria secção. Logótipo MP na 1.ª página e nome da
  empresa no cabeçalho corrente. Na cascata, participante nominal mostra o
  nominal (RAFAEL LOBO 10% · 59.613,35) e, em itálico, o real do fecho dele (20%
  de 30% = 35.768,01) e o destino da diferença; mesma nota no ecrã.
- Provas: PDF gerado para os 3 fechamentos (raiz 596.133,45 + exclusivos +
  operações · Rafael Lobo 178.840,04 · MP + EIN 547.906,69), sem avisos de "a
  conta não fecha"; `bunx tsgo --noEmit` limpo e 126/126 testes.



## 6. Fila

1. Devoluções ao Fechamento MP + EIN (Advogado 3.000, Equipa EIN 15.000, ~3 a
   identificar).
2. Prova formal contra a planilha v23.
3. Repetir auditoria de estanqueidade com utilizadores ligados (P2-13).
4. Selar os 3 fechamentos, fechar #146.

## 5-ter. Adenda g16 → g17-d (Publish final da sessão)

- **g16** — a ligação utilizador ↔ sócio saiu do SQL: seletor "Sócio" no cartão
  de acesso de parceiro (`profiles.linked_supplier_id`) e lista dos utilizadores
  ligados na ficha do fornecedor. Pendente: migração
  `<ts>_profiles_admin_update_linked_supplier.sql` (policy UPDATE em `profiles`
  para admin/manager da empresa) — escrita mas **não aplicada**, à espera da
  decisão sobre incluir `manager` no SELECT.
- **g17** — o Portal do Sócio deixou de calcular. Todo o cálculo vive no pacote
  partilhado `supabase/functions/_shared/settlement/` (16 módulos puros; os
  `src/lib/*.ts` são shims `export * from "@shared/settlement/…"`).
  `statement-service.ts` expõe `loadStatementBundle` + `buildPartnerStatement`
  → `{ doc, block, cards }`. Edge function `partner-statement`
  (`verify_jwt = true`, service_role) valida o utilizador, resolve o sócio por
  `user_supplier_id`, exige `partner_event_access` activo e participação
  `mode = 'settles'`; do cliente só vem `event_id`. Log em `system_audit_log`.
- **g17-b / g17-c** — bloco `PartnerSettlementBlock` ("O seu fechamento") no topo
  de `PartnerEventDetail` e `PartnerFinancialCards` com prop `fecho`: os cards do
  evento passam a mostrar receitas, despesas e resultado DO FECHO (perímetro da
  raiz). PDF/XLSX gerados no browser a partir do mesmo `doc`.
- **g17-d** — regra única de arredondamento: `roundCents`
  (`_shared/settlement/iva.ts`, reexportado por `src/lib/iva.ts`) normaliza o
  ruído binário (`toPrecision(15)` + notação exponencial, half-away-from-zero) e
  é a ÚNICA função de arredondamento do fecho. `Math.round(x*100)/100`, `toFixed`
  e truncatura ficam proibidos em valores do fecho. Corrigiu 417.293,41 →
  **417.293,42** na parte da ANITTA (596.133,45 × 70% = 417293.4149999999).
  `calcWithIva` em `src/lib/utils.ts` delega em `calcTotalWithIva`.

## 7. Prova real no Portal publicado (13/09)

Login com `pedroneto@socialmusic.com.br`, ligado sucessivamente a RAFAEL LOBO,
EVERYTHINGISNEW e ANITTA:

- Estanqueidade total: cada sócio vê só o seu fechamento, sem qualquer referência
  a outros sócios ou fechamentos; troca de identidade sem cache suja.
- RAFAEL LOBO 596.133,45 − ANITTA 70% = 178.840,04 → 20% = **35.768,01**.
- EVERYTHINGISNEW: cascata 119.226,69 + 262.459,85 + 72.250,52 + 93.969,63 =
  547.906,69; parte **273.953,34**; base a transferir **230.990,35** com receitas
  em poder itemizadas.
- ANITTA "ANITTA 70% · Sócios locais 30%" = **417.293,42**.
- PDFs gerados do Portal para os três. Utilizador de teste devolvido a sem sócio.
- Ligações reais: lobo→RAFAEL LOBO, taniatadeu→EVERYTHINGISNEW, marianna→ANITTA.

**P2-13 concluída** (issue #168 a fechar com este resumo).

## 8. Pendentes menores registados

- `suppliers.doc_locale` da ANITTA → `pt-BR` (DML do Pedro).
- ANITTA duplicada na empresa Coala (`d24f8f88…`), sem uso.
- Descrições de linhas de BP com "· EIN" visíveis ao sócio (P2).
