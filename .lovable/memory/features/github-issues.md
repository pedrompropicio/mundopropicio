---
name: Edge function github-issues
description: Contrato da edge function github-issues (get/list/create/comment/close/update), parâmetro number, owner/repo fixos, GITHUB_TOKEN, chamada por net.http_post e labels reais
type: feature
---

Wrapper seguro para a GitHub Issues API. Ficheiro: `supabase/functions/github-issues/index.ts`.
Owner/repo **fixos no código**: `pedrompropicio/mundopropicio` — não são parâmetros.

## Contrato (POST, corpo JSON com `action`)

| action | parâmetros | devolve |
|---|---|---|
| `get` | `number` (int) | `{ issue: { number, title, state, body, labels[] } }` |
| `list` | `page` (int, default 1), `state` (`open`\|`closed`\|`all`, default `open`) | `{ issues[], page, has_more }` — 100 por página, `sort=created&direction=asc`, PRs filtrados |
| `create` | `title` (obrigatório), `body`, `labels[]` | `{ number, html_url, title }` |
| `comment` | `number`, `body` | `{ id, html_url }` |
| `close` | `number` | `{ number, state }` |
| `update` | `number` + um de `title`, `body`, `labels[]`, `state` | `{ number, html_url, state, labels[] }` |

Regras que se esquecem:
- O parâmetro é **`number`**, nunca `issue_number`.
- **`update` com `labels` SUBSTITUI o conjunto todo** (é PATCH do GitHub, não é aditivo): enviar sempre a lista final desejada. Labels inexistentes no repo são criados pelo GitHub com cor default.
- `list` só devolve uma página — para ler uma issue concreta usar `get`, não varrer a lista.
- Erros da API do GitHub vêm como HTTP 502 com `{ error: 'github_api_error', github_status, github_body }`.

## Token

Secret de edge function `GITHUB_TOKEN`: PAT fine-grained **"mp-github-issues-2026"**, **sem expiração**, limitado a este repo, permissões *Issues read/write* + *Metadata read*. Renovado a 18/09/2026 (#15). O prazo (ou a ausência dele) vive em `public.secret_expirations` e é vigiado pelo invariante `segredos_a_expirar_14d`.

## Como se chama

1. **HTTPS directo** — válido desde 16/09/2026 em sessões interativas (allowlist de rede da organização): POST a `https://<ref>.supabase.co/functions/v1/github-issues` com `Authorization: Bearer <service role>`.
2. **`net.http_post` a partir de `query_database`** — caminho de referência para tarefas agendadas, que não alcançam o HTTPS directo (403). A service role key vem do vault, secret `email_queue_service_role_key`. A resposta lê-se depois em `net._http_response` pelo `request_id` devolvido.

## Labels reais

Prioridade `P0` / `P1` / `P2` + módulo `MP-ERP` / `MP-AUDIENCE` / `MP-CRM` / `transversal`.
**Não existem labels de estado** — o que está em curso vive na secção "A trabalhar agora" do `estado-<frente>.md`.
