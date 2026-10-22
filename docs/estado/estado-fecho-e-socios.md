# Estado — Fecho, Fechamentos e Sócios

Actualizado em 2026-10-22. **Frente sem trabalho em curso.** #342 publicada (22/10/2026).

## Em vigor

- **Prestação de contas do sócio (PDF/Excel) com seletor de colunas das despesas (#342, g18).** No separador Fecho › "Critério" › "Despesas no documento": "Detalhado (Valor · IVA · Total)" (omissão) ou "Só total pago". Guardado por utilizador e evento (localStorage). Só activo quando a base efectiva das despesas do documento é c/IVA; com base s/IVA fica desactivado, com a razão no ecrã, e o documento sai detalhado. Em "Só total pago": secção 3 "Família | Valor", detalhe B "Rubrica | Valor | Anexos", títulos sem rótulo de base, sem a nota do art. 18.º CIVA, **nenhuma expressão "c/IVA" em parte nenhuma do documento** (regra do Pedro, testada). Receitas mantêm "(s/IVA)". Totais, resultado, parte do sócio e base a transferir iguais ao cêntimo nos dois modos. Portal do Sócio e relatório de gestão não usam o seletor (sempre detalhado). Ver `.lovable/memory/features/partner-settlement.md` › (g18) e a decisão registada hoje em DECISIONS.md.
- **Overhead (D-ERP211, decidido 10/10/2026):** entra no acerto dos sócios só por `events.cost_include_overhead`; `exclude_from_result` nas linhas de overhead governa só o resultado do evento.
- **Documento do sócio estanque (g4/g5):** só o destinatário pelo nome; base de cálculo é a do fechamento; linha final parte · + desembolso · ± ajustes · − receitas em poder do sócio · − extras/adiantamentos · = base a transferir · + IVA 23% se `transfer_with_vat`. SSoT: `src/lib/partner-disbursement.ts`.
- **Portal do Sócio (14/09):** N utilizadores → 1 sócio pelas RPC `set_partner_portal_user` / `unset_partner_portal_user`; base de IVA pela configuração (`partnerUsesGrossExpenses`, D-ERP9); sem sócio resolvido não há números; "Ver como sócio" autorizado no servidor; o Portal nunca calcula o fecho (números do `partner-statement`).

## A trabalhar agora

Nada.

## Pendências (herdadas de 14/09/2026 — por reverificar em Live antes de agir)

1. Destino de `expense_includes_iva`: o motor ignora-o (g4); `partner-calc-basis.ts` lê-o. Caso conhecido em 14/09: EVERYTHINGISNEW na Anitta EDA 2026.
2. Remover o fallback por coincidência de email em `user_supplier_id`.
3. Nenhum sócio tinha a permissão `view_partner_transactions` em 14/09.

## Bloqueios

Nenhum.

## Fechado a 22/10/2026

- **#342** — seletor "Só total pago" na prestação de contas (commit 71d920c; 7 testes novos; suite 2161 PASS / 6 skip / 11 todo; tsgo 0). Verificado no ecrã pelo Pedro com Ivete Clareou 2026 · SUPERSOUNDS (PDF e Excel). CI remoto não verificado pelo chat 7. Publicada a 22/10/2026.

## Factos que não se reinvestigam

- Receita de bilheteira soma-se por `ticket_sales.total_value` (fallback `quantity × unit_price` só se NULL), regra única `ticketSaleRevenue` (D-ERP286): cachê = card = fecho.
- `has_permission` depende de `current_company_id()` e dá falsos negativos em service_role — medir com `has_permission_in`.
- `iva_rate` é inteiro: em SQL usar `/100.0`.
- O seletor de colunas das despesas só muda colunas e rótulos do documento; nunca mexe em totais nem na base de cálculo.

## Onde ler mais

- `.lovable/memory/features/partner-settlement.md` (g4, g5, g18)
- `.lovable/memory/features/partner-rls-and-bp-edit.md`
- `docs/DECISIONS.md` (D-ERP9, D-ERP63 → D-ERP66, D-ERP211 e a decisão #342 de 22/10)
- `docs/handoffs/2026-09-14-portal-do-socio.md`, `docs/handoffs/2026-09-13-fecho-e-socios-g7-g17.md` (arquivo)
