# MP Operação — Fluxos mobile (Batch 2A + Patch 2A.1)

UI mobile-first do módulo Operação. Todas as rotas exigem `view_operacao`.

## Hierarquia visual

**Filosofia (patch 2A.1):** o módulo é antes de mais um diário de obra / planejamento. A ordem visual privilegia documentação contínua; chamados são feature lateral e só ganham relevância no modo `evento`/`post`.

| Camada | Função |
|---|---|
| **Frentes** | Estrutura — quem é dono do quê |
| **Registos** (default) | Memória diária — fotos, notas, áudios, punch |
| **Etapas** | Plano e estado de cada peça da obra |
| **Chamados** | Urgências resolvíveis (lateral em planning/montagem) |

## Rotas

| Rota | Componente | Função |
|---|---|---|
| `/operacao/equipa` | `MyFrentes` | Lista de Frentes onde o user pertence à equipa. Card mostra: nome+LEAD, barra de progresso de etapas (`X de Y concluídas` + %), **última atividade** (kind ≠ chamado), contagem de chamados só se houver E modo for `evento`/`post`. Topo: link discreto "Atividade". |
| `/operacao/atividade` | `Atividade` | Timeline cronológica de Registos (evolução/observação/punch) das Frentes do user. Tabs: Hoje / Esta semana / Tudo. Clica → abre Etapa (ou Frente). |
| `/operacao/frente/:id` | `FrenteDetail` | Header cor/lead. Tabs **`Registos | Etapas | Chamados`** com `Registos` por default. Tab Chamados condicional ao `operacao_mode`. |
| `/operacao/etapa/:id` | `EtapaDetail` | Status controls + botão grande "Registar" abre `RegistroSheet`. |
| `/operacao/chamados` | `MeusChamados` | Lista pessoal. Sem destaque em `MyFrentes`. |
| `/operacao/chamado/novo` | `ChamadoNovo` | Form. |
| `/operacao/chamado/:id` | `ChamadoDetail` | Header com PriorityBadge **compact** + "Aberto há X · prioridade high". Sem texto vermelho "vencido há Y". Botões ACK/Iniciar/Resolver em linha horizontal compacta; primário = ação seguinte óbvia. |

## QuickActionFab — 4 ações

`/operacao/*` tem FAB único (canto inf. direito) que abre bottom-sheet com 4 opções (ordem fixa):

| # | Ação | Ícone | Permissão | Comportamento contextual |
|---|---|---|---|---|
| 1 | **Frente** (Planejar) | `LayoutGrid` | `manage_operacao_frentes` | Abre `NewFrenteDialog` (evento, nome, descrição, cor, lead). Após criar → navega para a frente. |
| 2 | **Etapa** | `ListChecks` | `manage_operacao_etapas` OU current_lead de qualquer Frente | Em `/frente/:id` ou `/etapa/:id` pré-seleciona Frente; senão abre `FrentePickerDialog` primeiro. |
| 3 | **Registo** | `Camera` | `register_operacao` | Em Etapa: pré-seleciona Etapa+Frente. Em Frente: pré-seleciona Frente. Senão pede Frente. Abre `RegistroSheet` (universal). |
| 4 | **Chamado** | `AlertCircle` | `open_chamado` | Em modo `planning`/`montagem` aparece **esmaecido** com tooltip "Disponível durante o evento" mas continua clicável. |

Implementação: `src/components/operacao/QuickActionFab.tsx`. FAB substitui o antigo "+ Chamado" em `OperacaoLayout`.

## operacao_mode condiciona UI

Hook: `useOperacaoMode(eventId)` e `useCurrentOperacaoMode()` (fallback: evento mais recente onde user é team).

| Local | `planning` | `montagem` | `evento` | `post` |
|---|---|---|---|---|
| `FrenteCard` — contagem de chamados | só se >0 | só se >0 | sempre se >0 | sempre se >0 |
| `FrenteDetail` — tab Chamados | escondida se 0 | escondida se 0 | sempre | sempre |
| `QuickActionFab` — opção Chamado | esmaecido | esmaecido | normal | normal |

## Captura de mídia

`MediaCapture` (foto/vídeo) + `AudioRecorder` (webm/opus) usam bucket privado **`operacao-media`** (signed URLs 1h).

Path:
```
{company_id}/{event_id}/{registro_id}/{uuid}.{ext}
{company_id}/{event_id}/{registro_id}/{uuid}_thumb.jpg
```

## Push + WhatsApp escalation

Edge function `send-push-notification` aceita 3 tipos de `target`:

- `{ type: "users", user_ids: [...] }`
- `{ type: "frente_team", frente_id }`
- `{ type: "company_admins", company_id }`

Flag `whatsapp: true` envia também via Twilio para destinatários com `profiles.phone`.

Cron `operacao-sla-escalator` (`*/2 * * * *`):

| Trigger | Condição | Alvo | WhatsApp |
|---|---|---|---|
| Nível 1 | `sla_half_at ≤ now()`, status=open, sem ack | `frente_team` | false |
| Nível 2 | `sla_due_at ≤ now()`, status in (open,in_progress), `escalation_level<2` | `company_admins` | true se priority in (crit,high) |

## Componentes reutilizáveis

- `PriorityBadge` — variantes `compact` e `large` (large reduzido no patch 2A.1)
- `OperacaoStatusBadge` — kind=`etapa`|`chamado`
- `FrenteCard` — progresso + última atividade + chamados condicionais
- `MediaCapture` / `AudioRecorder` / `RegistroFeed`
- `NewEtapaDialog` / `NewFrenteDialog` / `FrentePickerDialog`
- `RegistroSheet` — bottom-sheet universal de registo (substitui versão inline do EtapaDetail)
- `QuickActionFab` — FAB com 4 ações

## Responsáveis de Etapa (Patch 2A.2)

**Modelo:** tabela `operacao_etapa_assignees` (M:N entre `operacao_etapas` e `profiles`) com role `owner | helper`. Unique `(etapa_id, profile_id)`. `responsible_profile_id` na etapa fica para compat e funciona como fallback.

**Hierarquia de display** (em `EtapaAssigneeAvatars`):

1. Há assignees → mostra avatares (owner com coroa primeiro, helpers depois, `+N` se >4)
2. Sem assignees mas `responsible_profile_id` ≠ NULL → avatar do responsible + badge `Responsável herdado`
3. Sem nada → avatar do `current_lead_id` da Frente em cinza + badge `via Frente`

**Quem pode atribuir/desatribuir:**

| Papel | Pode editar |
|---|---|
| admin / `manage_operacao_etapas` | sim |
| current_lead da Frente | sim (mesmo sem perm) |
| auxiliary / observer | sheet abre **read-only** |
| platform_admin | sim |

UI: `EtapaAssigneeSheet` (bottom-sheet com toggle + select owner/helper por membro da Frente). `FrenteTeamSheet` lista equipa por role (lead/auxiliares/observers) no header da Frente.

**Lista de Etapas** (`FrenteDetail` tab Etapas): cada linha mostra `EtapaAssigneeAvatars` em variant `sm` à esquerda do nome.

## Nova rota `/operacao/minhas-tarefas`

Lista de etapas relevantes ao user, em 4 buckets: **Em curso · Pendentes · Bloqueadas · Concluídas hoje**. Regra de relevância: assignee (owner|helper) OU `responsible_profile_id=user` OU lead da Frente e etapa sem assignees. Cada item mostra papel do user na etapa (Owner/Helper/Responsável/via Frente). Link no topo de `MyFrentes`: `Atividade · Minhas tarefas`.
