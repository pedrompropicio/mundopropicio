# Carreira — origens Spotify e comparação diária (25/10/2026)

## Provas já recolhidas
- `s4a-daily-sync` em dry_run para Litto: HTTP 200, D=23/10/2026, sem gravação de métricas; mantém o registo técnico de corrida existente.
- No endpoint atual de top-playlists, os testes `1day` e `7day` deram HTTP 200 e 100 linhas cada. Forma: `{data:[{uri,author,streams,title,dateAdded,thumbnailUrl,isAlgorithmic,isAlgotorial}],playlistOverall}`. Strings nos campos textuais/streams/playlistOverall; booleanos nos dois indicadores. Rádio: 36.634 em 1day, 152.489 em 7day e 274.939 em 28day. Não confundir essas janelas.
- Stats atual não contém categorias de origem. Não foi encontrado um endpoint de origens comprovado; não inventar caminho nem campos.
- UGC: 18/10=6.350, 19/10=5.746, ambos 29/29 sons e o mesmo ator. A maior contribuição é a queda de 5.377 para 4.851 no som principal (−526). Prova de menor contagem devolvida, não prova de vídeos removidos nem de mudança da versão do ator.
- Baseline Vitest: 2.464 PASS, 6 skip, 11 todo. Não foi executado tsgo manual; validação automática será conferida.
- A Visão comparativa pertence ao projeto Gestão Artística, não a este frontend. Foi localizado apenas um snapshot de leitura: não pode ser alterado daqui.

## Implementação autorizada neste projeto
1. Acrescentar ao dry_run do `s4a-daily-sync` as formas das respostas de top-playlists 1day/7day; reutilizar parser/identidade/limites existentes. Guardar 1day com period_days=1 nas próximas corridas reais, D=latest-date, sem backfill. Manter 28day e seus contratos. Não gravar 7day sem requisito.
2. Extrair helpers sem efeitos para normalização das playlists, derivação diária e deteção de quedas UGC; testes sintéticos com lançamento, lacunas, dependência D−28, duplicados, ausência versus zero e mudança de sons/fontes. Derivação nunca recebe uma semente inventada. Como 1day existe, a vista estimada não é necessária para a captura futura; o histórico sem base demonstrável fica nulo.
3. Preparar a extensão aditiva da comparação diária em `artist_ads_compare`, preservando autenticação, país, fuso, moeda, corte de captura e resultados atuais. Campos por música/data: total Spotify, Radio/percentagem, outras Spotify, ouvintes, resto somente com componentes conhecidos, categorias quando existirem; UGC total/delta/sons/alerta/cobertura. Custos por plataforma e moeda com numerador/denominador correspondentes. SQL pelo canal oficial, sem editar RPCs de saúde nem alargar permissões.
4. Origem das reproduções: continuar a descoberta apenas com caminho comprovado por pedido real do S4A. A gravação mantém-se desligada; parser/métricas apenas após forma real. Se não houver prova acessível, declarar este ponto bloqueado, sem um parser fictício que aparente implementação.
5. Entregar valores disponíveis de 10/10 a D com fonte/período e nulos explícitos; não retroatribuir a leitura 1day atual aos dias anteriores. Guardar apenas formas e agregados necessários, nunca tokens ou payloads pessoais.

## Frontend e limites
- Não copiar o frontend Gestão Artística para o ERP, nem criar uma segunda Visão comparativa. As colunas e o card de custo por plataforma precisam de implementação no projeto proprietário; daqui só é possível preparar o contrato e indicar os ficheiros de integração encontrados.
- Sem Publish, alteração ao smart link, consentimento, crons ou reenvio histórico. A flag de origens não é ativada.
- Reverter código não desfaz métricas captadas entretanto; qualquer recuperação de dados exige autorização própria.

## Ficheiros e validações
- `supabase/functions/s4a-daily-sync/index.ts`, novo helper `_shared/s4a-play-origins.ts`, testes em `src/test/`, migração aditiva da comparação se necessária, documentação de carreira/S4A e regra arquitetural em `AGENTS.md`.
- Vitest focado e suite antes/depois; verificação automática de tipos/build, Deno check se disponível; CI do SHA só se efetivamente consultável. Deploy exclusivamente das funções alteradas e dry_run Litto; prova OPTIONS/auth recusada, sem disparar captura real.
- Limitações pendentes: endpoint real das categorias de origem e escrita no projeto Gestão Artística. Não declarar toda a entrega concluída enquanto estes pontos estiverem por resolver.
