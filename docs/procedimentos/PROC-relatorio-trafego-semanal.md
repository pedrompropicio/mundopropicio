# PROC — Relatório semanal de tráfego pago × vendas

Relatório recorrente (semanal ou on-demand) que cruza o investimento de tráfego pago (Meta + Google) com as vendas reais de bilheteira, por artista/evento. Layout fixo validado em 17/set/2026 (Simone Mendes Tour 2026 + Raphael Ghanem Tour 2027). Produzido pelo Claude em HTML → PDF (wkhtmltopdf; layout compatível: table/table-cell em vez de flex/grid, SVG para gráficos).

## Estrutura — 2 páginas por artista

### Página A — Análise diária (período parametrizável)
- 5 KPIs: investimento total (Meta+Google) · bilhetes no período · receita real · ROAS bruto (= receita real ÷ investimento) · custo por bilhete.
- Gráfico combo: barras = receita/dia; linha vermelha = investimento/dia.
- Tabela dia a dia: Dia | Meta € | Google € | Investimento | Bilhetes | Receita | ROAS. Linha TOTAL no fim.

### Página B — Salas: ocupação e projeção de esgotamento
- Tabela por sessão: Sessão (data) | Capacidade | Vendidos | Ocupação % | Ritmo/dia (média 14d) | Receita | Projeção.
- Evento próximo: projeção = % no dia do evento (vendidos + ritmo × dias_ate).
- Evento distante: dia de esgotamento se (capacidade − vendidos)/ritmo ≤ dias_ate; senão % no dia.
- Cores de ocupação: ≥70% verde · 45–70% âmbar · <45% vermelho. Termina com leitura acionável (sessões que libertam verba, sessões em risco).

## Queries (Live · company MP 7c858982-6ccd-47ca-bd65-e0dd3eebf01c)

### Diário (parametrizar inicio, fim, artista, prefixo_sessao)
```sql
WITH dias AS (SELECT generate_series(:inicio::date, :fim::date, '1 day')::date AS dia),
meta AS (
  SELECT i.date_start AS dia, sum(i.spend_cents)/100.0 AS g
  FROM crm.meta_campaign_insights_daily i
  JOIN crm.meta_campaign_snapshot s ON s.external_campaign_id=i.external_campaign_id
  WHERE s.company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c' AND s.name ILIKE :artista
    AND i.date_start BETWEEN :inicio AND :fim GROUP BY 1),
goog AS (
  SELECT date_start AS dia, sum(spend_cents)/100.0 AS g
  FROM crm.google_campaign_insights_daily
  WHERE company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c' AND campaign_name ILIKE :artista
    AND date_start BETWEEN :inicio AND :fim GROUP BY 1),
vd AS (
  SELECT ts.sale_date AS dia, sum(ts.quantity) AS bilh, sum(ts.total_value) AS rec
  FROM public.ticket_sales ts
  JOIN public.event_ticket_zones z ON z.id=ts.zone_id
  JOIN public.events e ON e.id=z.event_id
  WHERE e.company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c' AND e.name ILIKE :prefixo_sessao
    AND ts.sale_date BETWEEN :inicio AND :fim GROUP BY 1)
SELECT d.dia, COALESCE(m.g,0) AS meta, COALESCE(gg.g,0) AS google,
       COALESCE(v.bilh,0) AS bilhetes, COALESCE(v.rec,0) AS receita
FROM dias d LEFT JOIN meta m ON m.dia=d.dia
LEFT JOIN goog gg ON gg.dia=d.dia LEFT JOIN vd v ON v.dia=d.dia
ORDER BY d.dia;
```

### Salas (parametrizar prefixo_sessao, ex. 'RG -' ou 'SM -')
```sql
WITH cap AS (SELECT event_id, sum(total_capacity) AS capacidade FROM public.event_ticket_zones GROUP BY event_id),
tot AS (SELECT z.event_id, sum(ts.quantity) AS vend, sum(ts.total_value) AS receita
        FROM public.ticket_sales ts JOIN public.event_ticket_zones z ON z.id=ts.zone_id GROUP BY z.event_id),
r14 AS (SELECT z.event_id, sum(ts.quantity) AS u14 FROM public.ticket_sales ts
        JOIN public.event_ticket_zones z ON z.id=ts.zone_id
        WHERE ts.sale_date >= (now()::date-14) GROUP BY z.event_id)
SELECT e.name, e.date, (e.date-now()::date) AS dias_ate, c.capacidade,
       COALESCE(t.vend,0) AS vendidos,
       round(100.0*COALESCE(t.vend,0)/c.capacidade,1) AS ocup_pct,
       round(COALESCE(r.u14,0)/14.0,1) AS ritmo_dia, COALESCE(t.receita,0) AS receita
FROM public.events e JOIN cap c ON c.event_id=e.id
LEFT JOIN tot t ON t.event_id=e.id LEFT JOIN r14 r ON r.event_id=e.id
WHERE e.company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c' AND e.name ILIKE :prefixo_sessao
ORDER BY ocup_pct DESC;
```

## Notas de rigor
- **ROAS bruto** (receita real total ÷ investimento) ≠ **ROAS atribuído Meta** (inferior; o pixel não recebe o fbc no Purchase da Ticketline) ≠ **ROAS incremental** (desconta o orgânico à taxa pré-tráfego). Nunca apresentar como o mesmo.
- **Artefacto de sync:** sessão recém-importada traz as vendas carimbadas com a data de importação, não a data real (ex.: Coimbra e Sta M. da Feira do RG entraram a 17/set com todo o histórico nesse dia). No dia-a-dia, excluir ou sinalizar.
- **Ritmo instável:** sessão à venda há menos de 14 dias tem ritmo/dia inflacionado pelo acumulado inicial — marcar "instável*" e não projetar até estabilizar.
- Números sempre consultados na hora; um número só entra no documento se tiver origem. Analisar o período vivo; não repetir meses já reportados salvo pedido.
