# INDEX — porta de entrada única

> Se estás a começar uma sessão (humano ou Claude), **lê só este ficheiro e o `estado/` da frente em causa**. Mais nada.

## Onde vive cada tipo de informação

| Camada | Onde | Responde a | Vive ou morre |
|---|---|---|---|
| **Estado** | `docs/estado/estado-<frente>.md` | *Onde estamos?* | **Vivo** — reescrito por cima, nunca datado |
| **Pendências** | GitHub Issues | *O que falta fazer?* | **Vivo** |
| **Como funciona** | `.lovable/memory/features/*.md` | *Como é que X funciona?* | Vivo, por feature |
| **Porquê** | `docs/DECISIONS.md` (ADR) | *Porque decidimos assim?* | Vivo, append-only |
| **Arquitetura** | `docs/ARCHITECTURE.md` | *Como está montado?* | Vivo |
| **Restrições** | `.lovable/memory/constraints/*.md` | *O que nunca se pode fazer?* | Vivo |
| **Histórico** | `docs/handoffs/` | *O que aconteceu no dia X?* | **Morto** — arquivo, não se consulta para saber o estado |
| **Mapa de chats** | `docs/CHATS.md` | *Onde trato este tema?* | Vivo — tipos de chat permitidos, tema→chat e estado dos chats abertos |

**Prioridade e trabalho em curso são coisas diferentes.** A prioridade vive na label da Issue (`P0`/`P1`/`P2`); o *estar em curso* vive na secção "A trabalhar agora" do `estado-<frente>.md`. Não existem labels de estado.


**Regra de ouro:** informação com data no nome é arquivo. Informação sem data no nome é estado. Nunca se lê arquivo para saber onde estamos.

## As 9 frentes

| Frente | Ficheiro | Chat com o mesmo nome |
|---|---|---|
| Fecho & Sócios | `estado/estado-fecho-e-socios.md` | `fecho-e-socios` |
| BP, Verbas & Rateio | `estado/estado-bp-verbas-e-rateio.md` | `bp-verbas-e-rateio` |
| Vínculo BP↔Transações | `estado/estado-vinculo-bp-transacoes.md` | `vinculo-bp-transacoes` |
| Ticketing & Receita | `estado/estado-ticketing-e-receita.md` | `ticketing-e-receita` |
| Audience — Meta | `estado/estado-audience-meta.md` | `audience-meta` |
| Audience — Google | `estado/estado-audience-google.md` | `audience-google` |
| CRM, Portal & Leads | `estado/estado-crm-portal-e-leads.md` | `crm-portal-e-leads` |
| Plataforma & Infra | `estado/estado-plataforma-e-infra.md` | `plataforma-e-infra` |
| Financeiro & Tesouraria | `estado/estado-financeiro-e-tesouraria.md` | `financeiro-e-tesouraria` |

**Um chat por frente. O nome do chat é o nome da frente.** Se um tema muda de frente a meio, muda-se de chat — não se continua no errado.

## Procedimentos

| Procedimento | Ficheiro |
|---|---|
| Fecho de evento | `procedimentos/PROC-fecho-evento.md` |
| Revisão semanal | `procedimentos/PROC-revisao-semanal.md` |
| Captação de vendas Onebox (H&K Madrid) | `procedimentos/PROC-vendas-onebox-madrid.md` |
| Custo partilhado com terceiros (rateio) | `procedimentos/PROC-rateio-dayoffs-turne.md` |
| Arranque de chat (moldes de mensagem inicial + regra de fecho) | `procedimentos/PROC-arranque-chat.md` |

## Manual de Orientação (em construção)

Artigos-fonte em `docs/manual/*.md`, um por capítulo. Cada secção leva um bloco ```ajuda (id, tooltip, ecras, perfis, fontes) que o importador lê para a base e que alimenta o `/ajuda`, o painel lateral e os tooltips. Primeiro capítulo: `docs/manual/rateios.md` (16/09/2026). Regra: o manual só descreve o que o ecrã faz hoje; o que está decidido mas por implementar fica fora ou em aviso ⚠️.

Diagramas em `docs/manual/img/*.svg`, referenciados no artigo com `![alt](img/x.svg)`; cores só por variáveis de tema; sem números.

Cada bloco ```ajuda pode ter `termos: [...]` — vocabulário da equipa (sinónimos, calão, escrita errada), indexado para a pesquisa e invisível no artigo. Quando a pesquisa falhar, as Lacunas (`/admin/lacunas-manual`) mostram as palavras a acrescentar.

As fontes internas (D-ERP…, PROC-…, ficheiros de memória) só aparecem a admin / platform_admin, num bloco "Fontes" recolhido no fim do artigo e de cada secção. O painel lateral abre por cima de qualquer modal (camada única em `src/lib/help-panel-dom.ts`) e um clique dentro dele nunca fecha o modal por baixo.

**Regra (17/09/2026): uma tarefa com migração só está feita quando a migração está aplicada e verificada em Live — ficheiro no repositório não basta.** As migrações do manual (`20260917010000_help_search_hybrid.sql` e a dos termos, `help_sections.terms`) ficaram no repositório sem serem aplicadas e a pesquisa devolvia erro não-2xx no `/ajuda`. Verificar sempre em Live a existência da função/coluna e os `has_function_privilege` de anon/authenticated/service_role.

Se a pesquisa ou o gateway AI falharem, `help-search` devolve 200 com `{ error: 'search_unavailable', detail }` e registra a mensagem real no console da função; a UI mostra "A pesquisa está indisponível" e o detalhe só a admin — nunca um 500 opaco.

Diagramas de decisão: árvore em escada (perguntas com contorno primário à esquerda, resultado final à direita, rótulo Sim/Não junto à seta) e **nenhuma seta sai de um resultado final**.

## Módulo Carreira Artística (empresa Social Artists)

Não é uma frente com `estado-*.md` próprio: vive em `plataforma-e-infra`. Antes de mexer,
ler **D-ERP47** (comparáveis por artista, base 100 na primeira data comum, cadência por
`roster_type`) e a secção "Crons de carreira artística" do `ARCHITECTURE.md`.

Fase A (músicas): a **obra** é `artist_songs` — é ali que se acompanha um lançamento.
`artist_releases` continua a ser upload por plataforma (Sua Música) e liga-se por
`song_id`. Métricas e playlists da obra vêm da Soundcharts
(`song-soundcharts-sync`, cron `carreira-song-sync-diario` às 09:40 UTC). Ler **D-ERP49**
antes de mexer — sobretudo a parte de que o Spotify não dá plays por playlist.

Vídeos curtos (Shorts/Reels): `artist-shorts-sync` → `artist_content` com
`source = 'aggregator'`, cron `carreira-shorts-sync-diario` às 09:50 UTC. Ler **D-ERP52**
antes de mexer: o TikTok não existe neste endpoint, não vem música associada ao vídeo e
o título vem vazio.

TikTok oficial (Display API + Login Kit): `artist-tiktok-oauth-start` /
`artist-tiktok-oauth-callback` / `artist-tiktok-sync`, app própria
`TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`, cron `carreira-tiktok-sync-diario` às
09:55 UTC. É a fonte PRIMÁRIA dos vídeos do próprio artista (`artist_content` com
`source = 'platform_api'`); a Soundcharts fica para YouTube/Reels e comparáveis.
Ler **D-ERP56** antes de mexer.

Regra que se salta com facilidade: `artists` passou a ter `roster_type` — qualquer listagem
de elenco filtra `roster_type = 'elenco'`, senão mostra artistas de referência.
- Relatório de lançamento por LLM: `artist-song-report` + `artist_song_reports` / `v_song_report_latest`, cron `carreira-song-report-diario` (10:00 UTC). Ver D-ERP54.
- Tráfego por artista no painel: RPCs `artist_ads_campaigns`, `artist_ads_daily`, `artist_ads_alerts`, `artist_ads_link_song` + auto-ligação `artist_ads_autolink_songs`; `linked_song_id` em `crm.google_campaign` e `crm.meta_campaign_snapshot`. Ver **D-ERP68**.
- Streams por playlist do Spotify for Artists (recolha assistida): `artist_song_playlist_streams` + RPC `artist_song_playlist_streams_set` + vista `v_song_playlist_streams_latest`; métricas `s4a_*` em `artist_song_metrics_daily`. S4A é a fonte oficial de streams, a Soundcharts é a contagem pública desfasada; só o elenco tem S4A. Ver **D-ERP67**.
- Benchmark alinhado por idade: vista `v_song_benchmark_aligned` + função `song_benchmark_aligned(song_id)`; o relatório LLM nunca qualifica uma métrica em absoluto, só contra os comparáveis à mesma idade (`benchmark` + `avaliacao_relativa`). Ver **D-ERP59** (e D-ERP58 para as músicas de referência).


Contas de TRÁFEGO do próprio artista (≠ captação): vivem em
`crm.ad_platform_connections` com `connection_scope = 'artist'` + `artist_id`, ligadas pelo
próprio artista via `artist-ads-meta-oauth-start` / `artist-ads-meta-oauth-callback`
(mesmo app e scopes da ligação Meta do CRM), escolha de conta em
`artist-ads-select-account`, corte em `artist-ads-disconnect`. Google/TikTok sem OAuth:
RPC `artist_ads_register_external` grava o Customer/Advertiser ID em `pending_link`
(Google fica `active` quando `crm-google-sync-campaigns` a alcança sob o MCC).
Ler **D-ERP57** antes de mexer.


## Ritual de arranque (obrigatório, por esta ordem)

1. Ler `docs/INDEX.md` (este ficheiro).
2. Ler `docs/estado/estado-<frente>.md` da frente em causa.
3. Ler as Issues abertas (`{"action":"list"}` na edge function `github-issues`). As labels reais são `P0`/`P1`/`P2` + módulo (`MP-ERP`, `MP-AUDIENCE`, `MP-CRM`, `transversal`). Não existem labels de estado — a lista do que está em curso é a secção "A trabalhar agora" do `estado-<frente>.md`.
4. Só então agir. **Nunca diagnosticar antes de ler.**

Se o tema toca num fluxo já implementado, procurar primeiro em `.lovable/memory/features/`. A hipótese por defeito é que **já existe**.

## Ritual de fecho (obrigatório)

1. Atualizar o `estado-<frente>.md` — reescrever, não acrescentar.
2. Issues: abrir as novas, fechar as resolvidas, comentar as decisões.
3. Decisão de arquitetura → entrada em `docs/DECISIONS.md`.
4. Só se a sessão for longa e densa: handoff em `docs/handoffs/` (arquivo).

## Identificadores fixos

- Lovable ERP `ab7cf7e3-a5fc-4737-9cc1-2ba7cf43887f` · Portal/CRM `26b95793-17b6-478c-a6e8-745c0cfb7ed9`
- Supabase Live `sfohvvlqccmmebvjgibx` · Repo `pedrompropicio/mundopropicio`
- Company MP `7c858982-6ccd-47ca-bd65-e0dd3eebf01c`
- Edge function de Issues: `github-issues` — parâmetro é **`number`**, não `issue_number`. PAT expira **24/set/2026**.
- Desde 16/09/2026 o contentor das sessões interativas do Claude alcança `sfohvvlqccmmebvjgibx.supabase.co` diretamente por HTTPS (allowlist de rede da organização); o caminho por `net.http_post` continua válido e é o de referência para tarefas agendadas até se confirmar que também o alcançam.

## Regra de base de dados que nunca se salta

**Toda a função `SECURITY DEFINER` nova no schema `public` leva, na mesma migração que a cria:**

```sql
REVOKE EXECUTE ON FUNCTION public.<nome>(<assinatura>) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.<nome>(<assinatura>) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.<nome>(<assinatura>) TO service_role;  -- e só quem precisa
```

O schema `public` é exposto pelo PostgREST: sem isto a função é chamável por RPC por qualquer visitante anónimo com a chave pública do bundle.

**Duas armadilhas.** (1) `REVOKE ... FROM anon, authenticated` **não fecha nada** enquanto existir o grant de `PUBLIC` — eles herdam dele. (2) Neste projeto acontece o inverso: os grants são nominais a `anon`/`authenticated` e o `REVOKE ... FROM PUBLIC` é no-op. Por isso fazem-se **os dois** e confirma-se sempre com `has_function_privilege('anon', …)` e `has_function_privilege('authenticated', …)` — ambos `false`, `service_role` `true`. Nunca pela ACL em bruto.

**Excepção:** funções usadas dentro de políticas de RLS não se revogam (ver D-ERP37).
