---
name: Elo de Publicação — Fase 3 (Ativação)
description: Edge function crm-meta-publish-activate e kill switch no MetaPublishPanel; flips de status no Meta, idempotência por meta_status e tratamento HTTP 200 + ok:false em rejeições do Meta
type: feature
---

# Fase 3 — Ativação (Elo de Publicação)

Tira a campanha do PAUSE no Meta (e volta a pôr no PAUSE) sem recriar nada. Mecânica pura, sem LLM.

## Schema (crm.meta_publish_plan)
- `activated_at timestamptz` — quando foi ativada com sucesso a última vez
- `activated_by uuid` — utilizador que ativou
- `activation_error jsonb` — último erro Meta na ativação/pausa (limpa em sucesso)
- Coluna `estado` (texto livre, sem constraint) passa a aceitar também `ativo` e `pausado`.

## Edge function: `crm-meta-publish-activate`
- Log marker: `[meta-publish-activate] BUILD_VERSION=activate-v1`
- Input: `{ company_id, plan_id, acao: 'ativar' | 'pausar' }`
- Auth: JWT do utilizador; valida `plan.company_id === company_id` (mesmo padrão da `crm-meta-publish-execute`); decifra access token Meta via `crm_get_meta_decrypted_token` no link `ad_platform_account_links` primário enabled.
- Pré-condições:
  - **ativar**: `estado ∈ {publicado, pausado}`; existe `meta_campaign_id` e todos os adsets/anúncios têm `meta_adset_id`/`meta_ad_id`.
  - **pausar**: `estado = ativo`; existe `meta_campaign_id`.
  - Falhas pré-condição devolvem `200 + ok:false + error_user_msg` em PT-PT, sem tocar no Meta.
- Flips via `POST /{object_id}` com `{ status: ACTIVE|PAUSED }`:
  - **ativar BOTTOM-UP**: ads → adsets → campanha
  - **pausar TOP-DOWN**: campanha → adsets → ads
- **Idempotência**: cada objeto grava `meta_status` no jsonb `adsets` à medida que o flip é confirmado; objetos já no `targetStatus` são saltados na re-corrida.
- **Sucesso total ativar**: `estado='ativo', activated_at=now(), activated_by=user, activation_error=null`.
- **Sucesso total pausar**: `estado='pausado', activation_error=null`.
- **Falha (crítico)**: NUNCA devolve non-2xx por rejeição do Meta. Grava `activation_error = { acao, error, raw, at }`, mantém `estado` anterior (não promove para `ativo` se a campanha não ficou ACTIVE), persiste o que já avançou (em `meta_status` por objeto) e devolve `HTTP 200 { ok:false, error:<raw>, error_user_msg, resultado:[...] }`.
- Sucesso: `{ ok:true, resultado:[{nivel,id,status}], estado }`.

## UI (MetaPublishPanel)
- `estado='publicado'`: cartão âmbar "Publicada em PAUSA" com `meta_campaign_id`, link Ads Manager e orçamento total/dia. Botão de perigo "Ativar campanha — começa a gastar" (variant `destructive`).
  - Clique abre modal com nome da campanha, total/dia, frase explícita "Isto ATIVA a campanha no Meta agora e vai começar a gastar dinheiro." e **checkbox obrigatória** "Compreendo que a campanha vai começar a gastar" (botão "Ativar agora" disabled até marcar).
- `estado='ativo'`: cartão verde "ATIVA" + **kill switch** "Pausar campanha" (um clique + confirm simples).
- `estado='pausado'`: cartão âmbar "Em pausa" + botão "Reativar campanha" (mesmo modal com checkbox).
- Erros: mostra `error_user_msg` literal vindo do retorno (nunca a genérica do Supabase) + tabela com `resultado` por nível.
- PT-PT; mantém enums Meta (`ACTIVE`/`PAUSED`).

## Notas
- A função reusa o cliente, validação de company, GRANTs e RLS da `crm-meta-publish-execute` — sem políticas novas.
- Re-correr a ativação após falha parcial salta automaticamente os objetos já no `targetStatus` (via `meta_status` no jsonb).
