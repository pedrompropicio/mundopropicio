---
name: artist-ads-strategy-generate
description: Proposta de plano de tráfego Meta por LLM no alvo MÚSICA (D-ERP98) — sessão do chamador, fronteira sem crm.*, normalização determinística, plano em rascunho
type: feature
---

Edge function `artist-ads-strategy-generate` (módulo Carreira Artística, alvo MÚSICA,
plataforma Meta). `verify_jwt = true`.

Contrato: `POST { artist_id, song_id, connection_id, orcamento_diario?, objetivo?, notas? }`
→ `{ plan_id, plano, resumo }`.

Regras que não se podem quebrar:

- **Sessão do chamador, nunca service_role.** Cliente com a chave pública +
  `Authorization` do pedido. `artist_ads_plan_create` usa `auth.uid()` em `created_by` e
  valida o papel por `artist_ads_assert_write`; com service_role o plano nasceria sem autor.
- **Fronteira:** não lê nenhuma tabela do schema `crm`. Tráfego só por RPCs
  `public.artist_ads_*`; comparáveis só pela RPC `song_benchmark_aligned` (nunca a vista
  `v_song_benchmark_aligned`).
- **Coletor partilhado** `supabase/functions/_shared/artist-song-snapshot.ts` — o mesmo
  `buildSnapshot` do `artist-song-report`. Alterá-lo obriga a re-deploy das DUAS funções.
- **LLM:** Lovable AI, `google/gemini-2.5-flash`, temperature 0.3, 429 com um retry, 402 →
  `credits_exhausted`, JSON inválido → 502 `ai_invalid_json`.
- **Normalização determinística depois do LLM** (não confiar na saída): objectivo só
  AWARENESS/TRAFFIC/ENGAGEMENT; TRAFFIC só com smart link https; `publico_sugerido.geo`
  nunca vazia (`["BR"]`); máx. 3 conjuntos com um anúncio cada; `post_ref` só de
  `artist_ads_promotable_posts` com `meta_ready=true` (nunca inventado); soma dos orçamentos
  ≤ `available_daily`, corte proporcional; ≥ 100 cents/dia por conjunto; `end_time` obriga
  `start_time` e `end_time > start_time`.
- **Sem DDL:** a justificação vive em `plano.resumo` (`origem`, `modelo`, `gerado_em`,
  `tokens`, `entradas_usadas`, `justificacao`, `hipoteses`, `avisos`), gravado em
  `crm.meta_publish_plan.resumo`. Não existe tabela de log desta geração.
- **O plano nasce em `rascunho`.** A função nunca publica nem activa nada na Meta.
- Fase 1 sem Graph API: sem token decifrado, sem `/search` de interesses, sem audiences.

Ver D-ERP98 e D-ERP95 (F1/F2a/F2b/F3).
