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
Superado pela retoma autorizada de Pedro às20:47 UTC: corrigir/testar/congelar CORE v2 e concluir a mesma aplicação estrutural, sem pedir aceitação de bypass nem nova autorização técnica.
Correção local passou73/73 PG (67 anteriores+6 novos), preparação independente da execução; novo SHA b60f9360599f3204ce64c0eebd46350c73f07051ae3365e1dc043c14a3c1248e.
Ver prova21: aplicação ainda não iniciada, aguardando integração do autocommit próprio conforme #329. O9f8 original nunca foi aplicado nem alegado como contendo estas guardas.
