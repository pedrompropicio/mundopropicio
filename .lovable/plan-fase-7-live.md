# Fase 7 — Plano de migração Live (multi-empresa)

> **Objetivo**: aplicar em Live (`mundopropicio.lovable.app`) tudo o que foi feito em Test nas Fases 1–6, **sem quebrar dados nem funcionalidade existentes**.
> **Pré-requisito**: roteiro `.lovable/specs/multi-tenant-e2e-checklist.md` 100% verde em Test.

---

## 0. Princípios irredutíveis

1. **Backup completo antes de qualquer DDL**. Sempre.
2. **Migrações idempotentes** (`IF NOT EXISTS`, `CREATE OR REPLACE`).
3. **`company_id` começa NULLABLE**, com seed automática para a Mundo Propício, e SÓ DEPOIS é tornado `NOT NULL` (a passagem para `NOT NULL` é o último passo, não o primeiro).
4. **Janela de manutenção comunicada** (10–20 min, idealmente domingo de manhã).
5. **Plano de rollback escrito** ANTES de aplicar.
6. **Aplicar em batches** (não 1 mega-migration de 5000 linhas).

---

## 1. Pre-flight checklist (D-1)

- [ ] Test ambiente: roteiro E2E ✅ verde.
- [ ] Suite Vitest + Deno: passa.
- [ ] `scripts/multi-tenant-rls-isolation-test.txt` rodado em Test → 0 leaks.
- [ ] **Backup completo de Live** via `database-backup` edge function. Guardar SHA256 do ficheiro.
- [ ] Anotar contagens atuais Live de cada uma das 65 tabelas isoladas.
- [ ] Avisar utilizadores: **janela X–Y de manutenção** (push notification, email, banner no app).
- [ ] Snapshot do schema atual: `pg_dump --schema-only` — guardar.

---

## 2. Batches de migração (em ordem estrita)

### Batch 0 — Fundamentos (5min)
Idêntica à migração da Fase 1 em Test:
- Cria tabela `companies` + `company_invitations`.
- Adiciona `platform_admin` ao enum `app_role`.
- Adiciona `company_id` (NULLABLE) a `profiles`, `user_roles`, `user_permissions`.
- Cria `current_company_id()` + `is_platform_admin()`.
- Cria bucket `company-branding`.
- Atualiza trigger `handle_new_user`.

**Seed**:
- INSERT em `companies` para Mundo Propício (mesmo UUID que em Test? — não, Live terá UUID novo, anotar).
- UPDATE de TODOS os profiles existentes a `company_id = <MP-Live>`.
- UPDATE de TODOS os user_roles a `company_id = <MP-Live>` (exceto se quiseres promover já um user a `platform_admin` com `company_id = NULL`).

**Validação**:
```sql
SELECT count(*) FROM public.profiles WHERE company_id IS NULL;  -- esperado: 0 (ou 1 se tens platform_admin)
SELECT count(*) FROM public.companies;  -- esperado: 1
```

### Batch 1 — Eventos & BP (~5min)
Equivalente à Fase 2A. Para cada uma das 14 tabelas:
1. `ALTER TABLE ... ADD COLUMN company_id uuid REFERENCES companies(id);`
2. `UPDATE ... SET company_id = <MP-Live> WHERE company_id IS NULL;`
3. `CREATE TRIGGER set_company_id_on_insert_<tabela> BEFORE INSERT ... EXECUTE FUNCTION set_company_id_on_insert();`
4. `CREATE POLICY company_isolation_<tabela> ON ... AS RESTRICTIVE FOR ALL USING (row_belongs_to_current_company(company_id));`
5. Validação inline: `SELECT count(*) WHERE company_id IS NULL` deve dar 0.

### Batch 2 — Bilhética (Fase 2B, 7 tabelas)
### Batch 3 — Cache + Camarim (Fase 2C, 13 tabelas)
### Batch 4 — Financeiro core (Fase 2D, 8 tabelas)
### Batch 5 — Fornecedores + Reembolsos (Fase 2E, 10 tabelas)
### Batch 6 — Sistema + Comunicações + Catálogos (Fase 2F, 14 tabelas)

> Cada batch validado individualmente antes do seguinte. Se um falhar, ROLLBACK desse batch e investigar.

### Batch 7 — Storage RLS (Fase 4)
- Policies RESTRICTIVE em `storage.objects` para os 11 buckets isolados.
- Renomear ficheiros existentes: `UPDATE storage.objects SET name = '<MP-Live>/' || name WHERE bucket_id IN (...) AND (storage.foldername(name))[1] <> '<MP-Live>'`.

### Batch 8 — Hardening (limpeza USING true + profiles)
- Substituir 56 policies `USING (true)` por `USING (auth.uid() IS NOT NULL)`.
- Substituir policy de `profiles` SELECT pelo filtro por `company_id`.

### Batch 9 — `NOT NULL` (último, opcional inicialmente)
Só depois de tudo o resto validado e SEM erros há 24h:
```sql
ALTER TABLE public.events ALTER COLUMN company_id SET NOT NULL;
-- repetir para as 65 tabelas
```

---

## 3. Validação pós-migração (15min)

Logo após a última migração:
- [ ] Login como `pedroneto@mundopropicio.com` em Live → tudo funciona, contagens iguais à pré-migração.
- [ ] Criar 1 transação de teste, anexar 1 documento → confirmar que vai para `<MP-Live>/...`.
- [ ] Apagar a transação de teste.
- [ ] Verificar que `database-backup` continua a correr e guarda em `database-backups` (bucket global, sem prefixo).
- [ ] Smoke test de 5 features críticas: BP, transações, camarim, ticketing, dashboard.
- [ ] Rodar uma versão adaptada de `multi-tenant-rls-isolation-test.txt` em Live (com IDs Live), criando 1 empresa Demo temporária e validando 0 leaks.
- [ ] **Apagar empresa Demo** após validação.

---

## 4. Plano de rollback

### Cenário A — Erro em 1 batch específico
- `BEGIN; <DDL>; ROLLBACK;` se ainda dentro da transação.
- Se já commitou: aplicar migração reversa do batch (drop policies/triggers/colunas do batch).

### Cenário B — Tudo correu mal, dados corrompidos
1. Pôr app em modo manutenção (banner global).
2. `database-restore-v2` com o backup completo do passo 1 do pre-flight.
3. Validar SHA256 do restore.
4. Tirar app de manutenção.
5. Post-mortem antes de tentar de novo.

### Cenário C — Schema OK mas RLS quebrou alguma feature
- Identificar a policy problemática via logs (`function_edge_logs` + `postgres_logs`).
- `DROP POLICY ...; CREATE POLICY ...` corretivo (sem reverter o resto).

---

## 5. Pós-migração D+1 a D+7

- [ ] Monitorizar `system_audit_log` para erros não esperados.
- [ ] Monitorizar logs de edge functions (especialmente backup/restore).
- [ ] Confirmar que o cron diário de backup às 03:00 UTC corre.
- [ ] Recolher feedback dos utilizadores (Mundo Propício é o único cliente até criarem a 2ª empresa).

## 6. Quando tudo estiver estável (D+7)

- [ ] Aplicar Batch 9 (`NOT NULL`).
- [ ] Criar 1ª empresa-cliente externa (CLOUDSCAPE/Coala) via `/admin/empresas`.
- [ ] Convidar admin da Coala.
- [ ] 🎉 Multi-tenant officialmente em produção.

---

## 7. Decisões pendentes a confirmar antes de começar

| # | Decisão | Default proposto |
|---|---|---|
| L1 | UUID da Mundo Propício em Live: gerar novo ou reutilizar o de Test (`975254b9-…`)? | **Novo** (Test e Live são DBs diferentes) |
| L2 | Promover `pedroneto@mundopropicio.com` a `platform_admin` no momento da migração? | **Sim** (necessário para criar mais empresas depois) |
| L3 | Tornar `company_id NOT NULL` no Batch 9 (D+7) ou esperar mais? | **D+7** se zero erros |
| L4 | Backup completo só do schema novo em D+1, ou manter o backup pré-migração para sempre? | **Manter pré-migração permanentemente** (cofre a frio) |

---

## 8. Custo estimado

- Tempo total dentro da janela de manutenção: **15–25 min**.
- Tempo total de preparação (scripts + revisão): **2h** (aproveita-se o que já foi feito em Test).
- Esforço pós-migração D+1 a D+7: **~30min/dia** de monitorização.
