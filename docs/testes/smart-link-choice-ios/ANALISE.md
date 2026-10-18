# Choice iOS — diagnóstico e proposta, 18/10/2026 UTC

Só SELECT em Live; nenhuma conta, request negativo, DML, DDL, deploy ou Publish.
Função ativa intacta. Candidatos em ficheiros PROPOSTA/candidate; não são imports do produto nem migrações aplicadas.

## Diagnóstico

SQL, rs-meta, intervalo fechado 11/10 03:45 até 18/10 03:45 UTC:
195 arrival_event_id distintos com tap_button; 378 toques; zero IDs de chegada ausentes no diag.
117 choices; 36 iOS; zero choices com event_id de arrival.
Últimos 3 dias no mesmo horário: 67 choices; 22 iOS (13 Instagram, 8 Facebook, 1 outro); 45 Android (22 Instagram, 23 Facebook).
Estes são eventos gravados, NÃO resultados HTTP nem taxa de entrega.

Ferramentas de logs consultadas com janela pedida de 3 dias. A resposta disponível começa apenas em 18/10 03:36:52 UTC.
Não se infere retenção configurada nem ausência histórica de requests desta limitação.
Consulta dos requests de song-link-event: 20 linhas estruturadas disponíveis; 15 HTTP observáveis, todos 200, sem evento no body.
Os logs atuais só contêm slug/via/outcome/famíliaUA/Origin-presente; faltam event, Referer-presente e OS.
Busca textual choice: nenhum resultado. Logo não é possível classificar só choice em 200/duplicado/403/4xx nem cruzar iOS+Instagram/Facebook com headers.
Ausência das chaves de Origin/Referer no mapa HTTP NÃO prova ausência dos headers no request.

Fonte index.ts: browser sem Origin e sem Referer permitido recusa403 forbidden_origin ANTES de ler o body.
Assim, a hipótese é compatível com o código, mas não comprovada nos logs. Não foi desmentida.
O diag direto por fetch e choice por beacon são caminhos diferentes; tocar não prova que o beacon foi recebido.

## Proposta

arrival_event_id TEXT nullable, com validação UUID para novas choices; TEXT acompanha o event_id existente sem cast de dados históricos.
event_id da choice continua UUID próprio, estável por chegada+destino no Portal. arrival_event_id aponta à chegada SSR.
Não usar o mesmo event_id: o índice atual (event_id,event) permitiria arrival+choice, mas bloquearia um segundo destino legítimo da mesma chegada.
Além disso enrichment é reservado a arrival; choice ligada sai cedo no duplicado, sem recovery/novaUUID/reentrega.

RPC nova service_role-only, SECURITY INVOKER, envolve a claim canónica sem modificar corpo/owner/ACL.
Resolve link ativo+destino configurado; exige arrival SSR do mesmo link/empresa, não futura e com idade estritamente <2h.
FOR UPDATE da chegada, revalidação do prazo depois do lock, índice único parcial (link_id,arrival_event_id,destination).
Máximo um registo/entrega por chegada+destino mesmo com UUID novo ou concorrência. Só vencedor segue para entrega existente.
Attribution UTMs/identidade derivadas da chegada/link; não aceita company/artist/song do Portal.
Sem header fallback para Origin/Referer presentes mas inválidos. Headerless apenas choice vinculada e válida; nunca arrival/prefetch/SSR forjada.
Contrato final exige arrival_event_id em TODA choice, incluindo Origin permitido; coordenar Portal para não deixar clientes antigos a emitir payload sem vínculo.
Arrival UUID é uma capacidade efémera, não autenticação da pessoa: quem o obtiver pode consumir no máximo um slot por destino. Não prometer spam zero contra quem cria visitas reais.
Mantém limite IP existente; não usa IP para ligar pessoa (IP iOS pode mudar).

## Contrato Portal

POST à URL configurada de song-link-event, fetch keepalive, mode cors, credentials omit.
Content-Type text/plain;charset=UTF-8; JSON.stringify(body); sem Authorization/apikey/x-client-info/segredoSSR.
Pedido simples sem preflight. CORS existente já permite POST/OPTIONS e headers usuais; nenhum relaxamento para origens hostis.
Não tentar definir Origin/Referer manualmente. Em fetch normal browser envia Origin do Portal, permitindo ler resposta.
Se o runtime realmente omitir Origin, servidor ainda grava com vínculo válido, mas ACAO null pode tornar resposta inacessível ao JS: erro fetch não prova perda.
Não usar no-cors para observar resposta (seria opaca). Não bloquear abertura da app indefinidamente à espera do pedido.

Corpo mínimo exato (IDs abaixo são apenas exemplos fictícios):
```json
{"event":"choice","slug":"rs-meta","arrival_event_id":"00000000-0000-4000-8000-000000000002","event_id":"00000000-0000-4000-8000-000000000004","destination":"spotify","opened":"app","mode":"choose","page_url":"https://www.mundopropicio.com/m/rs-meta/escolher"}
```
arrival_event_id é o UUID recebido do SSR, já usado no diag; event_id novo gerado UMA vez por chegada+destino e reutilizado em retry.
destination é chave exata do link (rs-meta atualmente spotify); opened app/web descreve a tentativa, não comprova que a app abriu.
Campos opcionais já existentes fbc/fbp/fbclid/ttclid/ttp só conforme comportamento de consentimento existente; não inventar nem enviar IDs de outra pessoa.

200 {ok:true}: claim persistida; entrega externa assíncrona, não prova escuta nem sucesso CAPI.
200 {ok:true,duplicate:true}: sem novo registo/reentrega.
400 invalid_choice; 403 invalid_arrival/forbidden_origin; 404 link_inexistente; 429 rate_limited; 500 erro_interno.

## Provas e limites

PostgreSQL17.9 descartável:17 PASS, duas conexões, gates2h/SSR/link/empresa/destino, source/ACL preservados, rollback.
Guard MD5 adaptado só na cópia executada para formatação SQL local0080; esperado Live permanece0fa7ff7255cf58ace770d21abfabe2e1 no candidato inerte.
Primeiro runner local tinha BEGIN em conexão separada (rollback automático da fixture); corrigido no teste e nova corrida17 PASS. Não foi bug Live.
Handler real candidato com imports substituídos por transportes fake:8 casos negativos/duplicado, zero chamadas externas. Sucesso completo/CAPI não ensaiado.
Regressões existentes:42 PASS. Sem prova em iPhone real, sem CI remota consultada para esta documentação.
Só após OK: migração oficial, aplicação e deploy coordenados com Portal, negativos+positivo controlado e teste físico iOS. Não executados nesta tarefa.