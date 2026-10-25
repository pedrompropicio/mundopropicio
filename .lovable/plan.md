# Teste A/B do botão do smart link no iPhone

Lido: `supabase/functions/song-link-event/index.ts` (cálculo de `os`, `ip_hash`, chamada `song_link_event_claim`), `ssr.ts`, migração 0209. A página `/m/…` não é desenhada neste projeto (não encontrei o HTML aqui); vive no portal SSR. A primeira etapa confirma esse ficheiro antes de qualquer edição.

## Como funciona
1. Sorteio no servidor (`song-link-event`), só quando `os='ios'`: variante = `A` se o primeiro byte de sha256(`ab-ios-btn-v1:` + ip_hash) for par, senão `B`. Estável por visitante, 50/50, sem gravar nada novo sobre a pessoa (usa o ip_hash que já existe). Android/desktop: variante NULL, nada muda.
2. A chegada SSR já passa pela função; a resposta passa a incluir `ab_variant`. O portal usa esse valor para desenhar a página: A = igual a hoje; B = botão "Abrir no Spotify" largura total, mínimo 64px, texto grande, fixo no topo, capa logo abaixo, resto da página clicável como hoje. Se a resposta falhar ou não trouxer variante → página A.
3. O browser envia a mesma `ab_variant` no `choice`; a função recalcula-a pelo ip_hash e grava a do servidor (o cliente não decide).
4. Meta CAPI, TikTok, fbc/fbp, event_id, slots e consentimento ficam iguais: a variante só vai para a linha na base, nunca para os payloads externos. Teste garante payloads byte-iguais com e sem variante.

## SQL (R2 — só com "Sim" do Pedro)
```sql
ALTER TABLE public.song_link_events
  ADD COLUMN ab_variant text CHECK (ab_variant IN ('A','B'));
COMMENT ON COLUMN public.song_link_events.ab_variant IS
  'Teste ios-btn-v1: A=página atual, B=botão topo. NULL fora de iOS ou antes do teste.';
```
Mais `CREATE OR REPLACE public.song_link_event_claim` copiado byte-a-byte da versão atual, acrescentando apenas `ab_variant := nullif(p_payload->>'ab_variant','')` no INSERT. Linhas antigas ficam NULL.

## Ficheiros
- `supabase/functions/song-link-event/index.ts` + nova função pura `ab-variant.ts` e teste (A/B estável, só iOS, payloads Meta/TikTok inalterados).
- Página do portal (outro projeto) — editada lá pelo agente desse projeto, depois do OK.
- Deploy só `song-link-event`; Publish pelo Pedro.

## Consulta da taxa de toque
```sql
WITH a AS (
  SELECT event_id, ab_variant FROM public.song_link_events
  WHERE event='arrival' AND os='ios' AND ab_variant IS NOT NULL
    AND created_at >= '2026-10-26')
SELECT a.ab_variant,
       count(*) AS chegadas,
       count(c.id) AS toques,
       round(100.0*count(c.id)/nullif(count(*),0),2) AS taxa_pct
FROM a LEFT JOIN LATERAL (
  SELECT id FROM public.song_link_events c
  WHERE c.event='choice' AND c.arrival_event_id=a.event_id LIMIT 1) c ON true
GROUP BY 1 ORDER BY 1;
```
(Filtrar por `utm_source` para separar Meta/TikTok.)

## Ordem
1. R1: código + testes, sem deploy.
2. R2 "Sim": SQL acima.
3. R2 "Sim": deploy `song-link-event`.
4. Página B no portal; Publish pelo Pedro.

## Pergunta em aberto
- Com o tráfego atual (~430 chegadas iOS/dia pela Meta), detetar de 1,2% para 2,4% precisa de ~1 semana. Duração do teste: 7 dias (recomendado) ou até decisão manual?

---
Nota: o plano #359 (prova do texto aceite no formulário Coala) ficou pronto antes deste pedido e será reapresentado a seguir.
