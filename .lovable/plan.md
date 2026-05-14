
# Plano — Filtros Tipo + Nível no Relatório Business Plan

## Investigação concluída

**Componente alvo:** `src/components/ReportPL.tsx` (rota `/relatorios/business-plan` via `src/pages/ReportPLPage.tsx`). É este o "Relatório Business Plan" (Previsão vs Realizado por evento). Não confundir com `ReportBPTransactions` (BP x Transações de Despesas — outro relatório).

**Exporters:** `src/lib/export-pl.ts` (PDF jsPDF + Excel xlsx) — duplica a lógica de `buildPL`/`mergeGroups` do componente.

**Hierarquia:** `src/lib/category-hierarchy.ts`
- L1 = root (ex.: "Rendimentos", "Custos do Evento")
- L2 = group (ex.: "Vendas", "Artístico")
- L3 = leaf (ex.: "Bilheteira", "Cachês", "Aéreo") — **é onde transações/forecasts são lançados** (Core rule: "Only L3 nodes are selectable")
- `aggregateByHierarchy` hoje agrega **sempre por L2** com L3 como detalhe.

**Default sugerido para BP:** **Nível 2**. Razão: é exatamente o que o relatório já mostra hoje (compromisso entre legibilidade executiva e granularidade) e mantém comportamento por defeito inalterado. Nível 1 = visão macro (só "Rendimentos" / "Custos do Evento" / "Custos Corporativos"). Nível 3 = full drill-down (como o "expandir" atual).

## Especificação aplicada

| Seletor | Opções | Default |
|---|---|---|
| Tipo | Receitas / Despesas / Ambos | Ambos |
| Nível | 1 / 2 / 3 | 2 |

Regras:
- **Tipo = Receitas** → esconde bloco DESPESAS e linha RESULTADO LÍQUIDO; cards de topo mostram só Receitas Previstas/Reais.
- **Tipo = Despesas** → esconde bloco RECEITAS e RESULTADO; cards mostram só Despesas.
- **Tipo = Ambos** → comportamento atual.
- **Nível N** → contas exibidas só até nível N; valores dos níveis abaixo consolidados no pai. Linhas auxiliares (zonas/lotes de bilheteira, cachês por artista) **só aparecem em nível 3**.

## Ficheiros a alterar

1. **`src/lib/category-hierarchy.ts`** — generalizar `aggregateByHierarchy` para aceitar `level: 1 | 2 | 3` (default 2 = comportamento atual). Lógica nova:
   - Para cada item, resolver a chave de agregação consoante o nível: subir na cadeia `parentId` até chegar a L1/L2/L3 conforme escolhido.
   - Devolver `AggregatedGroup` igual à atual; quando `level=1` ou `level=3` o conceito "group + details" colapsa (details vazio em L1; details = própria linha em L3) — manter assinatura para não partir callers de DRE.
   - Adicionar helper `resolveAncestorAtLevel(catId, lookup, level)` reutilizável.
   - **Não tocar** em `aggregateByHierarchyDRE` ou outros consumidores; só adicionar o parâmetro opcional.

2. **`src/components/ReportPL.tsx`**
   - Estado novo: `typeFilter: 'income' | 'expense' | 'both'` (default `'both'`), `accountLevel: 1 | 2 | 3` (default `2`).
   - 2 `<Select>` ao lado do "Tipo de Relatório" (linha 706-717), num grid responsivo.
   - `buildPL` recebe `typeFilter` e `accountLevel`:
     - Filtra blocos receitas/despesas conforme `typeFilter`.
     - Passa `accountLevel` para `aggregateByHierarchy`.
     - Em nível ≠ 3: omitir `ticketLines` (zonas/lotes) e `cacheArtistLines` (cachês individuais) — ficam consolidados no agregado da L2/L1.
     - Em nível 1: render simplificado (sem `isGroupHeader` + details — só uma linha por L1).
     - Linha RESULTADO LÍQUIDO só quando `typeFilter === 'both'`.
   - Cards de topo (linhas 808-829) condicionais ao `typeFilter`.
   - Override badges + audit logs continuam a funcionar em nível 3; em nível 1/2 a contagem de overrides agrega para o pai (somar `overrideCount` dos filhos no agregador).
   - `getEffectiveData` e `eventSummaries` (cálculo dos cards por evento) **não mudam** — totais não dependem do nível.

3. **`src/lib/export-pl.ts`** — espelhar:
   - Assinatura de `exportPLToPDF` / `exportPLToExcel` ganha `typeFilter` e `accountLevel`.
   - `buildPL` interno reutiliza a mesma lógica do componente (manter paridade visual).
   - Cabeçalho do PDF e nome do ficheiro Excel passam a incluir os filtros (ex.: `BP_Receitas_Nivel2_<evento>.xlsx`) para auditoria.
   - Chamadas em `ReportPL.tsx` (linhas 761 e 788/796) passam os 2 novos parâmetros.

## Posicionamento UI

```text
┌─ Cenário (já existe) ──────────────────────────────────────────┐
├─ glass card "Configuração" ────────────────────────────────────┤
│  Tipo de Relatório: [Apenas Previsão ▼]                        │
│  Mostrar:           [Ambos ▼]   Nível de detalhe: [Nível 2 ▼] │  ← NOVO
│  ───────────────────────────────────────────                   │
│  Selecionar Eventos (existente)                                │
└────────────────────────────────────────────────────────────────┘
```

## Pontos de risco

1. **Linhas especiais em nível < 3.** Bilheteira por zona/lote e cachês por artista são "filhos virtuais" injetados no L3 "Bilheteira"/"Cachês". Em nível 1/2 têm de desaparecer e os seus totais já estão integrados no agregado pai (verificar dupla contagem). Mitigação: testar evento Coala (nível 2) e Mágicos H&K (nível 1) — totais devem bater com o card de topo.
2. **Master/Split + rateio (`getEffectiveData`).** A proração já está concluída antes do `aggregateByHierarchy`; mudança de nível não interfere com rateio Master ÷N.
3. **Audit logs por linha.** Hoje cruzam por `categoryName` (L3). Em nível 2/1 a tooltip "Histórico" deixa de fazer sentido por linha — esconder badge `History` quando `level !== 3` (não regredir, só não mostrar).
4. **Comparação com cenário (BP versions).** `scenarioForecasts` entram no `forecasts` antes do agregador → herdam o nível automaticamente.
5. **Tipo=Despesas + cachês.** O bloco de cachês (`calculateCacheLinesForPL`) injeta no array de despesas — manter; só se `typeFilter='income'` é que se ignora todo o bloco de despesas.
6. **Resultado por evento (header colapsado).** O "Previsto/Real/Variação" no cabeçalho de cada evento mostra resultado líquido. Quando `typeFilter ≠ 'both'`, mostrar só o lado relevante (Receitas Previstas vs Reais OU Despesas).
7. **Excel — nome de sheets.** Manter; só ajustar o título/cabeçalho da sheet com os filtros aplicados.

## Validação proposta (após aprovação e implementação)

- Evento Coala 2026 (Master): nível 1, 2 e 3 — totais Receitas/Despesas/Resultado têm de coincidir com o card de topo nas três vistas.
- Sub-evento de turnê (Mágicos H&K) com rateio Master: testar nível 2 + Tipo=Despesas, garantir que rateio aparece consolidado.
- PDF e Excel: abrir os 6 cruzamentos (3 níveis × 3 tipos) num evento e confirmar que totais e nome do ficheiro refletem os filtros.

## Não-objetivos (fora deste plano)

- Não alterar o relatório `BP x Transações` (`ReportBPTransactions.tsx`).
- Não alterar `aggregateByHierarchyDRE` nem outros relatórios (DRE, Cash Flow, etc.).
- Não persistir os filtros entre sessões (são estado local; pode-se acrescentar depois via `useUserPreferences` se quiseres).

---

**Aguardo aprovação para implementar.**
