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

## Notas de pré-ativação (verificações no Ads Manager)
- Pontuação de oportunidade = 2: é normal e esperado. Mede só a adesão às recomendações da Meta (Advantage+), não a qualidade da campanha. Mantido baixo de propósito — funil curado à mão. NÃO aplicar "Aplicar agora" das recomendações de público nem os aprimoramentos Advantage+ de criativo nesta campanha-piloto (target ROAS 8x, teste limpo).
- Aviso "anúncio não veiculado em 15 posicionamentos": NÃO é erro. Cada criativo serve os posicionamentos compatíveis com o seu rácio. Ex.: a imagem estática "Virada de Lote" (0b95f27b, 1080×1440 / 4:5) serve feeds mas não Reels/Stories (querem 9:16). Dentro de cada adset frio os 2 vídeos verticais cobrem Reels/Stories e a imagem cobre os feeds — complementam-se, nenhum posicionamento fica descoberto no conjunto. Melhoria opcional futura: adicionar versão 9:16 da imagem estática.
- Link de destino confirmado no editor do Meta = portal (https://www.mundopropicio.com/pt/eventos/ivete-clareou-2026), Destino principal "Site", "Todos os erros foram solucionados".
- Toggle "Anúncios com vários anunciantes": estava marcado; para teste mais limpo pode ser desmarcado por adset, mas não é crítico.

## Divergência de display: card MP Audience mostra Ticketline (cosmético, NÃO corrigir)
- Sintoma: nos cards de anúncios do MP Audience (CampaignView.tsx), o link mostrado é Ticketline; no Meta o destino real dos 15 ads é o PORTAL (confirmado ad a ad no editor do Ads Manager, campo "URL do site").
- Causa: o card lê o link de `crm.meta_creatives.link_url` (join por `meta_creative_id`, ver CampaignView.tsx L547-559, L683, L1948-1957). Essa coluna é sincronizada do Meta pela edge `crm-meta-sync-creatives` a partir do `object_story_spec` do criativo. Os 15 ads reutilizaram criativos-fonte antigos cujo object_story_spec no Meta tem Ticketline. O destino real do ad (portal) vive no override do ad, não no criativo-fonte.
- Por que NÃO corrigir via UPDATE em `meta_creatives.link_url`: (1) o que conta — destino no Meta — já está correto (portal); (2) o cron `crm-meta-sync-creatives` corre a cada ~3 min e RE-ESCREVE link_url a partir do Meta, revertendo qualquer UPDATE manual; (3) há ~100 linhas com link Ticketline partilhadas com campanhas históricas — filtrar só os 15 desta campanha é frágil e arrisca tocar noutras campanhas.
- Conclusão: divergência puramente cosmética/visual. Não afeta veiculação, destino, nem tracking. Deixar como está. Correção "a sério" (que não vale a pena numa campanha já publicada) seria recriar os adcreatives no Meta com o portal no object_story_spec.

## Tracking do funil — resultado da auditoria (26/06)
Estado do funil de tracking, etapa a etapa:
- Anúncio → clique → PORTAL: OK. Destino confirmado no Meta (ad a ad).
- Portal (mundopropicio.com) — pixel: OK / PERFEITO. Testado ao vivo via browser (network requests reais): fbevents.js carrega; PageView e ViewContent disparam para facebook.com/tr com status 200; ViewContent leva content_ids=["ivete-clareou-2026"], content_name, content_type=event, currency=EUR; pixel id 1647180363218298 correto; ZERO erros de CSP, zero bloqueios. O portal captura bem a primeira metade do funil.
- Ticketline (checkout/Purchase): PARTIDO. Funnel Test 360 (run completed, severity critical) detetou: (1) ViewContent não dispara; (2) CSP com sintaxe inválida — caractere ':' num nome de diretiva, disparado pelo fbevents.js; (3) CSP não autoriza *.facebook.com / *.facebook.net → eventos do pixel (incl. AddToCart/InitiateCheckout) são bloqueados antes de chegar ao Meta ("Refused to connect... violates CSP", "Framing facebook.com blocked"). Isto explica a anomalia da Simone (3818 checkouts vs 25 compras).
- Ação: email técnico preparado para Ticketline (Luísa Rodrigues / Ana Ribeiro) a pedir correção da sintaxe CSP + adicionar domínios Facebook + confirmar ViewContent/value/currency. Não escalar gasto até Ticketline corrigir e revalidar.

## Funnel Test 360 — limitação descoberta (item para auditoria)
- O Funnel Test 360 só sabe testar bilheteiras externas: só existe 1 preset (TICKETLINE) em supabase/functions/crm-meta-funnel-test-run/presets/index.ts. URLs fora de ticketline.pt → backend devolve 400 "unsupported_provider". Não testa o portal próprio.
- Além disso, ao selecionar um evento, o front (src/pages/crm/FunnelTest.tsx, useEffect ~L291-301) auto-preenche o campo com events.ticketing_url (Ticketline), o que mascara a limitação e leva o utilizador a pensar que "a ferramenta troca o link do criativo". O backend respeita o target_url do body; a sobreposição é no front (auto-fill + auto-flow por ?campaign_id/?event_id que usa meta_creatives.link_url).
- Pendência (auditoria): criar preset "portal" (landing → validação PageView/ViewContent) e/ou desacoplar o auto-fill para permitir testar qualquer URL livremente.

## CORREÇÃO DO DIAGNÓSTICO DE TRACKING (26/06, madrugada) — o diagnóstico anterior estava ERRADO

ATENÇÃO: as secções anteriores deste handoff afirmavam que a Ticketline não disparava ViewContent/Purchase e que o funil estava "partido" por CSP. Investigação ao vivo no Events Manager do Meta DESMENTIU isso. O diagnóstico correto é o seguinte:

### O que se provou (com prints do Events Manager, pixel Ivete 1647180363218298, período 29/mai–25/jun):
- A Ticketline ENVIA o funil completo ao pixel: ViewContent (~10 mil), PageView (~7,2 mil), InitiateCheckout (552), **Compra/Purchase (409, ATIVO)**, AddToCart (316). Tudo "Recebido".
- O evento Purchase chega via "Navegador" (pixel no browser) e traz os 3 parâmetros corretos: **currency, content_ids, value**. Confirmado no popup "Parâmetros (3)".
- Logo: a hipótese "Ticketline não envia Purchase / eventos sem value-currency" é FALSA. O CSP detetado pelo Funnel Test 360 era provavelmente artefacto do ambiente headless (Browserless); no browser real os eventos chegam todos.

### O problema REAL (a causa do ROAS subavaliado):
- Qualidade de correspondência (match quality) baixa: ViewContent 6.1, PageView 6.3, InitiateCheckout 5.9 — todas com "Atualização recomendada".
- O Purchase faz correspondência avançada por DADOS PESSOAIS (82%: código postal, email, nome, sobrenome, telefone) mas **NÃO inclui o parâmetro fbc** (identificador do clique do anúncio). Sem fbc no Purchase, o Meta liga mal a compra ao clique → atribuição/ROAS subavaliados.

### Correção do portal (FEITA e VALIDADA ao vivo):
- Causa no nosso lado: o portal anexava o fbclid ao link da Ticketline só via useEffect pós-mount → href inicial (SSR) saía "limpo"; clique rápido abria sem fbclid.
- Fix (abordagem A, no clique): `src/components/EventPage.tsx`, handler `handleTicketClick` agora reconstrói o href com `appendFbclidToUrl(event.ticketing_url)` + `e.currentTarget.setAttribute("href", ...)` SÍNCRONO no clique, antes da navegação. Aplica-se ao COMPONENTE (todos os eventos). Mantém target=_blank/noopener, sem mismatch SSR; captura à entrada e cookie _fbc intactos. Commit ebefed3ed26e3b31ee9a7d44de963833935dbd43. Pedro fez Publish do PORTAL (projeto 26b95793).
- Validação ao vivo (browser real): abrir portal com ?fbclid=TESTE_CLAUDE_VALIDACAO_123 → href do botão "Comprar Bilhete" passou a sair com ?fbclid=... → na Ticketline o pixel converteu-o em **fbc=fb.1.<ts>.TESTE_CLAUDE_VALIDACAO_123** (status 200). Antes do fix o link saía limpo e não havia fbc. Os 5 pixels da página da Ticketline já leem o fbclid e geram fbc no PageView.
- Nota: o fbp diferente na Ticketline NÃO é falha (cookies não cruzam domínios — esperado). Só o fbclid→fbc é vector cross-domain válido.

### O que falta (lado Ticketline):
- A Ticketline precisa de incluir o fbc (e idealmente o fbp) que já capta no PageView TAMBÉM no evento de Purchase (e em AddToCart/InitiateCheckout). É propagar o fbc para os eventos de conversão do mesmo utilizador. Isto sobe a match quality e a atribuição.

### Email à Ticketline (Luísa Rodrigues / Ana Ribeiro):
- ENVIADO em 26/jun (madrugada), SEM os anexos. Pendência: amanhã RESPONDER à thread com 2 prints do Events Manager: (1) lista de eventos recebidos incl. Purchase 409; (2) parâmetros do Purchase (currency/content_ids/value; sem fbc). Os ficheiros são screenshots no Mac do Pedro.

### Pendência operacional:
- Anexar os 2 prints ao email (responder à própria thread) — adiado para 26/jun de dia.
- Não escalar gasto da campanha até a Ticketline incluir o fbc no Purchase e revalidarmos a match quality.
