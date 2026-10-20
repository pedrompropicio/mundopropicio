# #333 fase12h — preflight final de aplicação (NADA aplicado)

Base: main = Lovable 821112453a7f810474dce0ab574cdf12083f19ef; CI run39456952616 SUCCESS (controller). Leitura Cloud só de metadados, pelo psql read-only oficial (sem inbox, segredos, corpos, documentos ou registos financeiros).

## Metadados Cloud lidos (20/10/2026 ~16:35 UTC)
- Objetos próprios #333 review/executor/scope/_de333_canon: AUSENTES (pré-condição de aplicação limpa).
- Registo de migrações: o journal do projeto (`drizzle/migrations/meta/_journal.json`) termina em 0210_aj19_slots_acl_fix → números livres: **0211, 0212**. A tabela `supabase_migrations` não é legível pelo papel read-only (permission denied): conferir no momento pelo canal da ferramenta de migração.
- Writers/funções relevantes (md5 prosrc, owner postgres, SECDEF), iguais à prova canon12f:
  confirm_ticket_office_statement 2e868bc2…6c579c6a · save_ticket_office_settlement 08b121ed…5d9a35 · create_settlement_transfer 01c9f9d4…1c5b96f03 · materialize_paid_amount_payment ea609d67…2770bf740b8d33ef5f · _derive_paid_amount 18a8b97b…4d4c4 · guard_paid_amount_vs_payments 081f6b20…bc · validate_installments_total 4b361558…5ada2d. Também: tosl_guard 4cb7d3b7…5555f, current_company_id f857f027…02af7ad0, _effective_permissions_for a6c16467…765812.
- Triggers: 39 em transactions+transaction_payments (= readback da prova); 42 nas 5 tabelas do fecho, digest 51a6d07ecfd49a82ff36985e4d627e8f.
- Default ACL `public` (owner postgres): tabelas a anon/authenticated/service_role + sandbox_exec*; funções a authenticated/service_role/sandbox_exec_*. O SQL revoga explicitamente todos os grantees que a default ACL der (provado 12d/12f).
- FK real `ticket_office_statement_lines.statement_id → ticket_office_statements(id) ON DELETE CASCADE` (a base local não tinha FKs; a prova 24g adiciona-a).
- Identidade para o âmbito nominal (por profiles/user_roles; auth.users não é legível): pedroneto@mundopropicio.com = `d8e502f7-9ceb-4dae-bd73-7291832d0d6f`, roles admin + platform_admin; empresa Mundo Propício `7c858982-6ccd-47ca-bd65-e0dd3eebf01c` status active; profile active_company = essa empresa. Nenhuma alteração de Auth/contas.

## Verificação dirigida (duas ligações reais, PG17 local, `pg/canon12f.sh` grupos 24f/24g)
1. **Bug confirmado e corrigido** — nova versão vs executor: `save` bloqueia a linha da revisão, mas o executor lia a versão sem lock e executou a1 da v1 enquanto a v2 estava a ser gravada. Correção: `SELECT version … FOR SHARE` no executor. Depois: o executor espera e devolve `stale_version`, 0 apuramentos.
2. Linha nova vs a2 (com a FK real): INSERT concorrente em curso → a2 espera (KEY SHARE vs FOR UPDATE) e depois recusa `data_changed`, apuramento fica draft. Ordem inversa: a2 confirma o conteúdo exato; o INSERT que já tinha passado o `tosl_guard` (BEFORE) acaba por entrar no apuramento já confirmado. É uma corrida do trigger canónico `tosl_guard` (afeta também a confirmação manual), não do executor; não alterado (writer canónico). Registado como pendente de decisão.
Resto da prova inalterado (diff só em ordem de linhas paralelas e contagens do readback).

## Suite: 861 vs 1874
`vitest run src/test` = 861 testes (só essa pasta). `vitest run` (include `src/**/*.{test,spec}.{ts,tsx}`) = **1874 PASS / 6 skip / 11 todo**, corrido agora. A 12g reportou o primeiro número; não era a suite completa.

## SHA-256 (pacote 12h)
```
b071c52d689740b17a9d3f4072ff6576e19bc3ba69c3f94f70623c20e650a4d0  20261020_issue333_assistant_review.INERTE.sql
5e0f389aac65091f6ac954e300c63bf1c1b350212135687a13e728568a1e8d8f  20261020_issue333_assistant_review.ROLLBACK-INERTE.sql
157df181fc5503ae8a19d62a34c70fe360a0de527c5390718db9afbe68fea061  20261020_issue333_assistant_review.readback.SELECT.sql
93c813a2ba18f0f8a629d5625e67d5a74e9f13c4ec3245548b6dc849be028983  20261020_issue333_assistant_executor.INERTE.sql
fc62244dbbd849e5767be74be2a9c7717377de84ad828168029171bd4db731ee  20261020_issue333_assistant_executor.ROLLBACK-INERTE.sql
0d0fdde0c615e189ed32698d7427bc7acdaf55adb7f4ebcdaed09cecc48fe6fc  20261020_issue333_assistant_executor.readback.SELECT.sql
```

## Pacote de aplicação (ordem exata; cada passo com "Sim" do Pedro)
### A — esquema fechado + deploy fechado (sem finanças, sem modelo)
A0 Preflight: confirmar os metadados acima de novo (writers md5, 39/42 triggers, objetos #333 ausentes, último registo 0210); `review.readback` e `executor.readback` → objetos ausentes.
A1 Migração **0211_issue333_assistant_review** = conteúdo de `review.INERTE.sql` (sha acima) SEM `BEGIN;`/`COMMIT;` (a ferramenta gere a transação); manter `SET LOCAL lock_timeout='5s'`.
A2 Migração **0212_issue333_assistant_executor** = `executor.INERTE.sql`, mesma regra.
A3 Readback: tabelas RLS on, ACL só postgres + service_role=r; review RPC só service_role; executor só authenticated; helpers sem grantees; gates `enabled=false` nas duas settings; scope vazio; md5 dos writers = acima.
A4 Código (diff único, `supabase/functions/data-entry/index.ts`): `REVIEW_SCHEMA_REVIEWED = true`, `EXECUTOR_SCHEMA_REVIEWED = true`; `ASSISTANT_ENABLED` continua `false`, scopes vazios. CI verde → deploy SÓ data-entry. Efeito: nada utilizável (assistente 503; gates SQL false).
Reversão A: deploy com os dois flags false; `executor.ROLLBACK` e depois `review.ROLLBACK` (recusam se houver registos).

### B — ativação humana nominal (janela ≤ 30 min) e execução só se autorizada na prévia
B1 Código: `ASSISTANT_ENABLED = true`; `ASSISTANT_REVIEWED_SCOPES = new Set(["d8e502f7-9ceb-4dae-bd73-7291832d0d6f:7c858982-6ccd-47ca-bd65-e0dd3eebf01c"])`; CI verde; deploy só data-entry.
B2 Abrir (migração/DML autorizada, bloco único):
`INSERT INTO public.data_entry_assistant_scope_333(owner_id, company_id, expires_at) VALUES ('d8e502f7-9ceb-4dae-bd73-7291832d0d6f','7c858982-6ccd-47ca-bd65-e0dd3eebf01c', now() + interval '30 minutes');`
`UPDATE public.data_entry_assistant_review_settings_333 SET enabled = true;` — revisão apenas.
B3 Só se o Pedro autorizar execução na prévia: `UPDATE public.data_entry_assistant_executor_settings_333 SET enabled = true;`. Teste: um fecho simples a1→a2→a4→a3; a5 só com recebimento verificado no banco.
Sucesso: 1 apuramento confirmado (Σ = total), 1 fecho, 1 pagamento por perna, 0 linhas fora da empresa, execuções = ações feitas.
B4 Fecho (mesmo que falhe): `UPDATE … executor_settings_333 SET enabled=false; UPDATE … review_settings_333 SET enabled=false; DELETE FROM public.data_entry_assistant_scope_333 WHERE owner_id='d8e502f7-9ceb-4dae-bd73-7291832d0d6f';`; código `ASSISTANT_ENABLED=false`, scopes vazios; deploy só data-entry; readback. A expiração fecha sozinha o âmbito no SQL mesmo sem B4.
Efeitos financeiros revertem-se por estorno, nunca por DROP.

## Pendente de decisão
- Corrida do `tosl_guard` (linha inserida num apuramento que acabou de ser confirmado). Fora do #333; recomendado tratar no dono do apuramento.
