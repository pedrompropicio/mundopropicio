# Estado — Fecho, Fechamentos e Sócios

Actualizado em 2026-10-23. **Frente sem trabalho em curso.** #342, #344 e #345 publicadas. Pendente fora da frente: reimplantar a edge function `partner-statement` para o Portal do Sócio receber o resumo por origem (#344) e os detalhes C/D (#345) — R2, pedido ao 0 · Cowork.

## Em vigor

- **Prestação de contas do sócio — detalhe das despesas pagas pelo sócio e dos extras (#345, g20).** No detalhamento, a seguir ao B: "C. Despesas do evento pagas por <sócio>" (Data | Descrição | Rubrica | Valor — transações pagas pelo sócio + linhas de BP pagas por ele sem transação, e no fim os ajustes ao desembolso) e "D. Extras de <sócio>" (Data | Descrição | Origem | Valor). Somas iguais ao cêntimo aos totais da secção 5 ("+ Despesas do evento pagas por…" e "- Extras"), que não mudam. Secção sem linhas não aparece. Normalizadores únicos no gerador partilhado (`paidByPartnerDocLines`, `partnerExtrasDocLines`) usados pela equipa (`buildSoloDocInput`) e pelo Portal (`statement-service.ts`), com a mesma regra de base dos totais. Export da equipa: activo desde o Publish de 23/10. Portal: só depois de reimplantar a `partner-statement`.
- **Prestação de contas do sócio — receitas resumidas por origem (#344, g19).** A secção "2. AS RECEITAS DO EVENTO (s/IVA)" mostra uma linha por origem, na ordem da primeira aparição; o detalhe "A. Receitas linha a linha" continua com todas as linhas. Agrupamento no gerador partilhado (`buildPartnerStatementDoc` › `revenueGroups`), reconciliado ao cêntimo com o total. Export da equipa: activo desde 23/10. Portal: só depois de reimplantar a `partner-statement`; até lá mostra a lista antiga, sem erro.
- **Prestação de contas do sócio — seletor de colunas das despesas (#342, g18, D-ERP299).** Separador Fecho › "Critério" › "Despesas no documento": "Detalhado (Valor · IVA · Total)" (omissão) ou "Só total pago". Guardado por utilizador e evento. Só activo com base efectiva das despesas c/IVA; com base s/IVA fica desactivado e o documento sai detalhado. Em "Só total pago": colunas "Valor", títulos sem rótulo de base, sem a nota do art. 18.º CIVA, **nenhuma expressão "c/IVA" no documento**. Totais, resultado, parte do sócio e base a transferir iguais nos dois modos. Portal e relatório de gestão sempre detalhados.
- **Overhead (D-ERP211, decidido 10/10/2026):** entra no acerto dos sócios só por `events.cost_include_overhead`; `exclude_from_result` nas linhas de overhead governa só o resultado do evento.
- **Documento do sócio estanque (g4/g5):** só o destinatário pelo nome; base de cálculo é a do fechamento; linha final parte · + desembolso · ± ajustes · − receitas em poder do sócio · − extras/adiantamentos · = base a transferir · + IVA 23% se `transfer_with_vat`. SSoT: `src/lib/partner-disbursement.ts`.
- **Portal do Sócio (14/09):** N utilizadores → 1 sócio pelas RPC `set_partner_portal_user` / `unset_partner_portal_user`; base de IVA pela configuração (`partnerUsesGrossExpenses`, D-ERP9); sem sócio resolvido não há números; "Ver como sócio" autorizado no servidor; o Portal nunca calcula o fecho (números do `partner-statement`).

## A trabalhar agora

Nada.

## Pendências

1. **Reimplantar `partner-statement`** (R2, 0 · Cowork com "Sim" do Pedro) para o Portal do Sócio passar a mostrar o resumo de receitas por origem (#344) e os detalhes C/D (#345). Uma só reimplantação cobre as duas. Pedido no QUADRO, secção 0 · Cowork (Claude).
2. Herdadas de 14/09/2026, por reverificar em Live antes de agir:
   - destino de `expense_includes_iva`: o motor ignora-o (g4); `partner-calc-basis.ts` lê-o. Caso conhecido em 14/09: EVERYTHINGISNEW na Anitta EDA 2026;
   - remover o fallback por coincidência de email em `user_supplier_id`;
   - nenhum sócio tinha a permissão `view_partner_transactions` em 14/09.

## Bloqueios

Nenhum.

## Fechado a 23/10/2026

- **#345** — detalhes C (despesas pagas pelo sócio) e D (extras) no detalhamento (commit 76ebd35; 8 testes novos; suite 2.216 → 2.224 PASS / 6 skip / 11 todo; tsgo 0; relatório `docs/testes/issue345-detalhe-desembolso-extras.md`). Publicada e testada pelo Pedro no export da equipa (Ivete Clareou 2026 · SUPERSOUNDS).
- **#344** — receitas resumidas por origem na secção 2 (commit b76f150; 13 testes novos; suite 2.210 PASS; tsgo 0; relatório `docs/testes/issue344-receitas-por-origem.md`). Publicada e verificada pelo Pedro no export da equipa: total das receitas 575.355,39, detalhe A com 20 linhas.

## Fechado a 22/10/2026

- **#342** — seletor "Só total pago" na prestação de contas (commit 71d920c; 7 testes novos; suite 2161 PASS; tsgo 0). Verificado no ecrã pelo Pedro com Ivete Clareou 2026 · SUPERSOUNDS (PDF e Excel). Publicada a 22/10/2026.

## Factos que não se reinvestigam

- O export da equipa (separador Fecho) monta o documento no browser com o gerador partilhado; o Portal do Sócio recebe o documento já montado pela edge function `partner-statement`. Mudança no gerador partilhado chega à equipa com o Publish e ao Portal só com a reimplantação da função.
- As linhas de C e D saem das mesmas fontes e da mesma regra de base que os totais da secção 5, nos dois lados (equipa e Portal); a reconciliação ao cêntimo só absorve arredondamento.
- Receita de bilheteira soma-se por `ticket_sales.total_value` (fallback `quantity × unit_price` só se NULL), regra única `ticketSaleRevenue` (D-ERP286): cachê = card = fecho.
- `has_permission` depende de `current_company_id()` e dá falsos negativos em service_role — medir com `has_permission_in`.
- `iva_rate` é inteiro: em SQL usar `/100.0`.
- O seletor de colunas das despesas, o resumo por origem e os detalhes C/D só mudam a apresentação do documento; nunca mexem em totais nem na base de cálculo.
- Escrita R0 em docs/ pelo conector GitHub do Claude: a 23/10/2026 deu 403 "Resource not accessible by integration" (permissões da app do Claude no repositório); passou depois de o Pedro rever as permissões. Ficheiros grandes (ex.: docs/QUADRO.md, ~100 KB) continuam a ir pelo agente, limitado a docs/.

## Onde ler mais

- `.lovable/memory/features/partner-settlement.md` (g4, g5, g18, g19, g20)
- `.lovable/memory/features/partner-rls-and-bp-edit.md`
- `docs/DECISIONS.md` (D-ERP9, D-ERP63 → D-ERP66, D-ERP211, D-ERP299)
- `docs/testes/issue344-receitas-por-origem.md`, `docs/testes/issue345-detalhe-desembolso-extras.md`
- `docs/handoffs/2026-09-14-portal-do-socio.md`, `docs/handoffs/2026-09-13-fecho-e-socios-g7-g17.md` (arquivo)
