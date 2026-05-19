# MP Operação — Visão Geral

Módulo de gestão operacional do evento (montagem, dia E, pós). Mobile-first PWA, inspirado no layout de Camarim/Equipa.

## Filosofia: planejamento e documentação primeiro

O produto **não é uma central de chamados de manutenção**. É um diário de obra / sistema de planejamento operacional. A hierarquia visual privilegia, por esta ordem:

1. **Planejamento** — Frentes e Etapas que estruturam o trabalho
2. **Documentação contínua** — Registos (foto/áudio/texto: evolução, observação, punch) construídos diariamente
3. **Chamados** — feature lateral, importante mas pontual; só ganha proeminência em modo `evento` ou `post`

O `operacao_mode` de cada evento (`planning` → `montagem` → `evento` → `post`) condiciona a UI: em planning/montagem os chamados raramente aparecem; em evento/post a tab e os contadores ficam sempre visíveis. Ver `docs/features/mp-operacao-mobile-flows.md` para a matriz completa.


## Modelo conceptual

```
Evento ──< Frente ──< Etapa
              └──< Registro (evolucao | observacao | punch | chamado)
                       ├──< Media (fotos/vídeos)
                       └──< Menções
```

- **Frente**: vertical operacional (Palco, Som, F&B, Segurança…). Tem cor, ordem e líder corrente.
- **Etapa**: tarefa concreta dentro de uma Frente (com supplier/forecast/categoria opcionais, datas planeadas/reais, status).
- **Registro**: log unificado de evolução, observação, punch list ou chamado urgente.
- **Chamado**: tipo especial de registro com `priority` + `status` obrigatórios e SLA automático.

## Hierarquia de equipa (4 + 1 camadas)

| Camada | Roles permitidos | Pode |
|---|---|---|
| Coordenação Geral | `admin`, `manager` | tudo: cria Frentes, gere equipas, recebe escalações |
| Líder de Frente | `field_producer` com `role_in_frente='lead'` | gere Etapas e responde a chamados da Frente |
| Auxiliar Operacional | `field_producer` com `role_in_frente='auxiliary'` | regista evolução, abre chamados, executa |
| Observador Transversal | `manager` com `role_in_frente='observer'` | comenta, recebe notificações, não altera estado |
| Solicitante de chamado | qualquer role com `open_chamado` (incluindo `viewer`) | abre chamado, não fecha |

### Turnos / handover

Tabela `operacao_frentes` tem `current_lead_id` (lead efetivo agora) + `lead_handover_until` (até quando). Cron `operacao-handover-restore` (1/min) restaura automaticamente o lead permanente (`is_permanent_lead=true` no `operacao_frente_team`) quando o handover expira.

## Modos de operação

Campo `events.operacao_mode`: `planning` → `montagem` → `evento` → `post`. Em batches futuros: transição automática nas datas do evento + relatórios diários por modo.

## Permissões (6 novas) e role novo (1)

Role novo: **`field_producer`** (produtor de terreno).

| Permissão | admin | manager | editor | field_producer | viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| `view_operacao` | ✅ | ✅ | ✅ | ✅ | – |
| `manage_operacao_frentes` | ✅ | ✅ | – | – | – |
| `manage_operacao_etapas` | ✅ | ✅ | – | (via lead override) | – |
| `register_operacao` | ✅ | ✅ | ✅ | ✅ | – |
| `open_chamado` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `manage_chamados` | ✅ | ✅ | ✅ | ✅ | – |

Override de líder: o `current_lead_id` da Frente pode criar/editar Etapas mesmo sem `manage_operacao_etapas` (policy em `operacao_etapas`).

## Escalação SLA (2 níveis)

Tabela `operacao_chamado_sla` (config):

| Prioridade | SLA |
|---|---|
| `crit` | 15 min |
| `high` | 60 min |
| `med` | 240 min (4h) |
| `low` | 1440 min (24h) |

- Trigger `trg_operacao_set_sla` calcula `sla_due_at` e `sla_half_at` ao inserir o chamado.
- Cron `operacao-sla-escalator` (2/min):
  - **Nível 1** (metade SLA, sem ack): `escalation_level → 1` + push para leads/observers da Frente.
  - **Nível 2** (SLA total, ainda não resolvido): `escalation_level → 2` + push para admins/managers; se `priority ∈ {crit,high}` também dispara WhatsApp via fluxo Twilio (a integrar com `send-system-reminders` no batch UI).
- Primeira interação do lead grava `acked_at` (congela escalação nível 1).

## Tabelas (8)

| Tabela | Função |
|---|---|
| `operacao_frentes` | Verticais por evento, lead corrente, handover |
| `operacao_frente_team` | Membros da Frente (`lead` permanente / temporário / `auxiliary` / `observer`) |
| `operacao_etapas` | Tarefas dentro da Frente (com FKs opcionais para supplier/forecast/categoria) |
| `operacao_registros` | Log unificado: evolução, observação, punch list, chamado |
| `operacao_registro_media` | Fotos/vídeos anexos (bucket privado `operacao-media`) |
| `operacao_mentions` | Menções a perfis dentro de registros |
| `operacao_chamado_sla` | Configuração global dos tempos de resposta por prioridade |
| `operacao_daily_reports` | Relatórios diários gerados em PDF (montagem/evento/post) |

Todas com `company_id DEFAULT current_company_id()`, RLS habilitado, policy `PERMISSIVE` por permissão + `RESTRICTIVE company_isolation_*`.

## Triggers

- `trg_operacao_set_sla` — BEFORE INSERT em `operacao_registros` → calcula SLA.
- `trg_op_team_lead_sync` — AFTER INSERT/UPDATE em `operacao_frente_team` → propaga `is_permanent_lead` para `operacao_frentes.current_lead_id` quando não há handover ativo.
- `audit_operacao_*_changes` — auditoria genérica em frentes, team, etapas, registros (via `log_table_change`).
- `trg_set_updated_at` — em frentes, etapas, registros.

## Cron jobs

| Nome | Periodicidade | Função |
|---|---|---|
| `operacao-handover-restore` | `*/1 * * * *` | Restaura lead permanente quando `lead_handover_until` expira |
| `operacao-sla-escalator` | `*/2 * * * *` | Sobe `escalation_level` e chama `send-push-notification` (e WhatsApp para crit/high) |

## Storage — bucket `operacao-media`

Privado, signed URLs 1h. Policies:
- SELECT → `view_operacao`
- INSERT/UPDATE → `register_operacao`
- DELETE → `admin` ou `manager`

## Helper de seed (não invocado automaticamente)

`seed_operacao_frentes_default(p_event_id uuid) RETURNS int` — cria 15 Frentes-padrão coloridas para um evento (Coordenação Geral, Palco Principal, Palco Secundário, Som & Luz, Energia & Geradores, Estrutura & Coberturas, Cenografia, F&B, Hospitalidade & Camarins, Credenciamento & Acesso, Segurança, Limpeza, Sinalização, Bilheteria Física, Acessibilidade). A invocar manualmente quando o utilizador entrar no novo módulo pela primeira vez para um evento.

## Próximos batches

- **Batch 2 — UI core mobile**: lista de Frentes, feed de registros, formulário de chamado, captura de áudio/foto, menu rápido.
- **Batch 3 — UI desktop**: painel de coordenação geral, kanban de Etapas, dashboard de SLA.
- **Batch 4 — Extras v2**: relatório diário PDF, integração de WhatsApp completa em `send-push-notification`, transição automática `montagem→evento→post` por datas, transcrição de áudio.

## Batch 2A — UI mobile entregue (2026-05-19)

### Rotas adicionadas
- `/operacao/equipa` — Minhas frentes
- `/operacao/frente/:id` — Detalhe (tabs Etapas/Registos/Chamados)
- `/operacao/etapa/:id` — Detalhe + bottom-sheet "Registar" (Evolução/Observação/Punch)
- `/operacao/chamados` — Meus chamados (Abertos/Em curso/Resolvidos)
- `/operacao/chamado/novo` — Form de abertura
- `/operacao/chamado/:id` — Detalhe com ACK/Iniciar/Resolver + SLA visual

### Componentes
- `MediaCapture` (foto/vídeo), `AudioRecorder` (webm/opus)
- `RegistroFeed`, `FrenteCard`, `PriorityBadge`, `OperacaoStatusBadge`, `NewEtapaDialog`

### Backend
- `profiles.phone` (text, nullable) — destino de WhatsApp
- Edge `send-push-notification` v2: aceita `target: {type, ...}` + flag `whatsapp` (Twilio)
- Cron `operacao-sla-escalator` (*/2 min) → função `run_operacao_sla_escalator()` resolve nível 1 (frente_team) e nível 2 (company_admins + WhatsApp p/ crit/high)

Detalhe operacional em `mp-operacao-mobile-flows.md`.

### Patch 2A.2 — Responsáveis de Etapa

Nova tabela **`operacao_etapa_assignees`** (M:N, role `owner | helper`) adiciona atribuição multi-pessoa a `operacao_etapas`. Coluna legacy `responsible_profile_id` mantém-se como fallback. RLS: SELECT por `view_operacao` na mesma empresa; INSERT/UPDATE/DELETE por `manage_operacao_etapas` ou `current_lead` da Frente. Audit log via `log_table_change()`. Nova rota mobile `/operacao/minhas-tarefas` lista etapas relevantes ao user.

### Patch 2A.3 — Staff de Campo

Nova categoria `profiles.profile_type='field_staff'` para produtores temporários com login restrito à Operação. Onboarding por WhatsApp (Twilio): admin cria staff em `/operacao/staff`, app cria `auth.users` + profile + invite (token 14d) e envia link `/operacao/accept-invite?token=…`. Aceite cria role `field_producer` e devolve sessão. Sidebar mostra só `/operacao/*` para field_staff puros (hook `useIsFieldStaffOnly`). Detalhes em `mp-operacao-staff.md`.

### Batch 2B.1 — Desktop Gerencial

Vista desktop adicionada sem tocar no mobile. Rotas novas: `/operacao` (root, `OperacaoHome` com tabs Frentes + Kanban Etapas), `/operacao/dashboard` (6 KPIs + 3 gráficos + últimos chamados), `/operacao/frente/:id/manage` (editor full-screen, desktop only). Filtros globais via URL search params (`event`, `frentes`, `status`, `kind`) com `useOperacaoFilters`. Drag-and-drop via `@dnd-kit/core` (Kanban) e `@dnd-kit/sortable` (`EtapasTable`). Detalhes em `mp-operacao-desktop.md`.
