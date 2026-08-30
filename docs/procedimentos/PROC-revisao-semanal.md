# PROCEDIMENTO — Revisão semanal (10 minutos)

## 1. Issues e trabalho em curso
`github-issues {"action":"list"}` — as labels são `P0`/`P1`/`P2` + módulo.
- Somar as issues citadas na secção "A trabalhar agora" dos `estado-*.md`. **Mais de 5 no total? Tirar até ficarem 5.**
- Alguma citada como em curso há mais de 2 semanas? Ou passa a bloqueio declarado no estado (dizer de quê) ou sai da secção.
- Algum bloqueio declarado que já caiu?
- Alguma `P0` que não esteja em nenhum `estado-*.md`? Está órfã — dar-lhe frente.

## 2. Estados
Para cada `docs/estado/estado-*.md`: passou de uma página? **cortar**. "Próximo passo concreto" ainda faz sentido? Data com mais de 3 semanas numa frente ativa = ritual de fecho não cumprido.

## 3. Prazos
PAT do GitHub **24/set/2026**. Tokens Meta e service account Google. A menos de 30 dias → abrir Issue `P1` e citá-la no `estado-plataforma-e-infra.md`.

## 4. Saúde das ligações
```sql
select platform, status, consecutive_failures, updated_at
from crm.ad_platform_connections order by updated_at desc;
```
⚠️ Enquanto #36 e #76 não estiverem resolvidas, `status='active'` **não prova** que o sync funciona. Cruzar com `crm.meta_sync_state`.

## 5. Eventos vivos
```sql
select e.name, e.event_type, count(f.id) as linhas_bp,
       round(sum(f.amount),2) as valor_bp, max(f.updated_at)::date as ultimo_toque
from events e left join event_forecasts f on f.event_id = e.id and f.version_id is null
where e.company_id = ':EMPRESA' and e.date >= current_date - interval '90 days'
group by e.id, e.name, e.event_type order by 5 desc nulls last;
```
Evento com data próxima e BP parado há semanas = risco. Levantar com o Pedro.

## 6. Fechar
Atualizar os estados tocados. Não escrever handoff — a revisão semanal não é sessão de trabalho.
