# #333 — Prova 20: aplicação da estrutura PARADA no preflight (zero DDL)

Data: 17/10/2026 20:36 UTC (17:36 Fortaleza). Executor: 0 · Cowork (ChatGPT) via agente Lovable ERP.

## Gate
- HEAD = f0196e77b82fbcf50b7d89c13617e160073a4e2a (= base revista); ancestralidade OK; checkout limpo.
- CORE PREPARED `patches/issue333/core.PENDENTE.sql` sha256 9f8baeea…c3ef — confere.
- ATTEMPTS `supabase/manual/20261017_issue333_attempts.PENDENTE.sql` sha256 d4c80296…e0 — confere.
- BASE antigo `supabase/manual/20261017_issue333_core.PENDENTE.sql` 4eeff2df… — não usado. Roteiro 18 corrigido.

## Preflight (só SELECT) — Live
- Dependências presentes: extensions.digest(bytea,text), current_company_id(), _effective_permissions_for(uuid,uuid,text[]) -> jsonb, companies/profiles/events/standalone_invoices; todas as colunas usadas no INSERT existem.
- Nenhum objeto #333 existe (funções data_entry_* / *_333, tabelas, bucket data-entry-staging).
- storage.objects: nenhuma política sem filtro por bucket (o bucket novo não seria aberto por política genérica).
- Registry de migrações e baseline financeiro agregado guardados apenas no inventário privado (gitignored).

## Motivo da paragem (divergência de contrato, não de Live)
A autorização exige que TODAS as novas mutações diretas por RPC recusem 42501 com gate fechado.
O CORE PREPARED concede EXECUTE a `authenticated` em 4 RPCs que escrevem linhas técnicas SEM consultar gate:
- `data_entry_session(uuid,uuid)` — cria sessão (admin/manager/platform_admin);
- `data_entry_note(uuid,text)` — cria nota na sessão própria;
- `data_entry_add_document(...)` — escreve documento (na prática bloqueado: exige recibo de staging, só service);
- `data_entry_prepare(...)` — escreve prévia (bloqueado em cadeia: exige documento).
Só `data_entry_commit` verifica `data_entry_settings`. As RPCs do ATTEMPTS passam pelo gate (conforme).
Corrigir isto exigiria alterar o SQL testado durante a aplicação — proibido. Por isso: zero DDL, zero bucket.

## Estado Live
Nada aplicado. Sem migração, bucket, deploy, Publish, settings, fixtures ou dados financeiros tocados.
As 3 contas banidas e 6 objetos da prova 17 não foram tocados.

## Próximo passo proposto (não executado)
Opção recomendada: patch SQL de CORE v2 que faz `data_entry_session/note/add_document/prepare`
exigirem gate fechado-por-defeito (ex.: linha em data_entry_settings ou gate próprio) com 42501,
re-testado em PG real (67 + novos negativos), novo sha256, e nova autorização para aplicar.
Alternativa: Pedro aceita expressamente estas 4 escritas técnicas não financeiras sem gate.
