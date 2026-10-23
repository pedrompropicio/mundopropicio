# #339 — Plano: fórmula em receitas (A), receitas no Master (B), rateio de receitas (C)

## Factos confirmados nesta leitura (Live + código)

- Live, versão activa: SM Lisboa e SM Porto têm cada uma uma linha de RECEITA `1.3.04 "Ticketline — Revenue Share 2,5% l vendas online"`, `formula_type='fixed'`, sem parâmetros: Lisboa 4.200,75 · Porto 5.278,875 (3 casas decimais). É 2,5% (não 2%) e sobre "vendas online" — não sobre toda a bilheteira.
- Live: SM Porto tem a despesa `2.6.07 "2% de comissão ticketline"` com fórmula (2%, base líquida 241.934,10 → 4.838,68, overhead). Em SM Lisboa a pesquisa não devolveu linha equivalente — confirmar no passo A0.
- `BpFormulaPanel` filtra `.eq("type","expense")` e exclui linhas de cachê → linhas de receita nunca aparecem no painel.
- `useSyncFormulaForecasts` não filtra por tipo (lê por `formula_type`), mas no Master devolve `masterBlocked` e não recalcula.
- O motor `bp-formula.ts` é neutro quanto ao tipo (calcula um valor a partir de vendas/convites).
- `computeMasterQuota(masterCost, n)` = divisão igualitária ÷N; usado só no card de custos (`useEventFinancialCardData`).
- `event-revenue-basis.ts`: "outras receitas" = linhas de BP `income` da versão activa não cobertas por sintéticas; perímetro da raiz já junta Master + cidades.
- `real-cache-calc.ts`: a base do cachê é SÓ `ticket_sales` (bruta/líquida); linhas de BP de receita não entram no cachê.
- `TransactionFormModal`: o interruptor de rateio não depende do tipo (aparece também em Receita). Verba e linha de BP por perna usam `form.type`. Retenção na fonte e sócio ordenante/pagador só em despesa.
- Conciliação (`reconcile.ts`): só liga linha do banco a transações existentes; não há confirmação lida aqui de como trata uma mãe sem evento com crédito — fica para C1.

Não lidos nesta sessão (a ler antes de executar): corpo e comentários da Issue #339 (github-issues dá 401), `docs/INDEX.md`, D24/D-ERP127 completos.

---

## A — Fórmula em linhas de RECEITA

O que assume despesa hoje: só o painel (filtro `type='expense'`, textos "custo"). Motor e hook não.

Como entra nos números (sem tocar na SSoT):
- O valor calculado grava em `event_forecasts.amount` da linha de receita (via a RPC observada, mesma auditoria). A receita do BP, o "previsto corrente" e o resultado passam a vê-lo pelo caminho que já existe: bucket "Outros" de `event-revenue-basis` (linha 1.3.x não é classe com módulo). Nenhum cálculo novo de receita.
- Linhas sintéticas 1.1.01 / 1.1.03: a fórmula fica proibida em linhas dessas classes (a sintética já as substitui — #220). Regra no painel e no hook: recusa `formula_type` em 1.1.01/1.1.03.
- Cachê: não muda (base continua `ticket_sales`). Se o Pedro quiser que o revenue share conte para o cachê, é decisão nova (pergunta 3).
- Chão #240 (não descer abaixo do realizado): em receita o realizado são transações `income` da linha — mesma regra, mesmo aviso.

DDL: nenhuma (`formula_type` é texto, `formula_params` já é jsonb).

Ficheiros: `BpFormulaPanel.tsx` (tirar o filtro de tipo, rótulos por tipo, recusa 1.1.x), `useSyncFormulaForecasts.ts` (recusa 1.1.x, chão em receita), `bp-formula.ts` (só `describeBpFormula` se o texto disser "custo"), form inline/Planilha (bloqueio já genérico — confirmar).

Testes vitest: cálculo 2,5% bruta/líquida com zonas e mín/máx numa linha income; recusa em 1.1.01/1.1.03; receita do evento com a linha de fórmula conta uma vez em "Outros"; chão em receita.

Aceitação (A0 — query a Live antes): base de "vendas online" Ticketline em SM Lisboa e SM Porto (por zona/canal?) e valor esperado vs 4.200,75 / 5.278,875. Se "online" não for filtrável por zona, a fórmula só serve sobre bilheteira total (pergunta 1).

Eventos fechados/selados: o hook já só corre em eventos abertos; acrescentar teste que garante que eventos `completed`/selados não recalculam. Nenhuma conversão de linha existente sem Sim.

Passos: A0 query (R0) · A1 código + testes (R1) · A2 converter as 2 linhas SM em Live (R2, Sim).

## B — Receitas no Master repartidas pelas cidades

Modelo de dados (onde vive a regra): coluna nova em `event_forecasts` (só para `type='income'` no Master): `revenue_split_mode` (`equal` | `fixed_pct` | `ticket_share`) + `revenue_split_params` jsonb (`{event_id: pct}` para `fixed_pct`). Sem linhas físicas nas cidades — espelho do modelo B dos custos (proração virtual).

Simetria: função pura nova `computeMasterRevenueQuota(line, cities, ticketRevenueByCity)` ao lado de `computeMasterQuota` em `event-cost-basis.ts` (ou `settlement-revenue.ts`); `equal` reutiliza `computeMasterQuota`.

Como aparece:
- BP do Master: a linha inteira, com etiqueta da regra.
- BP de cada cidade: linha virtual "via Master" só de leitura com a quota (como o overhead).
- Resultado: na raiz (Master+cidades) conta a linha do Master uma vez; numa cidade conta só a quota. Implementado dentro de `event-revenue-basis` (único sítio), com um parâmetro de "vista de cidade".
- Cachê de cada cidade: não muda (base `ticket_sales`), salvo decisão contrária.

Sem dupla contagem: regra única — no perímetro da raiz entra a linha do Master e nunca as quotas; na cidade entra a quota e nunca a linha do Master. Teste: Σ quotas = linha do Master ao cêntimo (resto ao último) e receita da raiz igual antes/depois de ligar a regra.

Fórmula de A no Master: só depois de A estável. Base = Σ bilheteira das cidades; exige levantar o `masterBlocked` só para receita (pergunta 4). Recomendo fase separada (B3).

DDL (migração + rollback byte a byte em `supabase/manual/`): 2 colunas nullable com CHECK nos valores; rollback = DROP das 2 colunas (só aplicável sem dados). Sem RLS nova (herda da tabela).

Ficheiros: migração 02xx, `event-revenue-basis.ts`, `useEventRevenueBasis`, `useEventFinancialCardData`, `EventForecast.tsx` (linha virtual), Fecho/Portal só se lerem receita por cidade (levantar em B0).

Eventos fechados/selados: colunas novas ficam NULL → números iguais; teste de regressão com Turnê Simone Mendes e Anitta EDA (receita e resultado ao cêntimo antes/depois).

Passos: B0 inventário de leitores de receita por cidade (R0) · B1 migração + rollback (R2, Sim) · B2 código + testes (R1) · B3 fórmula no Master (R1/R2, depois).

## C — Rateio multi-evento em RECEITAS

Já hoje: o interruptor aparece em Receita e grava mãe sem evento + filhas por evento, com verba por linha usando `form.type`.

A verificar em C1 (leitura + testes, sem mudar nada): validação "perna sem linha de BP" com linhas `income`; status da mãe/filhas (pago/recebido); aviso de verba excedida (em receita exceder não é problema — deve ser informativo); diálogo de "reforço local" (`masterDetection`) não deve aparecer em receita; agregações de empresa excluem filhas (`isRateioChild`, neutro ao tipo — confirmar em DRE e saldo de conta).

Conciliação (D-ERP127): um crédito do banco liga à MÃE (é ela que tem `account_id` e move o saldo); as filhas herdam o pago. Teste: crédito único de X ↔ mãe income X com 3 filhas → conciliado, 0 filhas ligadas ao banco.

Ficheiros: `TransactionFormModal.tsx`, `TransactionSplitConfig.tsx` (textos "despesa", aviso de excesso), `reconcile.ts` só se C1 mostrar falha.

DDL: nenhuma prevista.

Testes: perna income com linha de BP do seu evento; Master como uma perna só (D-ERP72 R2); excesso em receita não bloqueia; exclusão de filhas na empresa; conciliação crédito→mãe.

Eventos fechados: nenhum dado muda; só regras de formulário.

Passos: C1 diagnóstico + testes que falham (R1) · C2 correcções (R1).

---

## Ordem recomendada

A (A0→A1) → C (C1→C2) → B (B0→B1→B2) → A2 e B3 com Sim.
A é pequena e sem DDL; C é independente e só formulário; B é a única com DDL e mexe na SSoT.

## Riscos

- Mexer em `event-revenue-basis` (B) altera todos os cards de receita — mitigado por testes de regressão ao cêntimo em eventos fechados.
- Revenue share Ticketline sobre "online" pode não ter base filtrável → fórmula imprecisa.
- 3 casas decimais em Porto (5.278,875) — arredondamento ao gravar.

## Perguntas em aberto para o Pedro

1. Em Live a linha é "Revenue Share 2,5% … vendas online" (1.3.04), não 2%. A taxa é 2,5%? A base é só vendas online da Ticketline ou toda a bilheteira? (Recomendo: só Ticketline, se der para filtrar por fonte.)
2. Bruta ou líquida para o revenue share? (Recomendo: bruta, como a comissão da despesa estava antes.)
3. Receita de fórmula entra na base do cachê? (Recomendo: não — o cachê continua só bilheteira.)
4. Em B, a fórmula pode correr no Master sobre Σ cidades? (Recomendo: sim, mas só em B3.)
5. Em B, `ticket_share` usa bilheteira líquida real ou previsto corrente antes do evento? (Recomendo: previsto corrente antes, real depois — como em A.)
6. Em C, exceder a verba de uma linha de receita deve só avisar? (Recomendo: só avisar.)
7. SM Lisboa tem despesa "2% comissão ticketline" com fórmula como Porto? A leitura não a encontrou.
