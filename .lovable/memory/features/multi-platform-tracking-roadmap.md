# Roadmap — Tracking multi-plataforma (event_trackers)

**Estado:** Planeado · item nº1 do roadmap multi-plataforma
**Criado:** 2026-05-28

---

## Contexto

O MP Audience hoje só integra **Meta Ads**. O roadmap inclui **Google Ads** e
**TikTok Ads**. Cada plataforma tem o seu próprio mecanismo de tracking de
conversão (Meta: pixel/`promoted_object`; Google: conversion action / gtag;
TikTok: pixel TikTok). Não existe hoje uma fonte de verdade que ligue
**evento × plataforma × tracker**.

## Decisão

Item **nº1** do roadmap multi-plataforma: criar a tabela canónica

```
event_trackers (
  event_id        uuid,      -- evento MP (crm/public events)
  platform        text,      -- 'meta' | 'google' | 'tiktok'
  tracker_id      text,      -- pixel_id (Meta), conversion_id (Google), pixel_code (TikTok)
  tracker_metadata jsonb,    -- ex.: { custom_event_type: 'PURCHASE' } no caso Meta
  ...
)
```

Com UI para o Pedro associar, por evento, o tracker de cada plataforma.

## O que vai substituir

A **leitura ad-hoc do pixel da campanha-fonte** no deploy Meta
(`supabase/functions/crm-meta-strategy-deploy/index.ts`, bloco marcado com
`DEBT(multi-platform)`), que infere o `promoted_object` a partir dos adsets da
campanha-fonte em `crm.meta_adset_snapshot.raw->'promoted_object'`. Esse caminho:
- só funciona para Meta;
- só funciona quando existe uma campanha-fonte sincronizada;
- não tem equivalente para Google/TikTok (não há "campanha-fonte Meta" de onde herdar).

## Por que não foi feito agora

**Caminho C (pragmático com dívida explícita):** o objetivo imediato era
destrancar o **primeiro deploy real Meta da Ivete** sem construir tabela + UID +
UI de trackers. A inferência a partir da campanha-fonte resolve o caso Meta hoje;
a tabela `event_trackers` fica registada aqui como dívida assumida.

## Critérios para promover este item

Promover (i.e., construir `event_trackers` + UI + migração do deploy Meta para
ler daqui) quando **começar trabalho de integração de Google Ads OU TikTok** —
nesse momento a inferência por campanha-fonte deixa de ser suficiente.
