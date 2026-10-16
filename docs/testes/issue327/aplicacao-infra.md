# #327 — Aplicação infra em Live (16/10/2026, autorização Pedro 16:15 Fortaleza)

O que está aplicado: a infraestrutura do núcleo. O CUTOVER **não** foi corrido. A config `2027-v1` está em **draft** e não há nenhuma ativa. Por isso os valores pagos, os níveis (500/1500) e as regras (150 por indicação, 200 por Crew) continuam iguais. Detalhe máquina em `aplicacao-infra.json`.

## Passos
1. **Git**: local = remoto = `040c52d8`.
2. **Guarda antes**: as 30 funções do snapshot são iguais a Live. Há 2 funções `_clube_newgang_*` (0111) fora do padrão do snapshot; não foram tocadas e o hash ficou igual. ACL das funções de base como esperado; `club_award_fixed` já tinha `service_role`. Não existiam tabelas novas nem `club_points.event_id`. Agregados sem PII registados.
3. **0177**: PENDENTE rev3, em transação atómica.
   - **Desvio**: os corpos ficaram verbatim, exceto `club_points_cutover`. Ficaram de fora 2 linhas de comentário internas, o md5 divergiu do testado, mas não há diferença funcional.
4. **0178**: `club_points_cutover` reposto verbatim (md5 = bateria local `522f1b30…`).
   - **Desvio**: as 6 tabelas tinham herdado os privilégios por omissão do schema (SELECT para anon e escrita para authenticated). A bateria local não os tem, porque não há default privileges do Supabase. Foram retirados: anon sem acesso; authenticated só SELECT, sob RLS de staff+empresa; service_role ALL.
5. **Verificação depois**: 17/17 hashes = bateria local. EXECUTE: anon false; authenticated só em `club_ranking` (pré-existente); service_role true. RLS por empresa + trigger de coesão nas 6 tabelas. Config draft. Membros, pontos, crews, níveis e regras iguais ao antes.
6. **API** (`newgang-portal`): patch compat aplicado + `club-canon.ts` (`fc9da19f…`), testes 13/13, deploy só desta função.
   - **Incidente ~5 min**: `site`/`bundle` responderam 503 `site_not_configured`. Causa: `club_legacy_consumption` (PK com site_id+event_id) criou uma 2.ª relação portal_sites↔events para o PostgREST, e o embed `events(...)` ficou ambíguo (o erro era engolido). Correção: `events!portal_sites_event_id_fkey(...)`, redeploy. A correção foi incorporada no `make_patch.py`; o patch regenerado é igual ao código deployado.
7. **Smoke só de leitura**: `site`, `bundle`, `history`, `lineup` e `ranking` responderam 200. `crew_pending` sem token: 401. Ação inválida: 400. 0 emails/telefones nos payloads públicos.
   - Montra com os valores ATUAIS: join 100, friend 150, Crew 200, attended 100, guess 50.
   - Compra própria e compra indicada aparecem em `rules_unavailable` (sem pontos).

## Compatibilidade com o portal atual (5628c683)
Campos novos opcionais e aditivos:
- `club.rules_unavailable` nos payloads de site;
- `me.level_protected`, `next_level`, `next_level_min` e `referrals`. `level_protected` vem sempre, mesmo quando é false.

Mudanças nos existentes:
- `club.rules` mantém a forma (rule_key/label/points) e só lista as regras disponíveis.
- Saem `friend_bought` e `promo_lot_purchase`, conforme aprovado (compras indisponíveis até haver prova).

## Limitações
- Os 5 minutos de 503 no site/bundle públicos durante a aplicação.
- Não verifiquei outros projetos que façam embeds `portal_sites→events` diretos pela anon key. No ERP não há nenhum.
- `me`/`referrals` não foram testados com sessão real: não foram criados membros nem sessões em Live.
- CI do commit: verificação independente pelo ChatGPT.

## Reversão
Só se uma falha for verificada: `supabase/manual/20261016_issue327.ROLLBACK.sql`, com a API compat mantida. Não faz downgrade de direitos.
