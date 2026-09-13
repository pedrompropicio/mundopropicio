# (g5) Desembolso do sócio, receitas em poder do sócio e posição de caixa

Confirmei já em Live a prova principal da regra nova: **124 linhas · 1.170.562,18 s/IVA**
para a EIN na Anitta EDA 2026 (todas as linhas de BP aprovadas com pagador = sócio,
incluindo as que têm transação ligada, menos as que já estão em `partner_paid_expenses`).

## O que muda

**A. Desembolso do sócio (corrige a regra actual)**
- Entram TODAS as linhas de BP aprovadas com `paying_partner_id` = sócio, mesmo com
  transação ligada (open bar 64.029,84 passa a contar).
- Exclui-se apenas a linha cuja transação ligada já esteja em `partner_paid_expenses`
  do mesmo sócio (dupla contagem).
- Valorização **s/IVA** por defeito; **c/IVA** só quando `suppliers.doc_locale = 'pt-BR'`.

**B. Ajustes ao desembolso** — lançamentos manuais por sócio × evento, com sinal e
descrição obrigatória (ex. "SPA: lançada a 5% no BP, paga a 3,5%" −34.304,72).
Reutilizo `event_partner_extras` com uma coluna `kind`.

**C. Receitas em poder do sócio** (abatem ao financiamento), itemizadas no ecrã e no
documento: (i) entradas nas contas de acerto do sócio; (ii) receitas do evento cuja
conta tenha `partner_id` = sócio; (iii) `operator_result` das operações de terceiros
com o novo campo "Resultado ficou com".

**D. Linha final** (Encontro de Contas + secção 5 do documento):
parte · + desembolso · ± ajustes · − receitas em poder (itemizadas) · − extras/adiantamentos
· = BASE A TRANSFERIR · + IVA 23% se `transfer_with_vat` · = TOTAL, com o subtotal
**"Financiamento a devolver"** = desembolso ± ajustes − receitas em poder.

**E. Demonstrativo MP + EIN** — linha explícita "IVA dedutível recuperado — devolvido
pelo fechamento acima" antes do resultado, e nota "A repartição do evento foi feita com
as despesas c/IVA; esse IVA é recuperável e volta inteiro a este fechamento." Verificado
no PDF/XLSX gerado a partir do ecrã.

**F. Export de conferência** — botão "Desembolso de \<sócio\> (Excel)": linhas de BP
(rubrica, descrição, s/IVA, IVA, c/IVA, tem transação?, estado), transações pagas pelo
sócio, ajustes e receitas em poder dele, com totais que batem com a linha final.

**G. Painel de capital** — uma linha por sócio (dedupe por fornecedor); "Equilíbrio de
financiamento" por % sai e entra "Posição de caixa por sócio" (recebeu − pagou =
financiamento a devolver); "Saiu (despesas pagas)" passa a contar só despesas do
perímetro da raiz.

**H. Portal do Sócio** — mesma secção 5, via RPC nova que devolve só os agregados do
próprio sócio (nunca linhas nem outros sócios).

**I. Issues** — paginação/`get` na função `github-issues`; depois comentar e fechar #133,
comentar #126 e marcar (g5) na #146.

## DDL a autorizar (3 peças, sem DML)

```sql
-- 1) Ajustes ao desembolso, reutilizando event_partner_extras
alter table public.event_partner_extras
  add column kind text not null default 'extra'
  check (kind in ('extra', 'disbursement_adjustment'));
comment on column public.event_partner_extras.kind is
  '(g5) extra = abate ao acerto do sócio; disbursement_adjustment = ajuste ao desembolso (amount com sinal).';

-- 2) "Resultado ficou com" nas operações de terceiros
alter table public.event_third_party_operations
  add column held_by_supplier_id uuid references public.suppliers(id) on delete set null;
comment on column public.event_third_party_operations.held_by_supplier_id is
  '(g5) Sócio/entidade que ficou com o operator_result: conta como receita em poder desse sócio.';

-- 3) RPC do Portal do Sócio (SECURITY DEFINER, só agregados do próprio sócio)
create or replace function public.get_partner_settlement_summary(
  _event_id uuid, _settlement_id uuid
) returns table (
  partner_share numeric, disbursement numeric, adjustments numeric,
  revenues_held numeric, extras numeric, transfer_base numeric,
  transfer_vat numeric, transfer_total numeric
) language plpgsql stable security definer set search_path = public as $$ ... $$;
revoke all on function public.get_partner_settlement_summary(uuid, uuid) from public, anon;
grant execute on function public.get_partner_settlement_summary(uuid, uuid) to authenticated;
```

A RPC resolve o sócio autenticado por `profiles.linked_supplier_id` e devolve zero linhas
se esse sócio não participar no fechamento — nunca linhas de detalhe nem outros sócios.

## Diff da edge function `github-issues`

Acrescento à acção `list` os parâmetros `page`, `per_page`, `state` e uma acção `get`
por `number`. Apresento o diff antes de aplicar.

## Prova e testes

- Anitta/EIN ao vivo: desembolso 1.170.562,18 (124 linhas, open bar dentro), receitas em
  poder 905.000,00 + o que já estiver atribuído; indico o que falta em dados (conta nas
  3 transações, "resultado ficou com" nos bares, ajuste SPA).
- Ivete/SS: números iguais aos de hoje.
- Testes: `partner-disbursement` corrigido (open bar dentro, s/IVA, pt-BR c/IVA, dedupe
  por transação), documento (linha do IVA e secção 5 nova), capital (dedupe). `tsgo` limpo.
- Sem Publish. Sem DML — os registos de dados ficam para ti na UI.

## Docs

Adenda g5 no DECISIONS, memórias `event-settlements` e `partner-settlement`,
`docs/estado/estado-fecho-e-socios.md` reescrito, relatório curto com os números e output
cru em `claude-outputs/`.

## Aberto para ti

1. Autorizas as 3 peças de DDL acima?
2. O ajuste ao desembolso fica em `event_partner_extras` com `kind` (recomendado) ou
   preferes tabela própria?
