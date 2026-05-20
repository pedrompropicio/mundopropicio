# WhatsApp Notifications — Fase 1 (MVP Grupo A)

## Objetivo
Enviar notificações operacionais via **Meta WhatsApp Cloud API** aos utilizadores do MP Gestão Eventos. MVP cobre 4 eventos operacionais do Grupo A. Brasil entra em fase futura com mesma estrutura.

## Arquitetura

```
event_team_members INSERT ──┐
operacao_frentes UPDATE  ───┤
operacao_etapas UPDATE   ───┼──► triggers ──► enqueue_whatsapp_notification(RPC)
events UPDATE            ───┘                          │
                                                       ▼
                                              notification_queue (status='queued')
                                                       │ cron 1/min
                                                       ▼
                                              whatsapp-dispatcher (edge fn)
                                                       │ POST graph.facebook.com
                                                       ▼
                                              status=sent, meta_message_id
                                                       │
                              webhook ◄────── Meta ────┘
                                 │
                                 ▼
                          status=delivered/read/failed
                          + opt-out detection (PARAR/STOP/SAIR/CANCELAR)
```

## Templates Grupo A (4)

| Template | Trigger | Destinatário | Params |
|---|---|---|---|
| `equipe_atribuicao_evento` | `INSERT event_team_members` | membro adicionado | nome, role_label, evento, fase |
| `lead_atribuido_zona_servico` | `UPDATE operacao_frentes.current_lead_id` | novo lead | nome, tipo (Zona/Serviço), nome frente, evento |
| `etapa_status_alterado` | `UPDATE operacao_etapas.status` | lead da frente | etapa, tipo, frente, novo status |
| `fase_evento_avancou` | `UPDATE events.operacao_mode` | diretor + produtor geral + leads | evento, nova fase |

Todos pt_PT, categoria UTILITY, status=pending até aprovação Meta.

## Componentes

**DB:** `notification_templates`, `notification_optin`, `notification_queue`, `notification_log`, coluna `profiles.whatsapp_phone`. Helper RPC `enqueue_whatsapp_notification(template, profile, params, event?, ctx_type?, ctx_id?)` — só enfileira se template='approved' E opt-in ativo.

**Edge functions:**
- `whatsapp-dispatcher` (cron 1/min) — pega batch de 50 queued, locka via UPDATE→sending, POST Meta, marca sent/failed, máx 3 tentativas.
- `whatsapp-webhook` — GET handshake Meta; POST processa statuses e mensagens inbound (opt-out). Sempre devolve 200.

**UI:**
- `/admin/notifications` (admin/platform_admin) — 3 tabs: Templates, Fila & Histórico, Opt-in.
- `/perfil` (utilizador) — opt-in self-service, validação E.164, checkbox desmarcado por default.

## Secrets necessários
`META_WA_PHONE_NUMBER_ID`, `META_WA_SYSTEM_TOKEN`, `META_WA_WABA_ID`, `META_WA_APP_ID`, `META_WA_WEBHOOK_VERIFY_TOKEN`.

## Configuração pós-deploy (Pedro)
1. Adicionar 5 secrets em Lovable Cloud.
2. Registar webhook na Meta App: `https://ukpuhoynrqobqtzdbysp.functions.supabase.co/whatsapp-webhook` com o `verify_token` do secret.
3. Submeter 4 templates à Meta (texto idêntico ao `body_text` de cada `notification_templates`).
4. Após aprovação, `UPDATE notification_templates SET status='approved' WHERE template_name=...`.
5. Configurar cron pg_cron a chamar `whatsapp-dispatcher` 1/min.

## Notas
- Twilio (`_shared/twilio.ts`) é independente e continua para staff invites / system reminders.
- Brasil: fase futura usa mesma infra com idioma `pt_BR`.
