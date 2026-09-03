# PROCEDIMENTO — Conferência e fecho de evento

Corre **sempre igual**, em qualquer evento, por qualquer instância. Determinístico: as queries decidem, o Claude só interpreta.

Substituir `:EVENTO` pelo `events.id`. Todas as queries atacam Live.

## Passo 0 — Estado do evento

```sql
select e.id, e.name, e.event_type, e.format, e.parent_event_id,
       e.partner_calc_basis, e.company_id
from events e where e.id = ':EVENTO';
```

```sql
select s.name as socio, p.percentage, p.loss_percentage,
       p.can_order, p.can_pay, p.expense_includes_iva
from event_partners p left join suppliers s on s.id = p.supplier_id
where p.event_id = ':EVENTO' order by p.percentage desc;
```

**Ler assim:** `can_pay = false` → quem paga é a MP, logo **transação é esperada**. `can_pay = true` → o sócio paga do bolso dele, ausência de transação é **legítima** e gera **crédito a devolver-lhe**. Se tiver `parent_event_id`, é cidade de turnê.

## Passo 0-bis — Sessões abertas

```sql
select public.event_close_blockers(':EVENTO');
```

**Ler assim:**

- `hard` não vazio (`camarim_sessions` por integrar ou `card_sessions` abertas) → **não se fecha**. A base de dados recusa a passagem a `completed` (D19); é custo que ainda vai cair no evento. Integrar/fechar as sessões primeiro.
- `soft.pending_expenses` não vazio → **decisão do responsável**, não bloqueia. Fecha-se com conhecimento e a decisão fica **registada na planilha** do evento.

## Passo 1 — Receitas

```sql
select count(*) as n, sum(ts.quantity) as bilhetes,
       round(sum(ts.total_value),2) as c_iva,
       round(sum(ts.total_value)/1.06,2) as s_iva
from ticket_sales ts join event_ticket_zones z on z.id = ts.zone_id
where z.event_id = ':EVENTO';
```

```sql
select c.code, c.name, t.status, count(*) as n, round(sum(t.amount),2) as valor
from transactions t left join account_categories c on c.id = t.category_id
where t.event_id = ':EVENTO' and t.type = 'income'
group by c.code, c.name, t.status order by c.code;
```

**Receita total = bilheteira s/IVA + transações de receita.** IVA da bilheteira 6%. `ticket_sales` liga-se por `zone_id`, **não tem `event_id`**.

## Passo 2 — Despesas do BP

```sql
select count(*) as linhas, round(sum(amount),2) as s_iva,
       round(sum(amount * iva_rate/100.0),2) as iva,
       round(sum(amount * (1+iva_rate/100.0)),2) as c_iva
from event_forecasts
where event_id = ':EVENTO' and version_id is null
  and type = 'expense' and status = 'approved';
```

## Passo 3 — Excedido por rubrica

```sql
with prev as (
  select category_id, sum(amount) v from event_forecasts
  where event_id = ':EVENTO' and version_id is null and type = 'expense'
    and status = 'approved' and coalesce(is_overhead,false) = false
  group by category_id),
real as (
  select category_id, sum(amount) v from transactions
  where event_id = ':EVENTO' and type = 'expense'
    and status in ('approved','paid') and coalesce(is_transitory,false) = false
    and coalesce(exclude_from_result,false) = false and reversed_at is null
    and coalesce(is_hidden,false) = false
  group by category_id)
select round(sum(greatest(coalesce(r.v,0) - coalesce(p.v,0), 0)),2) as excedido
from real r full join prev p on p.category_id = r.category_id;
```

**Custo do fecho s/IVA = BP aprovado + excedido.** O excedido é métrica de desactualização do BP, não categoria de custo — deve tender para zero.

⚠️ **Limitação conhecida (achado A1):** o baseline é cego ao ordenador e ao `can_pay`. Orçamento de sócio pagador acolchoa o baseline e pode mascarar derrapagem da MP. Cruzar com o passo 5.

## Passo 4 — Detetor de IVA em taxas públicas

```sql
select c.code, f.description, f.amount, f.iva_rate
from event_forecasts f join account_categories c on c.id = f.category_id
where f.event_id = ':EVENTO' and f.version_id is null and f.iva_rate <> 0
  and (f.description ilike '%psp%' or f.description ilike '%polic%'
    or f.description ilike '%bombeir%' or f.description ilike '%licenc%'
    or f.description ilike '%marinha%' or f.description ilike '%camara%'
    or f.description ilike '%taxa%');
```

**Zero linhas = limpo.** Taxas públicas não levam IVA.

## Passo 5 — Rubricas sem transação, por ordenador

```sql
select coalesce(s.name,'MP') as ordenador, coalesce(ep.can_pay,true) as paga,
       count(*) as linhas, round(sum(f.amount),2) as valor
from event_forecasts f
left join event_partners ep on ep.id = f.ordering_partner_id
left join suppliers s on s.id = ep.supplier_id
where f.event_id = ':EVENTO' and f.version_id is null and f.type = 'expense'
  and not exists (select 1 from transactions t
        where t.event_id = f.event_id and t.category_id = f.category_id and t.type = 'expense')
group by 1,2 order by 4 desc;
```

- **`paga = false`** → a MP tem de pagar. **Obrigação futura**: serviço por faturar ou pagamento em falta.
- **`paga = true`** → o sócio desembolsou. **Financiamento a devolver-lhe** no acerto.

## Passo 6 — Quem pagou

```sql
select coalesce(sp.name,'MP') as pagador, count(*) as tx, round(sum(t.amount),2) as valor
from transactions t
left join event_partners epp on epp.id = t.paying_partner_id
left join suppliers sp on sp.id = epp.supplier_id
where t.event_id = ':EVENTO' and t.type = 'expense'
  and t.status in ('approved','paid') and coalesce(t.is_transitory,false) = false
  and coalesce(t.exclude_from_result,false) = false and t.reversed_at is null
  and coalesce(t.is_hidden,false) = false
group by 1 order by 3 desc;
```

**A MP detém a receita do evento.** Logo a MP pagar despesa ordenada por sócio **não é adiantamento** — é pagar custo do evento com dinheiro do evento. O que gera crédito é o inverso.

## Passo 7 — Saúde do vínculo

```sql
select count(*) as tx,
       count(*) filter (where forecast_id is not null) as com_vinculo_explicito
from transactions
where event_id = ':EVENTO' and type = 'expense';
```

Rácio baixo = atribuição dependente de `scoreDescriptionMatch`. Não invalida os totais (o fecho agrega por rubrica), mas torna frágil a atribuição por ordenador.

## Passo 8 — Base de IVA por sócio

Sede fiscal **PT** → s/IVA. Sede fiscal **BR** → c/IVA. **Receitas sempre s/IVA**. O critério é a **sede fiscal**, não a origem. Default sobreponível por contrato, com justificação escrita.

⚠️ O seletor c/IVA↔s/IVA do ecrã é **vista**. Nunca deve alterar o acerto com sócios (issue #64).

## Passo 9 — Movimento desde a última conferência

```sql
select date_trunc('day', created_at)::date as dia, count(*) as tx,
       round(sum(amount),2) as valor
from transactions
where event_id = ':EVENTO' and type = 'expense' and created_at >= ':DESDE'
group by 1 order by 1;
```

Se houve movimento depois da última planilha, **regerar antes de mostrar a alguém**.

## Passo 10 — Fecho

- [ ] Receitas conferidas
- [ ] Custo = BP + excedido
- [ ] Detetor de IVA limpo
- [ ] Rubricas sem transação explicadas por ordenador/`can_pay`
- [ ] Obrigação futura da MP quantificada
- [ ] Financiamento dos sócios pagadores quantificado
- [ ] Base de IVA correta por sócio
- [ ] Sem movimento posterior à planilha
- [ ] `estado-fecho-e-socios.md` atualizado
- [ ] Issues abertas/fechadas/comentadas

**O ERP para no nível 1.** Cascatas entre alguns sócios, ativos exclusivos e encontros de contas são nível 2: vivem na planilha, anexada ao evento.
