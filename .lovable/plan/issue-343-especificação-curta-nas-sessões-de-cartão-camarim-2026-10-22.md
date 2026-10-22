# Issue #343 — Especificação curta nas sessões de cartão/camarim + recolher na lista

## Passo 0 (no início da implementação)
Reserva em `docs/QUADRO.md` › "Em execução agora": `| #343 | 6 · vinculo-bp-transacoes (Claude) | agente Lovable, autorizado pelo Pedro a 22/10/2026 | close-card-session, close-camarim-session (só geração de transactions.specification), lista de Transações (render da especificação), testes | <UTC> | modo plano |`. Não escrita agora: o modo plano só permite editar o plano; entra como primeiro passo após aprovação.

## A) Gerador — só o texto de `specification`

Novo módulo puro `supabase/functions/_shared/session-specification.ts`:
- `buildCardSessionSpecification({ cardName, holderName, eventName|null, catCode, catName, itemCount, ivaRate })` → linhas:
  `Sessão de cartão: <cartão> · portador <nome>` / `Evento: …` (ou `Sem evento (custo de estrutura)`, como hoje) / `Rubrica: <código> — <nome>` / `Itens consolidados: N` / `IVA: x%`.
- `buildCamarimSessionSpecification({ title, itemCount, originLabel, ivaRate, ivaDriftNote|null })` → `Sessão de Camarim: …` / `Itens consolidados: N` / `Origem: …` / `IVA: x%` / linha do desvio do IVA quando existe (mesmo texto de hoje).

`close-card-session/index.ts` (~l.659–677): retirar `supplierList`, `detail` e a linha em branco; `specification = buildCardSessionSpecification(...)`.
`close-camarim-session/index.ts` (~l.662–721): retirar `supplierList` e a linha "Fornecedores:"; `specification: buildCamarimSessionSpecification(...)` (o `ivaNote` passa a entrar pelo helper).

**Ponto a confirmar:** o camarim também grava hoje uma linha `Análise: Bebidas: x€ (n) · Comida: …` (resumo por etiqueta). Não está na lista do pedido → o plano RETIRA-A (com `tagAgg`/`TAG_LABEL` se ficarem sem uso). Se quiseres mantê-la, diz e fica.

Não muda nada mais nas duas funções: descrição, valores, IVA/snap, grupos, estados, pagamentos, documentos, dossier, auditoria, acerto da sessão (o `spec` do acerto, l.~926, fica igual). Só afecta transações criadas depois do deploy; as existentes ficam como estão (sem DML).

## B) Lista de Transações
Componente exato: `src/components/TransactionRow.tsx` l.544–545 (`<p className="text-xs text-muted-foreground">{t.specification}</p>`).
- Passa a `line-clamp-2` + `whitespace-pre-line`, com estado local `expanded`; clicar alterna expandir/recolher (`stopPropagation` para não abrir o modal da linha), `aria-expanded`, `title` "Mostrar mais/menos". Vale para qualquer transação.
- Só mostra cursor/afordância quando o texto tem mais de 2 linhas ou >~140 caracteres (heurística simples: contém `\n` ou comprimento).

## C) Testes (vitest)
- `src/lib/__tests__/session-specification.test.ts` (importa o helper partilhado): cartão e camarim — linhas exatas pedidas; sem "Fornecedores:"; sem linhas de itens (sem `€` de itens nem datas); evento nulo → "Sem evento…"; desvio de IVA presente/ausente.
- `src/components/__tests__/TransactionRow-specification.test.tsx`: classe `line-clamp-2` por omissão; clique remove-a e volta a pô-la; clique não dispara o `onClick` da linha.
- tsgo + suite completa com antes/depois.

## Ficheiros a tocar
- `supabase/functions/_shared/session-specification.ts` (novo)
- `supabase/functions/close-card-session/index.ts` (só bloco da specification + import)
- `supabase/functions/close-camarim-session/index.ts` (só bloco da specification + import)
- `src/components/TransactionRow.tsx`
- 2 testes novos; `docs/QUADRO.md` (reserva); memórias `card-sessions.md` e `camarim-integration-flow.md` (nota curta da nova especificação)

## Nota de deploy
As duas alterações em edge functions exigem deploy delas (fora do R1 habitual "sem edge functions"). Precisa do teu Sim explícito para o deploy; sem ele, implemento código + testes e deixo o deploy pendente.
