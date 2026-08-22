# PDF do BP — "previsto + excedido" (layout validado no Excel)

## Trava anti-reinvestigação: o que já existe

- `src/lib/export-event-bp-pdf.ts` (837 linhas) — **relatório de conferência** do BP: cartões de resumo, identidade do evento, tabelas Receitas/Despesas, log de auditoria, comparação com transações. Já é jsPDF + jspdf-autotable, **paisagem A4**, multi-página, com contexto de render partilhado (`RenderContext`) e rodapé. É o botão "PDF" que já está no `EventForecast.tsx`.
- `src/lib/export-partner-bp-pdf.ts` — versão do sócio: hierárquica L1>L2>L3, mas só 2 colunas (categoria/valor) e sem excedido, sem ordenador, sem anexos.
- `src/lib/export-header.ts` — já resolve branding (logo de `companies.logo_url` → data URL, fallback para asset local) e desenha cabeçalho institucional em PDF.

**Recomendação: criar um exportador novo** `src/lib/export-bp-committed-pdf.ts`, reaproveitando a infra existente (jsPDF + autoTable + `export-header.ts`). Justificação: o exportador atual é um *relatório de conferência* com propósito e estrutura diferentes (não hierárquico, com auditoria); enxertar-lhe um segundo layout de 7 colunas com 4 níveis tornaria-o difícil de manter. **Nenhuma biblioteca nova** — jsPDF/jspdf-autotable já cobrem cabeçalho repetido, faixas coloridas, zebra e paisagem.

## Logo

O logótipo do ERP é `src/assets/logo-horizontal.png` (usado por `BrandedLogo.tsx` e por `export-header.ts` via `?inline`). O novo exportador usa `fetchExportBranding()`, que já lê `companies.logo_url` da empresa ativa e cai para esse asset quando está NULL — exactamente o comportamento pedido. Preencher o `logo_url` da Mundo Propício fica como acção manual tua no `/admin/empresas` (upload no bucket público `company-logos`); não faz parte deste plano de código.

## Dados

Uma função `fetchCommittedBpBundle(eventId, includeChildren)`:

1. `events` (nome, data, recinto/venue, cidade).
2. `event_forecasts` da versão ativa (`version_id IS NULL`), `type='expense'`, **`status='approved'`** (draft fica fora — é a divergência dos 1.560,00 €), com `account_categories(code, name)` e `ordering_partner_id`.
3. `account_categories` para reconstruir L1/L2/L3 a partir do código.
4. `transactions` do evento (+ filhos) com `FECHO_TX_FILTER_COLUMNS`, filtradas por `isValidFechoTransaction` de `fecho-filters.ts`, e `forecast_id`/vínculo FK para saber quais estão reclamadas.
5. `event_partners` + `suppliers.name` para o ordenador; sem ordenador → `MP`.
6. Contagens de anexos: `event_forecast_attachments` (por `forecast_id`) e `transaction_documents` (por `transaction_id`).

## Cálculo (reaproveitado, não refeito)

- Excedido por rubrica L3: `computeOverrunMap` + `sumExcess` de `src/lib/event-cost-basis.ts`, com previsto = Σ linhas aprovadas da L3 e realizado = Σ transações válidas da L3.
- IVA do excedido: **taxa ponderada** das transações que compõem o excesso da rubrica (Σ IVA / Σ base dessas transações), não a taxa da linha de BP. Na Anitta dá 0%.
- IVA por linha de BP = `amount × iva_rate/100`; Total c/IVA = soma.
- Ordenador: `effectiveTransactionOrderer` / `orderingPartnerInitials` já existem em `ordering-partner.ts`; aqui usamos o **nome do sócio** (não iniciais) e `MP` no vazio.

## Layout do PDF

Paisagem A4, margens 10 mm, `autoTable` único com `head` repetido em todas as páginas, `theme: 'plain'` (sem grelha).

Colunas: `Código` · `Descrição` · `Ordenador` · `Anexos` · `Valor s/IVA` · `IVA` · `Total c/IVA` (3 últimas alinhadas à direita).

Cabeçalho: logo à direita; nome do evento em destaque; subtítulo `Visão previsto + excedido · valores por linha, com totais por nível`; 3.ª linha com data e recinto.

Linhas:
- **L1** — fundo escuro (#1f2937), texto branco, negrito.
- **L2** — cinzento médio, negrito.
- **L3** — cinzento claro, negrito.
- **Linha de BP** — sem fundo, zebra subtil, descrição indentada, coluna Código vazia.
- **Excedido** — imediatamente após as linhas da L3: `Excedido — realizado acima do previsto nesta rubrica`, itálico, cor de destaque suave.
- **Total geral** — faixa de destaque, texto branco.

Sem observações nem rodapé de notas.

## Anexos

- Linha de BP: anexos próprios (`event_forecast_attachments`) + `transaction_documents` das transações vinculadas por FK a essa linha.
- Totais L3/L2/L1 e geral: soma das linhas **+** documentos das transações da rubrica **não vinculadas** a nenhuma linha (senão o total fica abaixo do real). Alvo Anitta: 402.
- Texto `"XX Anexos"`.

## UI

Botão `PDF (previsto + excedido)` em `EventForecast.tsx`, ao lado do PDF existente (mesmo estilo, ícone `FileSpreadsheet`), com estado `exportingCommittedPDF` e toasts iguais.

## Validação

Alvo: total s/IVA da Anitta = **1.657.034,63 €** (bate ao cêntimo com o card Despesas); `2.2.01 Aéreo` com excedido 57.784,01 e rubrica a fechar em 157.694,10; anexos totais 402. QA visual via `pdftoppm` das páginas geradas.

## Nada impraticável

Todos os pontos do layout são suportados por jspdf-autotable. Única nota: "ajustar à largura" é resolvido com larguras fixas de coluna somando a largura útil da folha, não com um flag de impressora.
