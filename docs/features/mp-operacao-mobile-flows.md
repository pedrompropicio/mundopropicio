# MP Operação — Fluxos mobile (Batch 2A)

UI mobile-first do módulo Operação. Todas as rotas exigem `view_operacao`.

## Rotas

| Rota | Componente | Função |
|---|---|---|
| `/operacao/equipa` | `MyFrentes` | Lista de Frentes onde o user pertence à equipa (`operacao_frente_team` ativo). Cada cartão mostra cor da Frente, contagens de etapas (pending/in_progress/done) e chamados (open/in_progress). Badge "LEAD" quando `current_lead_id = user`. Prompt opcional de ativação de push. |
| `/operacao/frente/:id` | `FrenteDetail` | Header com cor/lead, 3 tabs (Etapas, Registos, Chamados). Botão "Nova etapa" visível se `manage_operacao_etapas` ou current_lead. |
| `/operacao/etapa/:id` | `EtapaDetail` | Header com escopo/supplier/datas. Botões "Iniciar", "Bloquear", "Concluir" (responsável, lead ou `manage_operacao_etapas`). Botão grande "Registar" abre bottom-sheet com Tipo (Evolução/Observação/Punch), texto, `MediaCapture`, `AudioRecorder`. |
| `/operacao/chamados` | `MeusChamados` | Lista de chamados ligados ao user (autor, membro da Frente, ou lead). 3 tabs: Abertos / Em curso / Resolvidos. Abertos ordenados por `sla_due_at` asc. |
| `/operacao/chamado/novo` | `ChamadoNovo` | Form: Frente (obrig.), Etapa (opcional, filtrada), Prioridade (crit/high/med/low com cores), Descrição (obrig.), media + áudio. SLA é preenchido automaticamente via `trg_operacao_set_sla`. |
| `/operacao/chamado/:id` | `ChamadoDetail` | Header com `PriorityBadge` large, texto, autor, frente/etapa. SLA visual estático (cor + texto). Timeline 4 passos. Ações: **ACK** (lead, status=open), **Iniciar trabalho** (open→in_progress), **Resolver** (modal com texto obrig. + foto opcional → cria registo filho `evolucao` com `metadata.resolves_chamado`). |

Layout `OperacaoLayout` envolve todas — adiciona FAB "+ Chamado" fixo no canto inferior direito (escondido em `/chamado/novo`).

## Fluxo de chamado

```
[abrir] ChamadoNovo
   ↓ INSERT operacao_registros kind=chamado, status=open, priority obrigatória
   ↓ trigger trg_operacao_set_sla preenche sla_due_at / sla_half_at
[ack] Lead da Frente carrega ACK → acked_at, acked_by_profile_id (congela escalação nível 1)
[iniciar] qualquer membro com acesso → status=in_progress
[resolver] modal de resolução → status=resolved, resolved_at, resolved_by_profile_id
            + INSERT registro filho (kind=evolucao, metadata.resolves_chamado=<id>)
```

## Captura de mídia

`MediaCapture` (foto/vídeo) + `AudioRecorder` (webm/opus) usam o bucket privado **`operacao-media`** (signed URLs 1h).

Path convencionado:
```
{company_id}/{event_id}/{registro_id}/{uuid}.{ext}
{company_id}/{event_id}/{registro_id}/{uuid}_thumb.jpg   (vídeo)
```

Para vídeos, gera-se o primeiro frame via canvas como thumbnail e faz-se upload separado. Registo no DB via `operacao_registro_media` (file_url + thumbnail_url + file_type='photo'|'video'). Áudio guarda-se em `operacao_registros.audio_url`.

## Push + WhatsApp escalation

Edge function `send-push-notification` aceita 3 tipos de `target`:

- `{ type: "users", user_ids: [...] }` — explícito (compat)
- `{ type: "frente_team", frente_id }` — resolve membros ativos + `current_lead_id`
- `{ type: "company_admins", company_id }` — admins/managers da empresa

Flag `whatsapp: true` envia também via Twilio (gateway connector) para os mesmos destinatários cujo `profiles.phone` esteja preenchido. Template:
```
🚨 {title}
{body}
{url}
```

Cron `operacao-sla-escalator` (`*/2 * * * *`) faz duas passagens:

| Trigger | Condição | Alvo | WhatsApp |
|---|---|---|---|
| Nível 1 | `sla_half_at ≤ now()`, status=open, sem ack | `frente_team` | false |
| Nível 2 | `sla_due_at ≤ now()`, status in (open,in_progress), `escalation_level<2` | `company_admins` | true se priority in (crit,high) |

## Componentes reutilizáveis

- `PriorityBadge` — variantes `compact` e `large`
- `OperacaoStatusBadge` — kind=`etapa` ou `chamado`
- `FrenteCard` — cartão compacto para listas
- `MediaCapture` / `AudioRecorder` — captura e upload
- `RegistroFeed` — filtrável por `frente_id`, `etapa_id`, `kind`/`kindNot`; carrega mídia em lote + signed URLs lazy
- `NewEtapaDialog` — criação inline de etapa
