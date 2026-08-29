# ESTADO — Plataforma & Infra

Atualizado: 2026-08-29 · Issues: `agora` #83

## Em que pé está
Lovable Cloud + Supabase **Live único** (decisão fechada em maio/2026 — não reabrir). O ambiente Test foi apagado em junho/2026. DDL do agente Lovable **aplica direto em Live**; `query_database` só ataca Live. "Faz Publish" serve para código, edge functions e frontend — **não** para objetos SQL criados via migração.

## A trabalhar agora
- **#83** — isolamento multi-tenant: 38 tabelas sem política RESTRICTIVE de empresa. Precede a criação da Social Music como empresa. Sem urgência.

## Próximo passo concreto
Remover política duplicada criada por engano a 29/08, no SQL Editor de Live:
`drop policy company_isolation_card_sessions on public.card_sessions;`

## Prazos e renovações
- **PAT do GitHub (`GITHUB_TOKEN`) expira 24/set/2026.**
- Tokens Meta e chave de service account Google: registar validade aqui.

## Factos que não se reinvestigam

**Multi-tenant (auditoria 29/08).** Empresas: Mundo Propício (PT, EUR, 39 eventos), Coala Festival Portugal (PT, EUR, 4), Siriguella (BR, 0), Fortal (BR, 0). Social Music será empresa no futuro, com independência total. BR adiado.

**106 de 144** tabelas com `company_id` têm política RESTRICTIVE de empresa. Restam 38, **nenhuma com leitura aberta**. O núcleo financeiro e o marketing estão isolados.

⚠️ **Regra de leitura de RLS:** acesso = `(OR das PERMISSIVE) AND (AND das RESTRICTIVE)`. Uma política permissiva larga (`auth.uid() IS NOT NULL`) **não** anula o isolamento restritivo. E procurar isolamento **por função** (`row_belongs_to_current_company`), não só por comparação directa — ambos os erros foram cometidos a 29/08.

**RLS ligada com zero políticas = negar tudo** (seguro): `app_secrets`, `vip_coupon_email_log`.

**`query_database` do Lovable rejeita `drop policy`** (erro 499). DDL destrutiva só pelo SQL Editor de Live.

**Publish propaga código, não DML.** Backfills em migração não chegam a Live. **Crons (`pg_cron`) não propagam** — mudanças directas no SQL Editor.

Edge functions via `service_role` precisam de **GRANTs explícitos** em tabelas `crm.*` + USAGE no schema. RPCs SECURITY DEFINER chamadas por cron precisam de **dual-mode auth**. Rotação de secrets: bump cosmético → Publish → cold start. **`send_message` do Lovable dá transport error mas a mensagem chegou** — verificar via `get_project`. Scanner pré-Publish: **"Ignore issue", nunca "Try to fix all"**. `supabase-js .upsert(onConflict)` não aceita UNIQUE parcial. `pg_net` timeout 5s vs edge functions ~18s → `status_code=NULL` esperado. Edge function `github-issues`: parâmetro **`number`**.

## Onde ler mais
- `.lovable/memory/constraints/lovable-cloud-ddl-workflow.md`, `edge-fn-esm-sh-supabase-js.md`
- Issue #83 (auditoria completa e correcção)
