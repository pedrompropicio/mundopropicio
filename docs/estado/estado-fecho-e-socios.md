# ESTADO — Fecho & Sócios

Atualizado: 2026-08-29 · Issues: `agora` #82 · `a-seguir` #64, #67 · `bloqueada` #64

## Em que pé está
O apuramento real dos fechos acontece **fora do ERP**, em planilha (gerador v15 para a Anitta). O ecrã "Fecho" do ERP calcula o nível 1 — resultado base e split pelas percentagens — mas não é hoje a fonte que os sócios veem. A Anitta está apurada e conferida mas **não sacramentada**: falta apresentar aos sócios (semana de 31/08) e pode haver ajustes depois. A Ivete ainda não fechou.

## A trabalhar agora
- **#82** — fecho selado: evento fechado tem de ser imutável a alterações de parâmetros. Precede a #64.

## Próximo passo concreto
**Antes da apresentação:** regerar a planilha da Anitta com o gerador v15. A base moveu +132,32 € desde 25/08 (11 transações "Extra Anitta Crew 17/07 - Per Diem", 2.687,03 €, criadas a 28/08). Resultado atual **593.988,29 €** contra 594.120,53 € na planilha.

## Bloqueios
- **#64 bloqueada até depois da apresentação de resultados.** Congelados: `event_partners`, `EventFecho.tsx`, `event_forecasts` da Anitta, gerador da planilha.
- Migração preparada e **NÃO corrida**: `suppliers.tax_country` + `expense_includes_iva` nullable + `update ... set null`.

## Factos que não se reinvestigam

**Regra da base de apuramento (decidida 29/08):** sede fiscal **PT** → apura s/IVA; sede fiscal **BR** → apura c/IVA. Receitas **sempre s/IVA** para todos. O critério é a sede fiscal, não a origem — COALA BRASIL (MANDO) é brasileira com sede em PT → s/IVA. A regra é default, sobreponível por contrato com justificação afirmativa.

**Classificação:** PT → MUNDO PROPICIO, EVERYTHINGISNEW, COALA BRASIL (MANDO). BR → ANITTA, SUPERSOUNDS, HENRY VARGAS PRODUCOES, VYBBE.

**Estado atual da BD:** as 8 linhas de `event_partners` estão todas a `expense_includes_iva = false`, campo `NOT NULL DEFAULT false`. Nenhum valor foi decidido — todos são o default.

**Ordenador ≠ pagador.** `can_order` = quem controla a geração do custo. `can_pay` = quem desembolsa. Na Anitta: ANITTA ordena e **não** paga; EIN ordena **e** paga. Quando o sócio ordena mas não paga, **quem paga é sempre a MP**.

**A MP é detentora da receita do evento** — a bilheteira está em nome dela. Logo a MP pagar despesa ordenada por sócio **não é adiantamento**; é pagar custo do evento com dinheiro do evento. O que gera crédito é o inverso: a EIN, que paga do bolso dela, tem de ser reembolsada (linha "financiamento" 879.721,65 € na planilha).

**O ERP para no nível 1.** Nível 2 — cascata MP/EIN, ativos exclusivos (bares 93.969,63 · Bengaleiro 138,82 · Oeiras 50.000), encontros de contas — é negociado caso a caso e vive na planilha. `event_partners` **não** ganha conceito de ativo por sócio.

**Conferência Anitta 29/08:** receitas **2.527.352,94 €** batem ao cêntimo (bilheteira 27.047 bilhetes → 2.286.981,13 s/IVA + 240.371,81 de transações). Despesas s/IVA 1.667.019,55 (BP 1.603.475,44 + excedido 63.544,11). Detector das 5 taxas públicas limpo (todas a IVA 0%). O resultado do evento usa despesas **c/IVA**.

## Onde ler mais
- `docs/procedimentos/PROC-fecho-evento.md`
- `.lovable/memory/features/fecho-filter-parity.md`, `event-financial-cards.md`
- Issues #64 (decisão completa em comentário), #82, #67
