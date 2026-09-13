# HANDOFF — 2026-09-13 · fecho e sócios (g7 → g14)

> Arquivo. **Não é fonte de estado.** Para saber onde estamos, ver
> `docs/estado/estado-fecho-e-socios.md`.

**Frente:** fecho-e-socios · **Épico:** #146 · **Issues mexidas:** #158–#167
(fechadas)
**Executado em produção:** sim — dois Publish do Pedro (g7, g9c, g10, g11, g12,
g13, g13-b, g14) e DML autorizado nos dados da Anitta EDA 2026.

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

## 6. Fila

1. Devoluções ao Fechamento MP + EIN (Advogado 3.000, Equipa EIN 15.000, ~3 a
   identificar).
2. Prova formal contra a planilha v23.
3. Repetir auditoria de estanqueidade com utilizadores ligados (P2-13).
4. Selar os 3 fechamentos, fechar #146.
