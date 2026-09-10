---
name: Vendas de bilheteira somadas na BD
description: get_ticket_office_sales é a origem única das vendas por bilheteira/evento; nunca somar ticket_sales no cliente (limite 1.000 linhas do PostgREST)
type: feature
---

# Vendas de bilheteira: soma na base de dados (issue #129, 09/09/2026)

**Regra:** a soma das vendas de uma bilheteira — no total e por evento — é feita na
base de dados pela função `public.get_ticket_office_sales(p_account_id uuid)`.
Devolve `event_id`, `quantity` e `revenue = sum(coalesce(total_value, quantity*unit_price))`,
agrupado por evento pela ligação `ticket_sales.zone_id → event_ticket_zones.event_id`.
`SECURITY INVOKER` + `search_path = public`: o RLS de `ticket_sales` continua a aplicar-se.

**Porquê:** os três consumidores de `computeTicketOfficeBalance` liam `ticket_sales`
para o cliente e somavam lá. O PostgREST corta em 1.000 linhas em silêncio e a
Ticketline tem >4.000 registos: o ecrã mostrava Vendas 371.633,70 € (real
3.919.078,70 €) e "Retido na Bilheteira" −3.285.379,37 € (real +262.065,63 €).
O saldo por evento herdava o erro (Anitta −2.424.200, M&M −184.301,50) porque as
vendas desses eventos ficavam fora das primeiras 1.000 linhas.

**Onde:** `src/pages/TicketOffices.tsx`, `src/components/TicketOfficeBalancePanel.tsx`
e `src/components/ReportTicketOfficeAudit.tsx` chamam a RPC por conta e alimentam
`computeTicketOfficeBalance` com uma linha sintética por evento
(`total_value = revenue`, `unit_price = 0`). **A fórmula de
`computeTicketOfficeBalance` (D-ERP15) não mudou — só a origem das vendas.**

A vista analítica do relatório de auditoria continua a ler linha a linha (precisa
de `sale_date` e `notes`), mas agora com paginação por `range` de 1.000.

**Validado em Live (09/09/2026):** Ticketline Vendas 3.919.078,70 €,
Retido +262.065,63 €, Anitta 0,00 €, Maiara e Maraisa 0,00 €,
Henry&Klaus Porto −55.834,14 €.
