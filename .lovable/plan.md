# (g4) Documento do sócio no padrão da prestação de contas + base por fechamento

## Assunções
- `suppliers` não tem campo de país (só `nif`). Assumo que é preciso a coluna nova
  `suppliers.doc_locale text not null default 'pt-PT'` (valores `pt-PT` / `pt-BR`) —
  DDL apresentada antes de aplicar, migration rastreada, sem DML.
- `exceljs`, `jspdf` e `jspdf-autotable` já existem: nada a instalar.
- Sem Publish. Nenhum DML. Não toco no perímetro (g3) nem nas conferências C1/C2.

## Passo 1 — Motor: a base é do fechamento (decisão A)
`src/lib/event-settlement-engine.ts`
- Base do nó: raiz → `events.partner_calc_basis`; filho → `parent_share_basis`
  (`net_result_gross_expenses` = c/IVA, `net_result` = s/IVA). Nova propriedade
  `nodeUsesGrossExpenses` em `SettlementNodeResult`.
- Todos os participantes do nó (casa incluída) usam a base do nó.
  `expense_includes_iva` deixa de ser lido (coluna fica, comentário a explicar);
  fim da regra "casa sempre s/IVA" para fechamentos.
- O residual da MP absorve a diferença de IVA: termo `ivaDeductible` passa a ser
  Σ por nó de (R_s − R_c) menos o IVA já devolvido por regra a um filho.
- Testes: Anitta a três níveis mantém os números; casos de base mista passam a ter
  a casa na base do contrato, com o total da MP (parte + residual) inalterado.

## Passo 2 — Documento do sócio (decisões B e C)
Novo `src/lib/partner-statement-doc.ts` — construtor único, puro e testável:
- Entrada: nó do motor, participante destinatário, linhas do perímetro (receitas e
  despesas), categorias, nº de anexos por rubrica, locale.
- Colapso estanque: destinatário pelo nome; todos os outros numa linha
  `Sócios locais — NN%` (= 100 − % do destinatário); se o único outro for a casa,
  `Mundo Propício — NN%`. Nunca outros nomes, %, bases, "nível", "fechamento".
- Secções 1 a 5 conforme o padrão da prestação de contas, mais o Detalhamento
  (A receitas linha a linha, B despesas família → rubrica → linhas com IVA,
  total c/IVA e nº de anexos, subtotais e nota do art. 18.º CIVA).
- Num filho: sem "resultado do evento acima"; a quota entra na secção 4 como
  "Quota contratual: NN% do resultado do evento" + activos adicionais + linha
  "IVA dedutível recuperado" quando a regra está activa.
- Vocabulário pt-BR (planilha, bilheteria, cota, centavo, fechamento) via tabela
  de termos por locale.

Novo `src/lib/export-partner-statement-doc.ts`:
- XLSX (exceljs): 2 folhas "Resumo do Fecho" e "Detalhamento", valores congelados
  (sem fórmulas), sem protecção de livro.
- PDF (jspdf + autotable) com as mesmas secções.
- Ficheiros `Prestacao_de_Contas_<evento>_<sócio>.xlsx` / `.pdf`.

`PartnerSettlementTab.tsx`: o export "de um sócio" passa a chamar o documento novo;
o export interno (sem sócio) mantém a peça de gestão actual. Portal do Sócio usa
o mesmo construtor.

## Passo 2b — UI da aba Sócios (acrescentos de 13/09)
- Cabeçalho: "(NN% atribuído)" deixa de somar participantes de fechamentos
  diferentes; passa a mostrar a percentagem POR fechamento
  ("Fechamento Anitta 100% · Fechamento Rafael Lobo 20% · …").
- Tabela de participantes: sai a coluna "Base IVA" e o "(herda)"; a base passa a
  aparecer uma única vez, junto ao nome do fechamento.
- Aviso "Fechamento X sem percentagem sobre o pai": confirmar no fim que
  desaparece nos dois filhos da Anitta e que o motor continua a ler
  `parent_share_pct` como antes (0 é válido, NULL só na raiz).

## Passo 3 — Prova
- Anitta / ANITTA (raiz) e Anitta / EVERYTHINGISNEW (MP + EIN): XLSX e PDF gerados
  em `/tmp`, convertidos em imagem e inspeccionados, com grep aos termos proibidos.
- Ivete / SUPERSOUNDS: documento bilateral pt-PT.
- Tabela antes/depois por evento: parte de cada sócio igual; casa + residual = total
  da MP de antes.
- Testes vitest (motor, documento, XLSX) + `tsgo` limpo.

## Passo 4 — Docs
DECISIONS (correcção da D25 + adenda g4), memórias `event-settlements`,
`partner-settlement` e export, `docs/estado/estado-fecho-e-socios.md` reescrito,
comentar e marcar (g4) na #146 pela edge function `github-issues`.

## Autorizações que peço agora
1. DDL `alter table public.suppliers add column doc_locale text not null default 'pt-PT'`
   (com `check (doc_locale in ('pt-PT','pt-BR'))`) — sem DML; quem for BR fica a
   configurar depois na UI ou por DML autorizado à parte.
2. Confirmar que o export interno de gestão (sem sócio) fica exactamente como está.
