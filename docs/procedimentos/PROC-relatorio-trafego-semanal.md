# PROC — Relatório semanal de tráfego pago × vendas

Relatório recorrente (semanal ou on-demand) que cruza o investimento de tráfego pago (Meta + Google) com as vendas reais de bilheteira, por artista/evento. Layout validado a 17/09/2026 (6 páginas). Produzido pelo Claude em HTML → PDF (wkhtmltopdf; layout compatível: `table`/`table-cell` em vez de flex/grid, SVG para gráficos, **sem variáveis CSS**, escala por `zoom` no `body` — o `--zoom` da linha de comandos não tem efeito nesta build).

**Período:** dias completos até **ontem**. O dia de hoje fica sempre de fora.

## ROAS

Vale a **D-ERP81** — ler antes de escrever qualquer número de retorno. Resumo:

- **ROAS bruto** (receita real ÷ investimento Meta+Google do período) é o ROAS **oficial** e o único que entra neste relatório: KPIs, tabela diária, tabela por cidade. Cidade sem investimento leva traço.
- **ROAS marginal** (Δreceita ÷ Δinvestimento entre dois períodos iguais e consecutivos) é o cálculo para decidir mexer na verba. Só se lê com variação de investimento ≥ 30% e duas semanas de leitura.
- **ROAS incremental** só em estudo pontual ou teste por cidades; **nunca** neste relatório.
- **ROAS atribuído da plataforma** fica dentro do MP Audience. Se aparecer, vai em tabela à parte, rotulado "atribuído, subestimado".
- **Nunca dois ROAS diferentes na mesma tabela nem no mesmo gráfico.**

## Estrutura — 2 páginas por artista

### Página A — Análise diária (período parametrizável)
- 5 KPIs: investimento total (Meta+Google) · bilhetes no período · receita real · **ROAS bruto** · custo por bilhete. Cada KPI com comparação aos 7 dias anteriores.
- Gráfico combo: barras = receita/dia; linha = investimento/dia, no **mesmo eixo em €**.
- Tabela dia a dia: Dia | Meta € | Google € | Investimento | Bilhetes | Receita | ROAS. Linha TOTAL no fim.
- Tabela por cidade no mesmo período.

### Página B — Salas: ocupação e projeção de esgotamento
- Tabela por sessão: Sessão (data) | Lotação libertada | Ocupados | Ocupação % | Lugares livres | Ritmo 7d | Ritmo 14d | Ritmo para esgotar | Projeção.
- **Ritmo:** média diária de 7 e de 14 dias. **Ritmo para esgotar** = lugares livres ÷ dias até ao evento. **Projeção** = lugares livres ÷ ritmo de 14 dias, apresentada como **direção**, nunca como data firme.
- Sessão com menos de 14 dias de venda corrente: marcar **instável** e **não projetar**.
- Cores de ocupação: ≥70% verde · 45–70% âmbar · <45% vermelho. Termina com leitura acionável (sessões que libertam verba, sessões em risco).

## Layout validado a 17/09/2026 (6 páginas)

1. Resumo com leitura em 1 minuto.
2. Por tour: 7 dias em detalhe — KPIs com comparação aos 7 dias anteriores, gráfico receita/dia (barras) + investimento/dia (linha) no mesmo eixo em €, tabela diária, tabela por cidade.
3. Entrega das campanhas em **tabela à parte**.
4. Resumo do evento inteiro por cidade.
5. Ritmo, tendência e esgotamento por sessão.

## Queries (Live · company MP `7c858982-6ccd-47ca-bd65-e0dd3eebf01c`)

### Vendas por dia — sempre pela RPC
```sql
SELECT * FROM public.get_daily_sales_series(:inicio, :fim, ARRAY[:tour_id]::uuid[]);
```
Aceita o id do evento-pai ou do filho e **já aplica a precedência por evento** (espelhos Ticketline/BOL/Onebox vs. `ticket_sales`). Não existe nem se cria uma segunda implementação dessa precedência.

⚠️ **Enquanto a Issue #197 estiver aberta, NÃO usar `public.vw_event_daily_sales`:** decide a precedência por existência de linhas no espelho e, desde a v2.41, perdeu o histórico de 8 eventos.

🚫 **Proibido** ler `public.ticket_sales` com JOIN a `event_ticket_zones` para montar a série à mão, e proibido calcular ocupação com `event_ticket_zones.total_capacity` (ver `docs/estado/estado-ticketing-e-receita.md`).

### Investimento Meta (por evento, não por nome)
```sql
SELECT i.date_start AS dia, sum(i.spend_cents)/100.0 AS meta
FROM crm.meta_campaign_insights_daily i
JOIN crm.meta_campaign_snapshot s ON s.external_campaign_id = i.external_campaign_id
JOIN public.events e ON e.id = s.linked_event_id
WHERE coalesce(e.parent_event_id, e.id) = :tour_id
  AND i.date_start BETWEEN :inicio AND :fim
GROUP BY 1 ORDER BY 1;
```
Deixa de se filtrar por nome da campanha (`ILIKE`) — apanhava campanhas de tours antigas do mesmo artista.

### Investimento Google
```sql
SELECT i.date_start AS dia, sum(i.spend_cents)/100.0 AS google
FROM crm.google_campaign_insights_daily i
JOIN crm.google_campaign g ON g.external_campaign_id = i.external_campaign_id
JOIN public.events e ON e.id = g.linked_event_id
WHERE coalesce(e.parent_event_id, e.id) = :tour_id
  AND i.date_start BETWEEN :inicio AND :fim
GROUP BY 1 ORDER BY 1;
```
**Confirmar a frescura (`max(last_synced_at)`) antes de reportar.** A 17/09/2026 a tabela não tinha cron e o último dia vinha incompleto.

### Ocupação por sessão — só `event_zone_capacities`
```sql
WITH latest_obs AS (
  SELECT event_id, max(observed_on) AS observed_on
  FROM public.event_zone_capacities
  WHERE capacity_kind = 'released'
  GROUP BY event_id
),
zonas AS (
  SELECT DISTINCT ON (c.event_id, c.zone_label)
         c.event_id, c.zone_label, c.capacity, c.occupied, c.available
  FROM public.event_zone_capacities c
  JOIN latest_obs l ON l.event_id = c.event_id AND l.observed_on = c.observed_on
  WHERE c.capacity_kind = 'released'
  ORDER BY c.event_id, c.zone_label, c.observed_on DESC
)
SELECT e.name, e.date, (e.date - now()::date) AS dias_ate,
       sum(z.capacity) AS libertado,
       sum(z.occupied) AS ocupados,
       round(100.0 * sum(z.occupied) / nullif(sum(z.capacity), 0), 1) AS ocup_pct,
       sum(greatest(z.available, 0)) AS lugares_livres
FROM zonas z
JOIN public.events e ON e.id = z.event_id
WHERE coalesce(e.parent_event_id, e.id) = :tour_id
GROUP BY e.name, e.date
ORDER BY ocup_pct DESC;
```
Só entram as zonas cuja `observed_on` é a mais recente **desse evento** — evita rótulos antigos (a armadilha da Issue #198). `occupied` inclui convites e reservas, por isso é **maior** que os bilhetes vendidos: não é divergência.

Fiabilidade por tour:
```sql
SELECT * FROM public.get_event_capacity_quality();
```

🚫 **Nunca** `ticket_sales ÷ total_capacity` nem `bilheteira_zone_snapshots` para ocupação.

## Notas de rigor
- **ROAS bruto** ≠ **ROAS atribuído Meta** (inferior; o pixel não recebe o `fbc` no Purchase da Ticketline) ≠ **ROAS incremental** (desconta o orgânico à taxa pré-tráfego). Nunca apresentar como o mesmo — D-ERP81.
- **Artefacto de sync:** sessão recém-importada traz as vendas carimbadas com a data de importação, não a data real (ex.: Coimbra e Sta M. da Feira do RG entraram a 17/set com todo o histórico nesse dia). No dia-a-dia, excluir ou sinalizar.
- **Ritmo instável:** sessão à venda há menos de 14 dias tem ritmo/dia inflacionado pelo acumulado inicial — marcar "instável*" e não projetar até estabilizar.
- Números sempre consultados na hora; um número só entra no documento se tiver origem. Analisar o período vivo; não repetir meses já reportados salvo pedido.
