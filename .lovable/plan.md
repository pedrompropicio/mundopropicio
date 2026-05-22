
# OP-18 — Multi-lead nas frentes operacionais

## 1. Estado actual (factos)

### Schema
- `operacao_frentes.current_lead_id` uuid → profiles.id (nullable). Index `idx_op_frentes_lead`.
- `operacao_frente_team`: PK id, UNIQUE(frente_id,profile_id), CHECK role_in_frente IN ('lead','auxiliary','observer'), `is_permanent_lead` bool.
- Índice parcial **`uq_op_team_permanent_lead` UNIQUE(frente_id) WHERE role_in_frente='lead' AND is_permanent_lead=true** — esta é a única barreira a multi-lead permanente.
- Trigger `trg_op_team_lead_sync` (AFTER INS/UPD em team) → quando `is_permanent_lead=true` e não há handover ativo, escreve `current_lead_id := NEW.profile_id` na frente.
- Cron `operacao-handover-restore` (1/min) → ao expirar `lead_handover_until`, restaura `current_lead_id` para o `is_permanent_lead=true` da frente.
- RLS de **etapas/registros/chamados** usa `f.current_lead_id = auth.uid()` como override de líder (`op_etapas_ins`/`op_etapas_upd`).
- Trigger `trg_log_lead_change` em `operacao_frentes` (AFTER UPDATE OF current_lead_id) enfileira notificação WhatsApp `lead_atribuido_zona_servico` para o novo lead.
- Edge `send-push-notification`: notifica `current_lead_id` da frente + todos do team (já é multi-destinatário).

### Dados Live (event Coala `5a1da5fb…`)
- 19 frentes, 18 com `current_lead_id` preenchido mas **sem row correspondente em `operacao_frente_team`** (back-fill nunca aconteceu para essas).
- 1 frente (Produção Geral) com `current_lead_id`=Beatriz + 3 outros leads no team — todos com `is_permanent_lead=false` (porque o constraint impede mais que 1 perm).
- 1 frente (Apoio Artístico 29-31 mai) sem lead.

## 2. Inventário de ficheiros/componentes afectados

### Leitura `current_lead_id` (15 ficheiros)
| Ficheiro | Uso |
|---|---|
| `src/pages/operacao/ZonasList.tsx:107` | join `lead:profiles!…current_lead_id_fkey` para mostrar 1 nome |
| `src/pages/operacao/Dashboard.tsx:74,156` | listar frentes + agregar owners únicos |
| `src/pages/operacao/MyFrentes.tsx:46,160` | flag `isLead` baseada em `current_lead_id===user.id` |
| `src/pages/operacao/MinhasTarefas.tsx:31` | filtra frentes `eq("current_lead_id", user.id)` |
| `src/pages/operacao/MeusChamados.tsx:24` | idem |
| `src/pages/operacao/PessoasList.tsx:51,98,150-156` | conta `zonas_lead` por pessoa |
| `src/pages/operacao/PessoaDetail.tsx:70` | lista frentes onde a pessoa é lead |
| `src/pages/operacao/FrenteDetail.tsx:36,105,186-191,258` | mostra avatar único, decide override e badges |
| `src/pages/operacao/EtapaDetail.tsx:38,62-65,85,165` | join lead da frente para mostrar |
| `src/pages/operacao/ChamadoDetail.tsx:32,40` | flag `isLead` |
| `src/pages/operacao/CampoView.tsx:202-222` | scopa frentes por `current_lead_id` ou team |
| `src/components/operacao/event/EditFrenteSheet.tsx` | escreve via `setFrenteLead` (single) |
| `src/components/operacao/equipa/EquipaEventoTab.tsx` (5 usos, linhas 54-287) | UI "Produtores por Frente" — singular |
| `src/components/operacao/desktop/FrenteCardDesktop.tsx:62,117-124` | mostra 1 avatar (lead) |
| `src/components/operacao/FrenteCard.tsx:15` | type prop |
| `supabase/functions/send-push-notification/index.ts:24-34` | já junta `current_lead_id` + team (OK multi) |

### Escrita
- `src/lib/operacao-frente-lead.ts` — helper `setFrenteLead` (single profile). Único ponto de escrita.

### SQL/DB
- Migration `20260519004753…` — DDL + RLS + trigger sync + cron restore.
- Migration `20260520103320…` — trigger `trg_log_lead_change`.
- RLS policies `op_etapas_ins` / `op_etapas_upd` (e equivalentes em registros/chamados/daily_reports) que usam `f.current_lead_id = auth.uid()`.

## 3. Recomendação: **Opção X** (manter `current_lead_id`)

Manter `current_lead_id` como **"lead primário / contacto default"**, nullable, derivado do team (qualquer lead com `is_permanent_lead=true`; se vários, o mais recente).

Justificação:
- 15 ficheiros + 6+ policies RLS lêem-no hoje. Deprecar (opção Y) implicaria reescrever as policies de etapas/registros/chamados/daily_reports para `EXISTS (SELECT 1 FROM operacao_frente_team t WHERE t.frente_id=… AND t.profile_id=auth.uid() AND t.role_in_frente='lead' AND t.active)` — viável mas alto risco a 3 dias do evento.
- Mantém compatibilidade total com triggers (`trg_log_lead_change` → notificação WhatsApp ao "primário") e cron `operacao-handover-restore`.
- O modelo canónico **na UI e nas queries multi-lead** passa a ser `operacao_frente_team WHERE role_in_frente='lead' AND active`. `current_lead_id` fica como ponteiro de conveniência.

## 4. Plano de migração

### M1 — Schema (1 migration)
```sql
-- 1. Relaxar constraint: permitir N leads permanentes por frente
DROP INDEX IF EXISTS public.uq_op_team_permanent_lead;
-- (a UNIQUE (frente_id, profile_id) continua a impedir duplicados do mesmo perfil)

-- 2. Ajustar trigger trg_operacao_frente_lead_sync:
--    - Só promove a current_lead_id se a frente AINDA NÃO tem current_lead_id
--      OU se o lead anterior já não está como lead activo no team.
--    Isto evita que adicionar o 2º lead "rouba" o ponteiro do 1º.

-- 3. Ajustar cron `operacao-handover-restore`: ao restaurar, escolher
--    qualquer is_permanent_lead=true (ORDER BY assigned_at LIMIT 1) — já o faz, mas validar.
```

### M2 — Back-fill (script SQL, Test → Live)
```sql
-- Garantir que todo current_lead_id existe como row 'lead' active no team
INSERT INTO operacao_frente_team (frente_id, profile_id, company_id, role_in_frente, is_permanent_lead, active)
SELECT f.id, f.current_lead_id, f.company_id, 'lead', true, true
FROM operacao_frentes f
WHERE f.current_lead_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM operacao_frente_team t
    WHERE t.frente_id=f.id AND t.profile_id=f.current_lead_id
  );

-- Promover os 3 co-líderes da Produção Geral a is_permanent_lead=true
UPDATE operacao_frente_team SET is_permanent_lead=true
WHERE frente_id='d78ae0c7-…' AND role_in_frente='lead';
```

### M3 — Helper multi-lead (`src/lib/operacao-frente-lead.ts`)
- Manter `setFrenteLead` (compat) mas adicionar:
  - `addFrenteLead({frenteId, profileId, companyId})` — INSERT/UPDATE row com `role_in_frente='lead', is_permanent_lead=true`.
  - `removeFrenteLead({frenteId, profileId})` — UPDATE `is_permanent_lead=false, role_in_frente='auxiliary'` OU `active=false` (UX decide).
  - `setPrimaryLead({frenteId, profileId})` — escreve `current_lead_id` directamente (não mexe no team).

### M4 — UI

| Componente | Mudança |
|---|---|
| `FrenteCardDesktop` (mobile + desktop) | Substituir `team.find(role='lead')` por `team.filter(role='lead')` → renderizar avatares empilhados (AvatarStack com max 3 + "+N"). Tooltip lista todos. |
| `FrenteDetail` cabeçalho | "Produtor:" → "Produtores:" se >1; mostrar lista. Badge "primário" no `current_lead_id`. |
| `EquipaEventoTab` ("Produtores por Frente") | Por frente, listar todos os leads do team em vez de só `current_lead_id`. Manter destaque visual no primário. |
| `EditFrenteSheet` | Substituir `<Select single>` por painel "Produtores da Frente" com lista + botão "Adicionar produtor" (popover de candidatos) + remover. Manter selector "Primário" (radio entre os leads actuais). Reusar padrão do `FrenteTeamEditor`. |
| `ZonasList` | Mostrar "X produtores" em vez do nome único quando >1; senão nome. |
| `MyFrentes`, `MinhasTarefas`, `MeusChamados`, `CampoView`, `PessoaDetail`, `PessoasList` | Trocar filtros `eq("current_lead_id", user.id)` por subquery `frente_id IN (SELECT frente_id FROM operacao_frente_team WHERE profile_id=user.id AND role_in_frente='lead' AND active)`. Usar helper `useMyLeadFrenteIds()` para DRY. |
| `EtapaDetail`, `ChamadoDetail` | `isLead` passa a derivar do team (não só de `current_lead_id`). |
| `FrenteTeamEditor` (já existente) | Já tem checkbox "Perm." só activa em role=lead → remover constraint client-side de "1 primário" agora que DB permite vários. Adicionar coluna/badge "Primário" com radio. |

### M5 — RLS (opcional, fase 2)
As policies `op_etapas_ins`/`upd` (e equivalentes em registros/chamados/daily_reports) usam `f.current_lead_id = auth.uid()`. Com multi-lead, os co-líderes só ganham o override se forem o primário. Para dar override a **todos os leads**:
```sql
-- Substituir condição por:
EXISTS (SELECT 1 FROM operacao_frente_team t
  WHERE t.frente_id=… AND t.profile_id=auth.uid()
    AND t.role_in_frente='lead' AND t.active=true)
```
**Recomendo deixar para depois do Coala** (mudança de RLS = risco). No interim, o "primário" continua a ter override; os outros leads operam via `manage_operacao_etapas` permission (já têm role `producer`).

## 5. Esforço e risco

| Item | Esforço | Risco |
|---|---|---|
| M1 schema (drop index + ajustar trigger) | 15 min | Baixo — index parcial, trigger isolado |
| M2 back-fill | 5 min (Test) + 5 min (Live) | Baixo — INSERT idempotente |
| M3 helper | 30 min | Baixo |
| M4 UI (8 componentes) | 3-4 h | Médio — muitas leituras a alterar |
| M5 RLS | 1 h | Médio-alto — adiar |

**Risco crítico identificado:** o trigger `trg_log_lead_change` dispara WhatsApp **só** quando `current_lead_id` muda. Adicionar 2º lead via team **não** notifica o novo lead. Mitigação: adicionar trigger paralelo em `operacao_frente_team` para `role_in_frente='lead' AND is_permanent_lead=true` que enfileira a mesma notificação (já há infra). Incluir em M1.

## 6. Sequência de dispatches sugerida

1. **DISP-A (DB)**: M1 + M2 em Test → validar com query do Coala (deve dar `leads_in_team≥1` em todas as 18 + os 4 da Produção Geral todos com `is_permanent_lead=true`).
2. **DISP-B (DB Live)**: M1 + M2 em Live (script .txt para Pedro colar).
3. **DISP-C (Helper + Editor)**: M3 + alteração de `FrenteTeamEditor` + `EditFrenteSheet`. Permite a Pedro adicionar leads pela UI já.
4. **DISP-D (Cards/Listas)**: M4 nos componentes de display (FrenteCardDesktop, FrenteDetail, EquipaEventoTab, ZonasList).
5. **DISP-E (Filtros "minhas")**: hook `useMyLeadFrenteIds` + trocar filtros em MyFrentes/MinhasTarefas/MeusChamados/CampoView/PessoaDetail/PessoasList.
6. **DISP-F (validação)**: smoke-test em Live + screenshot dos cards mostrando avatares empilhados.
7. **Pós-evento**: DISP-G com M5 (RLS para dar override a todos os leads).

## 7. Decisões a confirmar contigo

- (a) Confirma **Opção X** (manter `current_lead_id` como primário)? 
- (b) Para WhatsApp de "lead atribuído": notificar **todos** os leads novos ou só o primário? Recomendo todos (trigger novo em team).
- (c) DISP-E pode ficar para depois do evento? Os filtros actuais funcionam — co-líderes só não vêem MinhasTarefas/MeusChamados das frentes onde não são primários. Trade-off: deixar para já garante que os 3 co-líderes da Produção Geral vêem as suas tarefas no portal.
