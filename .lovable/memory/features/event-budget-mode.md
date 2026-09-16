---
name: Event budget mode (D6)
description: Campo budget_mode por evento + default_budget_mode por empresa — declara se o evento é gerido com BP ou sem BP
type: feature
---

# Modo orçamental do evento (D6)

> ⚠️ **AVISO — NÃO CONFUNDIR COM `events.operacao_mode`.**
> `operacao_mode` (`planning|montagem|evento|post`) são as **fases do Hub de Produção**
> (MP Operação). Nada tem a ver com orçamento. O campo desta memória é
> `events.budget_mode` e é totalmente independente.

## O que é
Cada evento declara como é gerido financeiramente:

- `with_bp` — gerido **com BP**: o custo é *previsto + excedido* e a linha de BP
  será obrigatória nas transações.
- `without_bp` — gerido **sem BP**: o custo é o **realizado puro**; não há BP a exigir.

## Resolução (SSoT)
```sql
SELECT public.event_budget_mode(_event_id);
-- COALESCE(events.budget_mode, companies.default_budget_mode, 'with_bp')
```
`events.budget_mode` é NULL por defeito = **herda** o default da empresa.
Qualquer consumidor (frontend, RPC, relatório) deve usar esta função e nunca ler
`budget_mode` isolado.

## Default por empresa
`companies.default_budget_mode` — `text NOT NULL DEFAULT 'with_bp'`.

| Empresa | Default |
|---|---|
| Mundo Propício | `with_bp` |
| Coala Portugal | `with_bp` |
| Fortal (BR) | `without_bp` |
| Siriguella (BR) | `without_bp` |

Motivo: as empresas brasileiras do grupo quase nunca fazem BP de evento; o
sistema não decreta essa mudança cultural.

## Estado (2026-09-02)
Migration aplicada. **Campo inerte**: nenhum evento existente foi alterado
(todos NULL → `with_bp`), não há UI e nenhum comportamento mudou. A UI de criação
de evento e o ecrã da empresa vêm num passo seguinte.

## Estado (2026-09-16)
- `events.budget_mode` continua a **NULL nos 56 eventos** e **não tem UI** — issue **#100**.
- Com o COALESCE, todo o evento cai no **default da empresa**: a MP tem
  `default_budget_mode='with_bp'`, logo todo o evento da MP nasce `with_bp` sem ninguém decidir.
- A **Tour M&M — Verão Europa 2026** e os **4 sub-eventos** foram marcados a **`without_bp`** à
  mão a 16/09: são `partner_managed`/Workshow, shows vendidos a terceiros, com **zero linhas de
  BP** — exigir linha de BP ali era ruído. Ficam **6 eventos `partner_managed`** no mesmo engano,
  listados na #100.
