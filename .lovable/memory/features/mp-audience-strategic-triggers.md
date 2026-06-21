---
name: MP Audience — Gatilhos Estratégicos (Camada 1)
description: Catálogo global de gatilhos + activações por evento; substitui o abandonado event_commercial_context. Painel manual na CampaignView, alimenta futura validação de mensagem.
type: feature
---

# Gatilhos Estratégicos do Evento

Camada 1 (fundação) da feature "Montagem Assistida". **Substitui a abordagem `event_commercial_context`** (lote/preço/virada como fotografia da bilheteira), agora abandonada por decisão de produto.

Conceito: a estratégia de uma campanha assenta em **gatilhos** (de escassez, antecipação, narrativa ou calendário). Os gatilhos são declarados **manualmente** — o sistema nunca os infere a partir de bilheteira nem de outra tabela.

## Modelo de dados (schema `crm`)

Três tabelas:

### `crm.strategic_trigger_catalog` — catálogo global por company
- `company_id`, `chave` (slug, UNIQUE por company), `nome`, `tipo` (`escassez|antecipacao|narrativa|calendario`), `descricao`
- `carrega_afirmacao_factual boolean` — `true` quando o gatilho faz uma alegação verificável que vai parar à copy (ex.: "o lote vai virar"); `false` quando é só enquadramento/timing (ex.: início do mês). **Usado pela camada futura de validação de mensagem** para decidir se uma alegação na copy precisa de gatilho activo a respaldá-la.
- `is_seed boolean` — distingue base semeada vs. criada pelo utilizador.

### `crm.event_active_triggers` — quais gatilhos estão activos num evento
- `event_id` → `public.events(id)` ON DELETE CASCADE
- `trigger_id` → `strategic_trigger_catalog(id)` ON DELETE RESTRICT
- `estado` (`activo|expirado`), `validade date?`, `detalhe text?`
- UNIQUE (`event_id`, `trigger_id`) — reactivar = editar a linha.

### `crm.event_active_triggers_log` — append-only, auditoria
- Escrito por trigger `event_active_triggers_write_log()` (`SECURITY DEFINER`, AFTER INSERT/UPDATE/DELETE). A app nunca escreve directamente.
- `action` (`insert|update|delete`), `old_state`/`new_state` em JSONB.

## RLS (padrão `crm.meta_campaign_diagnoses`)

Em todas as 3 tabelas:
- `service_role_bypass` (ALL, true/true)
- `tenant_isolation_{select,insert,update,delete}` para `authenticated` com `company_id = current_company_id()`

Log: só `SELECT` para `authenticated` no mesmo company; escrita exclusivamente via trigger SECURITY DEFINER.

## Seed (Mundo Propício, idempotente via `ON CONFLICT (company_id, chave) DO NOTHING`)

5 gatilhos base, todos `is_seed=true`:
- `mudanca_lote` — escassez, factual
- `contagem_regressiva` — antecipação, factual
- `ultimos_bilhetes` — escassez, factual
- `momento_artista` — narrativa, não-factual
- `janela_liquidez` — antecipação, não-factual

## Painel UI

Componente: `src/components/crm/StrategicTriggersCard.tsx`
Ponto de entrada: `src/pages/crm/CampaignView.tsx`, cartão antes do "Histórico" da campanha. Opera sobre `campaign.linked_event_id`. Quando `null`: estado vazio "Campanha sem evento associado — associe um evento para definir gatilhos estratégicos."

- Lista dos activos (nome + badge de tipo colorida + estado + validade + detalhe). Editar (estado/validade/detalhe) e remover inline.
- "Adicionar gatilho" → diálogo com gatilhos do catálogo ainda não activos no evento.
- "Criar novo gatilho" → formulário no catálogo (`is_seed=false`), chave gerada por slugify do nome; após criar, activa logo no evento.
- "Histórico" colapsável: últimas 10 entradas do log com diff campo a campo.

Cores das badges por tipo: escassez (vermelho suave), antecipação (azul), narrativa (roxo), calendário (cinza).

## Notas

- **Sem edge function** — painel fala directo com as tabelas via supabase-js (RLS aplica). Sem marcador `BUILD_VERSION`.
- Não toca no diagnóstico (`crm-campaign-diagnosis`) nem no redesign.
- **Substitui** `crm.event_commercial_context` (+ log + triggers + componente `EventCommercialContextCard`), removidos na mesma migration.
