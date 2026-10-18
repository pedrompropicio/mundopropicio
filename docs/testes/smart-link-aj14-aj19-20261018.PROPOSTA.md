# AJ14 + AJ19 — proposta, não aplicada

Leituras SELECT em 18/10/2026, iniciadas às 05:28 UTC. Nenhuma alteração de produto, tabela, vista, função, deploy, Publish ou entrega externa. AJ19 substitui Meta ListenOpen por ListenClick. A proposta anterior da choice continua inerte e precisa de revisão coordenada; não implementar os dois diffs independentemente.

## Sinal e contrato

“Confirmada” designa aqui o sinal de saída da página, não prova Spotify aberto nem stream.
Armar enquanto visible antes do redirect Android android_inline/android_intent/retry, ou no primeiro toque iOS dirigido à abertura da app. Um retry Android pode rearmar a janela, mas não um segundo envio. No visibilitychange para hidden, se 0 <= tempo decorrido <= 6000 ms, enviar uma vez por chegada através de sendBeacon e Blob text/plain;charset=UTF-8 para song-link-event. Não disparar se a página já estava hidden quando se armou, por pagehide isolado, toque “outro”, destino Instagram/seguir artista ou botão web.

Corpo proposto (IDs fictícios):
```json
{"event":"app_open","slug":"rs-meta","arrival_event_id":"00000000-0000-4000-8000-000000000002","event_id":"00000000-0000-4000-8000-000000000002:open","destination":"spotify","opened":"app","mode":"android_intent","elapsed_ms":850,"page_url":"https://www.mundopropicio.com/m/rs-meta"}
```
O Portal encaminha os mesmos ttclid/ttp e identificadores Meta disponíveis e permitidos pelo consentimento; não inventar cookies nem acrescentar armazenamento de IP. ttp não está persistido em song_link_events: tem de acompanhar o pedido quando disponível. Identidade/empresa/UTMs vêm do link e da chegada resolvidos pelo servidor.

Origem: chegada SSR real do mesmo slug/link/empresa, não futura e com menos de 2 h; link ativo/destino configurado. Sem Origin/Referer só este vínculo validado permite o pedido; headers presentes e inválidos continuam recusados. UUID é capacidade efémera, não autenticação nem prova de hidden: estes campos podem ser forjados por quem conhece uma chegada válida. Máximo um app_open por chegada, com claim atómica antes de entrega externa. Nada entra diretamente na tabela pelo Portal.

200 ok significa pedido persistido/agendado, não API entregue; 200 duplicate significa sem nova entrega; 400 payload inválido, 403 origem/chegada inválida, 404 link, 429 limite, 500 falha interna. Beacon não disponibiliza a resposta ao Portal; sua aceitação na fila não prova HTTP200. Prova futura por leitura dos registos/status e códigos de teste.

## Eventos e deduplicação entre choice e abertura

- ViewContent na chegada: absolutamente igual, nome, ID, enrichment e entrega existentes.
- Meta: ListenClick tanto na choice elegível como em app_open; nunca ListenOpen. Máximo um ListenClick por chegada, inclusive choices de destinos diferentes. Guardar as choices por chegada+destino permanece válido: deduplicação do registo não é deduplicação da conversão Meta.
- TikTok: app_open envia CompleteRegistration uma vez por chegada. Choice mantém ClickButton com o UUID próprio já partilhado com o pixel TikTok; são eventos distintos, não transformar automaticamente ClickButton em CompleteRegistration.
- ID Meta canónico proposto: arrival_event_id + ':open', distinto do ViewContent e partilhado entre os dois gatilhos ListenClick. O app_open tem esse ID próprio; o registo choice conserva o UUID original, mas sua entrega/pixel Meta ListenClick usa o ID canónico. TikTok ClickButton continua com o UUID da choice e CompleteRegistration usa ':open'. Esta diferença por fornecedor tem de aparecer explicitamente no próximo diff/contrato Portal.
- O pixel Meta browser só dispara com consentimento, sempre ListenClick e o mesmo ID canónico da CAPI; o Portal precisa de uma trava local por chegada. Se o pixel for carregado apenas depois do hidden pode não executar: não atrasar o beacon à espera dele nem prometer cobertura browser total. Não criar novo pixel TikTok de CompleteRegistration sem âmbito/autorização.
- Reutilizar apenas o ID nos fornecedores não basta: o servidor tem de reservar atomicamente o slot (chegada, fornecedor, evento), sob lock da chegada, antes da entrega, para duas funções concorrentes não enviarem ambos. Máximo um slot Meta ListenClick partilhado choice/open; máximo um TikTok CompleteRegistration para open. Perder o slot Meta não deve suprimir o registo app_open nem seu TikTok CompleteRegistration.
- Não usar capi_status='enviado' de uma choice como único guard: a entrega é assíncrona e há uma janela antes desse status. Definir estado persistido de reserva/entrega e recuperação com o mesmo ID; falha/resultado desconhecido não autoriza um ID novo ou reenvio cego. O mecanismo exato e o DDL de suporte serão apresentados no diff após autorização de preparação, sem afirmar que só mudar a check resolve concorrência.
- Há tensão semântica deliberada: choice pode consumir ListenClick antes da abertura confirmada. Logo ListenClick continua a representar choice OU hidden; só o registo app_open mede o subconjunto confirmado pelo sinal. Cumpre AJ19, mas não torna todos os ListenClick confirmações de app.

## A versus B — DDL exato das checks, inerte

Recomendação A: registo app_open em song_link_events. Mantém chegada, choice e abertura no mesmo caminho song-link-event e permite capi_status/tiktok_status e auditoria da deduplicação sem transformar telemetria numa via de marketing. Não alterar relatórios consumidores automaticamente.

```sql
-- PROPOSTA A. NÃO APLICAR. Futuramente só migração oficial tracked.
BEGIN;
ALTER TABLE public.song_link_events
  DROP CONSTRAINT song_link_events_event_check;
ALTER TABLE public.song_link_events
  ADD CONSTRAINT song_link_events_event_check
  CHECK (event IN ('arrival', 'choice', 'app_open'));
COMMIT;
```

A alteração acima preserva todos os eventos atuais. Não é uma migração completa: arrival_event_id, claim/índice por chegada e slots Meta têm de ser revistos com a proposta choice ainda não aplicada; não aplicar esta check isoladamente.

B: um novo diag kind app_open, mas também há DDL; não é “sem DDL”. O diagnóstico não tem colunas de status dos fornecedores nem os identificadores completos de entrega. Envio direto a partir do diag existente é incompatível com a regra de entrada exclusiva song-link-event; para manter essa regra, song-link-event teria de orquestrar a persistência no diag e as entregas. Necessita igualmente claim durável contra choice, não apenas um beacon extra.

```sql
-- PROPOSTA B, alternativa não recomendada. NÃO APLICAR.
BEGIN;
ALTER TABLE public.song_link_diag
  DROP CONSTRAINT song_link_diag_kind_check;
ALTER TABLE public.song_link_diag
  ADD CONSTRAINT song_link_diag_kind_check
  CHECK (kind IN (
    'shown', 'tap_button', 'tap_other', 'hidden', 'visible',
    'pagehide', 'redirect', 'prefetch',
    'feedback_shown', 'tap_repeat_blocked', 'app_open'
  ));
COMMIT;
```

As duas definições atuais foram lidas em Live: events aceita arrival/choice; diag aceita os dez kinds acima sem app_open. Nenhum SQL aplicado. Não emitir grants nem alterar permissões nesta proposta.

## Volume semanal — factos versus cenários

Janela reproduzível: 11–17/10/2026 inclusivos America/Fortaleza, UTC [11/10 03:00, 18/10 03:00). Não é uma janela móvel terminada às 05:27. Números diferentes do auditor (5.199/118) não foram ajustados: nesta janela rs-meta tem 5.163 tentativas Android app e 117 choices, incluindo 36 iOS; falta a janela/hora exata do auditor. 118/5.199=2,27%, ou 97,73% de diferença bruta de volumes; não prova quais chegadas ficaram sem conversão porque as choices não estão vinculadas.

rs-meta: 8.726 arrivals brutas, 7.491 chaves AJ16, 4.815 chaves com alguma tentativa Android app; 193 chegadas SSR iOS com primeiro toque observado.
rs-tt: 136.905 arrivals brutas, 106.068 chaves AJ16, 65.146 tentativas app (65.144 Android + 2 iOS), 48.932 chaves com alguma tentativa app; zero primeiro toque iOS observado no diag.
Chave AJ16 usada apenas para estimativa: ttclid > fbclid > ip_hash+slug+dia Fortaleza; sem identificador, linha independente. bool_or(app) considera qualquer repetição. NÃO é o limite técnico “um por arrival_event_id”: dedupe por chave de tráfego e por chegada SSR são populações diferentes.

Há 155 IDs de chegada rs-meta com hidden e trigger elegível observado em <=6 s, e zero rs-tt, cruzados com chegada SSR/OS/slug e redirects android_inline/android_intent/retry ou primeiro toque iOS. Isso não é taxa de abertura: rs-tt tem apenas 10 hidden para 67.696 chegadas com redirect diagnóstico, cobertura insuficiente. Não extrapolar zero confirmações TikTok nem usar o quociente para prever sucesso.

Sem taxa medida de hidden/entrega/consentimento, estimativa é cenário, não previsão comprovada:
- Meta tráfego rs-meta, base 4.815 tentativas únicas Android: hidden em 25% / 50% / 75% => aproximadamente 1.204 / 2.408 / 3.611 eventos semanais candidatos. Primeiro toque iOS, base193: acrescentaria 48 / 97 / 145 no mesmo cenário, antes de eliminar sobreposição. Ordem de grandeza combinada ~1.252 / 2.504 / 3.756, não soma de ListenClick choice+open.
- TikTok tráfego rs-tt, base48.932 tentativas únicas: 25% / 50% / 75% => ~12.233 / 24.466 / 36.699 CompleteRegistration candidatos semanais.
- Teto bruto de sinais nas tentativas históricas conhecidas: Meta5.163 Android, TikTok65.146 app; iOS só acrescenta após toque. Não tratar teto como previsão.
- Eventos realmente enviados = candidatos x elegibilidade de consentimento aplicável x entrega bem-sucedida, menos ListenClick já reservado por choice na mesma chegada. Não inventar esses fatores.
- Ambos os links têm ambos os pixels. Os números acima são por origem de tráfego para otimização, NÃO totais por endpoint: se a entrega para ambos continuar, o pixel Meta também recebe ListenClick de rs-tt e o TikTok recebe CompleteRegistration de rs-meta. Isso não prova atribuição à campanha; manter breakdown por canal, campanha e conjunto.
- A referência Pedro25–50 por semana por conjunto não pode ser verificada dividindo o total arbitrariamente: faltam conjuntos ativos, atribuição e distribuição. É objetivo do pedido, não garantia de otimização.

## Falsos positivos e futura aceitação

hidden pode ser troca de app, bloqueio do ecrã, central de notificações ou fecho do navegador, sem abrir Spotify; deep link falhado também pode coincidir com hidden. App realmente aberta sem hidden observado gera falso negativo. O limite6s reduz ambiguidade, não elimina.

Medir por OS/in_app/canal/destino: tentativas -> hidden<=6s -> app_open persistido -> APIs aceites; separar retorno visible rápido e dedupe. Comparar séries diárias com streams e listeners no mesmo mercado/música, lag e períodos de controlo. Conversão API não é stream: dados agregados não permitem identificar falsos positivos pessoa a pessoa nem inferir causalidade. Só instrumentação/controlos próprios futuros permitem estimar a taxa.

Após OK do Pedro: rever diff conjunto choice+AJ14/AJ19, migração tracked completa com guards/ACL/concorrência, testes de ambos os pedidos em ordens diferentes e duas conexões, browser consentido/recusado, ViewContent intacto, prova controlada Meta/TikTok com códigos reais e status. Nesta entrega: nenhuma função/vista criada, nenhum deploy, nenhuma ativação.