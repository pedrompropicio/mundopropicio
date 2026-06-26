# Handoff — Publicação Meta da campanha Ivete Clareou (26/06/2026)

## Resultado final
- Campanha criada no Meta EM PAUSA: `120255473280780595` (objetivo Vendas/OUTCOME_SALES, ABO lifetime).
- 6 adsets, 17 anúncios, orçamento total €10.000, janela 28/06 00:01 → 09/07 23:59 (lifetime).
- Idades 22-65 em todos os adsets. Link de destino: portal `https://www.mundopropicio.com/pt/eventos/ivete-clareou-2026` (mesmo pixel no portal e no Purchase da Ticketline → tracking de Vendas mantém-se).
- Plano `crm.meta_publish_plan` id `93529702-76c7-491f-95dd-040ed7fcee25`, estado `publicado`, sem erro.
- Pendente: ativação manual no Ads Manager (campanha + adsets + ads nascem em pausa).

## Bugs corrigidos nesta sessão (código)
1. Idades revertiam de 22-65 para 25-55 ao reabrir o painel. Causa-raiz: o `crm-meta-publish-prepare` gravava `mergedAdsets` (preservados) na BD mas DEVOLVIA `adsetsOut` (output Gemini não preservado); o auto-save do painel reescrevia os 25-55 por cima. Havia ainda colisão no match por `trigger_id` (a Ivete tem 3+3 trigger_ids repetidos).
2. Corrida concorrente: reabrir o painel a meio de uma publicação disparava prepare e baralhava o estado.

Correções deployadas (Pedro fez Publish):
- `MetaPublishPanel.tsx` (v7): ao abrir, CARREGA o plano existente por design_id em vez de chamar sempre prepare; só chama prepare se não houver plano. Botão manual "Regenerar plano" (oculto em a_publicar/publicado).
- `crm-meta-publish-prepare` (v8, BUILD_VERSION `publish-prepare-v8-preserve-publico-noop-lock`): resposta devolve `responseAdsets = mergedAdsets`; merge com fallback por índice `prevByKey.get(keyOf(a)) ?? prevArr[idx]`; guard no-op para estados bloqueados [a_publicar, publicado, ativo, pausado, cancelado]; reusableStates passou a [rascunho, pronto_a_publicar, falhado].

## Erros operacionais resolvidos (não-código)
- Termos de Custom Audience aceites por Pedro no Ads Manager (subcode 1870090).
- Thumbnail de vídeo (subcode 1363054) corrigido em sessão anterior (publish-execute-v15).
- Timeouts do execute em campanha grande: cria parcial e fica preso em `a_publicar`. Solução aplicada: destravar via UPDATE estado→`pronto_a_publicar` preservando meta_campaign_id + meta_adset_id + meta_ad_ids; reclicar publicar (motor idempotente retoma só o que falta).
- Audiência de outra conta: o adset frio "Momento do artista/evento" usava `[IG] Seguidores @maiaraemaraisa` (`120232491472590595`), criada na conta `maiaraemaraisa` — Meta recusou (subcode 3867050). Substituída por `[IG] Seguidores @ensaiosdaanitta` (`120246318102710595`, 426k, da conta `mundopropicio`). O adset partido (`120255473452370595`) foi apagado manualmente no Ads Manager e recriado limpo pelo motor.

## Campanhas-lixo apagadas no Meta (manual, Pedro)
`120255467612660595`, `120255472327660595`, e o adset partido `120255473452370595`. NÃO apagar a `[REDESIGN] Ivete Clareou 2026` (campanha antiga com vendas reais, ROAS 1.83x).

## Próximos passos
1. Ativar a campanha `120255473280780595` no Ads Manager quando pronto (campanha + 6 adsets + 17 ads).
2. Antes de ativar: abrir 1 ad no preview do Meta e confirmar destino (portal) e criativos.
3. Confirmar no Events Manager que o pixel Ivete (`1647180363218298`) recebe Purchase via portal→Ticketline.
4. Avaliar os 3 avisos da publicação (recomendações Meta — provavelmente cosméticos).
5. Verificação de Anunciante Google Ads — prazo 21/jul/2026 (ação manual de Pedro).
