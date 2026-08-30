# ESTADO — Fecho & Sócios

Atualizado: 2026-08-30 · Issues: #82 · a-seguir #64+#65, #85 · P0 aberto: #64

## Em que pé está
O apuramento real acontece **fora do ERP**, em planilha (gerador v15 para a Anitta). O ecrã de Fecho calcula o nível 1 e **não é confiável para o acerto** — ver #64. A Anitta está apurada e conferida, **não sacramentada**: apresentação aos sócios na semana de 31/08. A Ivete ainda não fechou.

## A trabalhar agora
- **#82** — fecho selado. Precede tudo o resto desta frente: sem selo, um fecho entregue recalcula-se sozinho quando alguém mexe num parâmetro.

## Próximo passo concreto
**Antes da apresentação:** regerar a planilha da Anitta com o gerador v15. E corrigir as três linhas de hospedagem a 0% (#68) — 33.783,35 €, pagador EIN, que vão sair a 6% na fatura dela e não batem com o BP.

## Bloqueios
- **#64 verificada a 30/08 e NÃO está corrigida.** O handoff de 23/08 dizia o contrário. A receita foi isolada, a despesa não: `expenseBase = basis.withVat ? gross : net` alimenta diretamente a quota do sócio. A #65 é a mesma ferida vista do `EventFecho` — tratam-se juntas.
- Congelados até depois da apresentação: `event_partners`, `EventFecho.tsx`, `event_forecasts` da Anitta, gerador da planilha.

## Factos que não se reinvestigam

**Regra da base de apuramento:** sede fiscal **PT** → apura s/IVA; sede **BR** → apura c/IVA. Receitas sempre s/IVA. O critério é a sede, não a origem. Falta o campo `suppliers.tax_country` — migração preparada, nunca corrida.

**O estado do seletor vive em `localStorage`, por utilizador e por evento.** O `partner_calc_basis` é só a semente inicial. Dois utilizadores podem ver acertos diferentes do mesmo evento. E o flag por sócio é `p.expense_includes_iva || basis.withVat` — só liga, nunca desliga.

**Duas superfícies com respostas diferentes:** o `ReportPartnerSettlement.tsx` calcula a quota só pelo `partner_calc_basis`; o PDF gerado dentro do Encontro de Contas herda o botão.

**O evento fecha pelo BP** (D-ERP3). Em co-produção a ausência de transações nas linhas pagas pelo sócio é o comportamento correto, não um buraco: na Anitta são 80 linhas e 970.107,35 €, das quais 77 com pagador sócio.

**Decisões de 30/08:** a última versão do BP deve conter só linhas com custo real — as previsões que não ocorreram ficam nas versões congeladas, e o snapshot faz-se **antes** da limpeza. O guarda-chuva de rubrica para despesas de equipa nasce **a zero** — previsto por gastar é custo fantasma. O sistema **não decide tratamento fiscal**: produz a composição por taxa, e uma pessoa decide o tipo do acerto (`redebito` ou `reembolso`).

**Anitta, três linhas sem transação e sem pagador sócio** (Estrutura WC CNA 9.745, Copos 9.120, Assessoria de Imprensa 2.500): confirmado pelo Pedro que **aconteceram** — estão à espera de fatura. Não zerar.

**Δ de método por reconciliar:** a query canónica de excedido dá 61.464,91 na Anitta contra os 63.544,11 do ecrã. 2.079,20 na rubrica 2.2.01 Aéreo. Enquanto não estiver fechado, número de fecho sai do ecrã ou da planilha, nunca de SQL ad-hoc.

**Nível 2 vive na planilha:** cascata MP/EIN, ativos exclusivos (bares 93.969,63 · Bengaleiro 138,82 · Oeiras 50.000), encontros de contas. `event_partners` não ganha conceito de ativo por sócio.

## Onde ler mais
- `docs/procedimentos/PROC-fecho-evento.md`
- `.lovable/memory/features/fecho-filter-parity.md`, `partner-settlement.md`, `event-cost-basis.md`
- Issues #82, #64, #65, #85, #68
