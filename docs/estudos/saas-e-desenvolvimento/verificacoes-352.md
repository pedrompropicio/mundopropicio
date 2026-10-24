# #352 — verificações R0 e preparação documental da arquitectura A

Data: **24/10/2026**. Executor: **Codex**. Revisor designado: **Claude (0 - Cowork), por leitura**; este documento não presume revisão posterior concluída.

## Âmbito e proveniência

Despacho inicial: evidências na branch `study/351-isolated-update-lab`. Despacho posterior de Pedro nesta sessão: **documentação em main**, registo da decisão A e plano da etapa seguinte, sem executar R2. Prevalece o despacho posterior. Parecer lido antes das verificações: [comentário 6384113516](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6384113516). Decisão lida na actualização do despacho: [comentário 6384461152](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6384461152).

Reservas: branch de estudo em `3ff3f8c5fd53f7c1936085a0d6595665f1f5ae8e`; main em `31eb50a86d6f9af742df100c522bf91cd88b8a65`, antes das alterações documentais em main. Preflight desta passagem: GitHub e Lovable em `480c09e1eabf204a7ba709181cbaac60fffbdd01`, `agentFinished=true`; recepção da reserva em main pelo Lovable confirmada em `31eb50a8`. Libertação das duas reservas registada no comentário de fecho.

Fontes distintas, sem as confundir:

- **Código e SQL inspeccionados:** main fixada em [`480c09e1eabf204a7ba709181cbaac60fffbdd01`](https://github.com/pedrompropicio/mundopropicio/tree/480c09e1eabf204a7ba709181cbaac60fffbdd01), 24/10/2026 12:02:29 UTC. Árvore completa, não truncada; cópia obtida pelo arquivo desse commit.
- **Laboratório existente:** origem `29e18c96f4ebcc76bd1471cd4a68b333f966f12f`, implementação `6ff8a60b0b34bde3f12729f1bf46662700f9035f`, mantido sem alterações. Os cinco ficheiros de produção do manifesto `sources.json` continuam com SHA-256 idênticos na main inspeccionada.
- **Build servido:** `version.json` declara commit `e9c56cb5d63465981e1ea442b16a675efd0e3fec`, buildId `1792786543411`, builtAt `2026-10-23T20:15:43.411Z`. É anterior ao HEAD inspeccionado; a declaração de versão é uma evidência publicada, não prova independente de correspondência integral dos bytes ao Git.
- **Live:** apenas `SELECT` via `Lovable.query_database`, projecto ERP `ab7cf7e3-a5fc-4737-9cc1-2ba7cf43887f`; PostgreSQL 17.6. Recolhas em 24/10/2026, na janela 12:40–12:52 UTC. As seis consultas de catálogo são leituras independentes, não um snapshot transaccional único.

Nenhum código do ERP ou laboratório foi alterado. Não houve criação de conta/projecto/infraestrutura externa, contratação, OAuth, escrita no Live, execução de cron/edge function, deploy ou Publish. O SQL do diagnóstico foi executado somente num motor local descartável, no âmbito do replay pedido. As gravações remotas são documentação GitHub e o comentário na #352.

## Resposta às divergências da secção 1 do parecer

Links de produção abaixo fixados no commit inspeccionado; links do laboratório fixados na implementação existente.

1. **Activação do SW: concordância com a limitação, com duas ressalvas à inferência.** [`vite.config.ts:115–145`](https://github.com/pedrompropicio/mundopropicio/blob/480c09e1eabf204a7ba709181cbaac60fffbdd01/vite.config.ts#L115-L145) configura autoUpdate, limpeza, clientsClaim e skipWaiting. [`src/lib/pwa.ts:3,63–94`](https://github.com/pedrompropicio/mundopropicio/blob/480c09e1eabf204a7ba709181cbaac60fffbdd01/src/lib/pwa.ts#L63-L94) pede activação imediata e verifica actualizações a cada 60 s **quando o documento está visível**, além dos eventos indicados. O SW sintético não implementa precache nem fetch ([`server.mjs:65–66`](https://github.com/pedrompropicio/mundopropicio/blob/6ff8a60b0b34bde3f12729f1bf46662700f9035f/tools/update-lab/server.mjs#L65-L66)); o candidato só reage ao evento ([`candidate-manager.js:21–22`](https://github.com/pedrompropicio/mundopropicio/blob/6ff8a60b0b34bde3f12729f1bf46662700f9035f/tools/update-lab/candidate-manager.js#L21-L22)). **Não está provado** que este seja o gatilho predominante no uso real, nem um prazo máximo de 60 s para todos os separadores: há a guarda de visibilidade, rede, ciclo de vida e escalonamento do navegador. A limpeza configurada não é uma medição de quais entradas antigas foram efectivamente eliminadas. Não apresento estas ressalvas como prova de ausência do risco.
2. **Chunks antigos: concordância.** O carregamento por rota está em [`src/App.tsx:41–44`](https://github.com/pedrompropicio/mundopropicio/blob/480c09e1eabf204a7ba709181cbaac60fffbdd01/src/App.tsx#L41-L44) e na memória `build-code-splitting.md`. [`src/main.tsx:12–21`](https://github.com/pedrompropicio/mundopropicio/blob/480c09e1eabf204a7ba709181cbaac60fffbdd01/src/main.tsx#L12-L21) trata `vite:preloadError` com reload, sem consultar trabalho por guardar. A guarda é por sessão quando sessionStorage funciona; o catch admite reload se esse armazenamento falhar. A retenção posterior ao Publish continua sem medição. Secção 4 guarda a baseline e o procedimento; nenhum Publish foi feito para produzir essa prova.
3. **Dois separadores: concordância.** [`src/lib/versionCheck.ts:51–67`](https://github.com/pedrompropicio/mundopropicio/blob/480c09e1eabf204a7ba709181cbaac60fffbdd01/src/lib/versionCheck.ts#L51-L67) enumera e elimina todas as CacheStorage acessíveis na origem antes de navegar. O teste [`browser.test.mjs:117–132`](https://github.com/pedrompropicio/mundopropicio/blob/6ff8a60b0b34bde3f12729f1bf46662700f9035f/tools/update-lab/tests/browser.test.mjs#L117-L132) prova a decisão independente e preservação do texto naquela página fictícia, não a disponibilidade de chunks/cache de outro separador real. Apagar cache não prova perda imediata do JavaScript já em memória; a falha pode surgir no próximo recurso necessário. Esse efeito não foi exercitado.
4. **Dirty state: concordância com a falta de integração.** A página liga e desliga o booleano fictício em [`app.js:17–25`](https://github.com/pedrompropicio/mundopropicio/blob/6ff8a60b0b34bde3f12729f1bf46662700f9035f/tools/update-lab/app.js#L17-L25), consumido em [`candidate-manager.js:6–18`](https://github.com/pedrompropicio/mundopropicio/blob/6ff8a60b0b34bde3f12729f1bf46662700f9035f/tools/update-lab/candidate-manager.js#L6-L18). O componente real só considera mutações e modal ([`PWAUpdateManager.tsx:9–24`](https://github.com/pedrompropicio/mundopropicio/blob/480c09e1eabf204a7ba709181cbaac60fffbdd01/src/components/PWAUpdateManager.tsx#L9-L24)); não está ligado a um registo de formulários, uploads ou editores. Isto prova a lacuna do componente/candidato, sem transformar a leitura numa prova absoluta de inexistência de qualquer mecanismo local de dirty state no ERP.
5. **Primeira instalação: concordância quanto ao risco; não certificada no ERP real.** Listener bruto em [`pwa.ts:94`](https://github.com/pedrompropicio/mundopropicio/blob/480c09e1eabf204a7ba709181cbaac60fffbdd01/src/lib/pwa.ts#L94), reload condicionado por isBusy e claimReloadGuard em [`PWAUpdateManager.tsx:38–47`](https://github.com/pedrompropicio/mundopropicio/blob/480c09e1eabf204a7ba709181cbaac60fffbdd01/src/components/PWAUpdateManager.tsx#L38-L47). O teste [`browser.test.mjs:134–139`](https://github.com/pedrompropicio/mundopropicio/blob/6ff8a60b0b34bde3f12729f1bf46662700f9035f/tools/update-lab/tests/browser.test.mjs#L134-L139) observa banner no arranque do worker sintético em modo proposta, boots=1. Não mede a primeira instalação do Workbox real em baseline; não afirmo reload inevitável em toda primeira visita.
6. **Cobertura: concordância integral.** Não há prova nesta etapa para Workbox real, Safari/iOS standalone, Android, fluxos integrais do ERP ou suite integral do produto. O candidato permanece demonstração isolada, não patch pronto.

Reverificação local em 24/10: `node --experimental-vm-modules --test tools/update-lab/tests/unit.test.mjs` — **11/11 PASS**; fingerprints dos cinco ficheiros também conferidos contra main. Uma primeira invocação omitiu `--experimental-vm-modules` e falhou com `vm.SourceTextModule is not a constructor`; corrigido o comando, sem editar o laboratório. Os 10 testes de navegador do run histórico [40092280944](https://github.com/pedrompropicio/mundopropicio/actions/runs/40092280944) não foram repetidos agora nem convertidos em prova de produção.

## 1. Cliente Supabase: variáveis de ambiente

**Confirmado; não requer patch.** [`src/integrations/supabase/client.ts:6–7`](https://github.com/pedrompropicio/mundopropicio/blob/480c09e1eabf204a7ba709181cbaac60fffbdd01/src/integrations/supabase/client.ts#L6-L7):

```ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
```

São identificadores `const` cujo **valor vem do ambiente de build**, não literais de URL/chave no cliente. Ambos chegam a `createClient` na linha 12. Valores não reproduzidos. Não confundir a publishable key de frontend com service role nem com ligação directa ao Postgres. Nenhuma configuração de ambiente foi alterada.

## 2. Replay e catálogo: diagnóstico executado, requisito nativo pendente

**PARCIAL. Não está certificado o replay num Supabase/Postgres nativo local.** Docker, Supabase CLI, psql, initdb e pg_ctl não estavam instalados. A instalação normal por APT falhou por permissões do ambiente. Foi obtido em scratch `embedded-postgres@17.6.0-beta.15`; `initdb --version` confirmou PostgreSQL 17.6, mas o arranque devolveu `initdb: error: cannot be run as root`. A tentativa com o utilizador **já existente** nobody devolveu `runuser: cannot set groups: Operation not permitted`. Não foram criadas contas nem contornadas estas restrições.

Para obter evidência adicional sem infraestrutura externa, executou-se todo o conjunto num **PGlite 0.3.14 / PostgreSQL 17.5 WebAssembly, 32 bits**, inicialmente vazio, sem stubs de auth/storage, sem fabricar roles ou instalar extensões. Uma passagem exploratória anterior em PGlite 0.5.11 / PG18.6 teve os mesmos totais; o inventário e comparação publicados aqui são da passagem PG17.5 de **12:51:00.292–12:51:01.596 UTC**. Isso não equivale ao Postgres 17.6/Supabase do Live.

Ordem literal, por nome de ficheiro, com todos os `.sql`:

| Fase | Ordem | Ficheiros | Sem erro | Com erro |
|---|---:|---:|---:|---:|
| `supabase/migrations/` | 1–1012 | 1012 | 77 | 935 |
| `supabase/manual/` | 1013–1126 | 114 | 4 | 110 |
| Total | 1–1126 | 1126 | 81 | 1045 |

Primeiro ficheiro: `20260317112302_0966ea18-afee-468b-9299-db8ad68609d7.sql`; último migrations: `20261013143000_0134_derp264_camarim_item_bp_line_guard.sql`; primeiro manual: `20260921195500_artist_song_tiktok_groups.sql`; último manual: `rollback_0238.sql`. A ordem completa, SHA-256 de cada SQL, estado, código e mensagem de cada falha estão em [replay-local.json](verificacoes-352/replay-local.json).

O executor envolveu cada ficheiro em BEGIN/COMMIT; em erro tentou ROLLBACK e continuou no seguinte, para inventariar **todos**, sem reparar SQL. O controlo transaccional próprio dos ficheiros foi preservado: o wrapper não promete atomicidade adicional quando um script emite o seu próprio COMMIT. O erro `25001` de `CREATE INDEX CONCURRENTLY` é uma limitação deste modo de execução, não prova de defeito do script. O diagnóstico continuado após uma falha não simula um migrador que pára na primeira falha.

Falhas e pré-requisitos observados:

- **Primeira falha, ordem 1, SQLSTATE 42704:** role `authenticated` inexistente, na política da [linha 27](https://github.com/pedrompropicio/mundopropicio/blob/480c09e1eabf204a7ba709181cbaac60fffbdd01/supabase/migrations/20260317112302_0966ea18-afee-468b-9299-db8ad68609d7.sql#L27). Ordem 2: role `anon`. Também faltam `authenticator` e `service_role`.
- Schemas ausentes ao serem usados: `auth`, `storage`, `extensions`, `cron` e `crm`. Faltam o bootstrap e os serviços/contratos Supabase, não apenas uma base PostgreSQL vazia.
- Extensões pedidas e indisponíveis nesse motor: `pg_cron`, `pg_net`, `pg_trgm`, `pgcrypto`, `unaccent`, `vector`. Não foram activados cron, rede, segredos nem integrações reais.
- As falhas seguintes incluem relações/funções/tipos em falta devido a dependências e aos rollbacks das falhas anteriores. Distribuição: `42P01` 595; `42704` 236; `3F000` 127; `42883` 67; `P0001` 8; `0A000` 7; `22004` 2; `25001`, `42703`, `22P02` um de cada.
- `manual/` contém CUTOVER, ROLLBACK, PROPOSTA, PENDENTE e INERTE, incluindo placeholders como `__exact_revision__` e `__REVIEWED_EXISTING_OWNER_UUID__`. A sequência literal pedida foi tentada **só localmente**; não é uma cadeia de instalação validada. Nenhum desses candidatos foi promovido a migração/aplicado no Live.
- Existem ainda 239 `.sql` em `drizzle/migrations/` na árvore inspeccionada. Não entram nos dois directórios pedidos; não se atribui automaticamente uma divergência à sua ausência sem prova.

### Comparação de catálogo observada

As consultas integrais, todas SELECT sobre `information_schema`/`pg_catalog`, estão em [catalogo-queries.json](verificacoes-352/catalogo-queries.json). Incluem schemas não sistémicos; o catálogo de relações distingue `r/p/v/m/f`. Funções são identificadas por schema, nome e argumentos de identidade; comparam-se também hash da definição, SECURITY DEFINER, volatilidade e proconfig. Colunas incluem tipo, nullability, identidade, geração e hashes de default/expressão. Políticas incluem roles/comando/hashes; triggers não internos incluem definição/enabled; extensões incluem versão/schema. OIDs não são comparados. Valores e corpos potencialmente sensíveis não foram publicados.

| Categoria | Live | Local diagnóstico | Só Live | Só local | Mesma identidade, atributos diferentes | Idênticos |
|---|---:|---:|---:|---:|---:|---:|
| Relações (tabelas/partições/views) | 515 | 1 | 514 | 0 | 0 | 1 |
| Colunas | 6512 | 5 | 6507 | 0 | 0 | 5 |
| Funções/procedimentos | 1112 | 48 | 1068 | 4 | 19 | 25 |
| Políticas RLS | 1308 | 0 | 1308 | 0 | 0 | 0 |
| Triggers não internos | 404 | 0 | 404 | 0 | 0 | 0 |
| Extensões | 11 | 1 | 10 | 0 | 0 | 1 |

Live: 458 relações `r`, 2 `p` e 55 views. O único objecto relacional local resultante foi a view `public.vw_tickets_v2_test_health`, com cinco colunas. A lista **integral** das identidades exclusivas e dos 19 pares de funções divergentes está em [catalogo-diferencas.json](verificacoes-352/catalogo-diferencas.json); inclui fingerprint SHA-256 dos conjuntos Live e atributos dos pares divergentes. As quatro funções só locais são `artist_ads_period_report`, `check_ticketing_sync_health`, `notify_sync_action_needed` e `song_growth_summary` (assinaturas no anexo).

Live tem `pg_cron 1.6.4`, `pg_net 0.20.0`, `pg_stat_statements 1.11`, `pg_trgm 1.6`, `pgcrypto 1.3`, `pgmq 1.5.1`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `unaccent 1.1`, `uuid-ossp 1.1`, `vector 0.8.0`. Local tem apenas `plpgsql 1.0`.

**Interpretação:** diferenças efectivamente medidas contra o resultado de um replay com falhas, dominadas pelo bootstrap ausente. Não são uma lista certificada de drift entre Live e um Supabase correctamente reconstituído. Fica pendente repetir em Postgres/Supabase nativo local com os pré-requisitos reais, registar cada fronteira de execução (incluindo CONCURRENTLY), parar/continuar explicitamente e repetir estas seis comparações. Não foi criado projecto remoto para contornar o bloqueio.

## 3. Capacidades Lovable Cloud — documentação oficial

Consulta das páginas abaixo: **24/10/2026**. Confirmação documental da funcionalidade geral não prova configuração/entitlement específico deste projecto.

| Pergunta | Resultado documentado | O que fica não confirmado |
|---|---|---|
| String directa ao Postgres? | [Secrets](https://docs.lovable.dev/features/secrets), secção Reserved secret name prefixes, documenta `SUPABASE_DB_URL` entre as variáveis geridas injectadas no ambiente das Edge Functions. [Database access](https://docs.lovable.dev/features/database-access) documenta password gerida/rotação e ferramentas ligadas por password. | Exposição de uma connection string utilizável pelo operador fora do Cloud, procedimento de obtenção, endpoint/rede/pooler e conectividade externa efectiva **não confirmados**. Existência da variável interna não é prova de acesso externo. Não foi lido o seu valor nem rodada a password. |
| Env por deploy? | [Secrets](https://docs.lovable.dev/features/secrets): segredos backend por projecto; `VITE_*` no `.env`, incorporados no build e expostos no browser. [Build secrets](https://docs.lovable.dev/features/build-secrets): Enterprise, âmbito workspace, usados nos builds de preview/publicação; sem override por projecto. | Um mecanismo nativo de conjuntos de env independentes por deploy/preview/produção **não confirmado**. Não confundir `.env` versionado ou segredos de projecto/workspace com essa capacidade. |
| Ambientes/branching? | [Guia de retirada Test/Live](https://docs.lovable.dev/features/environments): separação retirada em **05/10/2026**, um backend por projecto. [Drafts](https://docs.lovable.dev/features/drafts): versões de código/preview separadas, mas mesma base, ficheiros e definições; alterações de dados são reais. | Branching isolado de **base/backend** no Cloud actual **não confirmado**. Draft é branching da aplicação, não homologação de dados. Não se presume que documentação antiga de Test/Live ainda se aplique. |

Estas respostas corrigem a suposição de que o Cloud garante hoje dois bancos Test/Live separados. Não alteram o projecto existente nem a decisão A.

## 4. Assets: baseline guardada; retenção pós-Publish não medida

Origem: GET directo de ficheiros estáticos de `https://mpgestaoeventos.com/`, sem executar a aplicação, sem sessão de utilizador e sem service worker de navegador. Recolha principal **12:47:11–12:54:17 UTC, 24/10/2026**; complemento e hora final no [inventário JSON](verificacoes-352/assets-actual.json).

Guardados **714 nomes/URLs e SHA-256 dos corpos HTTP recebidos (pedido com Accept-Encoding: identity)**, tamanhos, HTTP status, Content-Type, Date e ETag devolvidos. Todos HTTP 200, sem resposta HTML disfarçada de JS/CSS/JSON. A enumeração cobre 693 chunks de `bundle-report.json`, o precache (712 entradas, com repetições), os ficheiros públicos do commit publicado, o módulo Workbox importado pelo SW e metadados explícitos. O hash do SW foi estável antes/depois da recolha e do complemento: `fb2a733acf3b725cf8ea26179c27f94238039ef930f985e4f9618733b41b6959`.

Cruzamento adicional: os tamanhos HTTP de **12 dos 693 chunks** diferem dos `bytes` declarados em bundle-report.json; pares listados no inventário. Causa não apurada. Os hashes guardados são dos corpos efectivamente servidos, não inferidos do nome do chunk ou desse relatório. Não se certifica identidade integral entre o relatório de build e o artefacto servido.

**Limite:** não foi possível listar o filesystem `dist/` original do build publicado. `dist/` não está no arquivo Git e a leitura `dist/bundle-report.json` pelo conector Lovable devolveu 404; o relatório foi obtido pelo site publicado. Esta é uma lista derivada de ficheiros servidos, abrangente para as fontes indicadas, **não certificação de inventário integral do directório dist**. Não foi feito outro build para o apresentar como o actual. O inventário original de dist continua por confirmar; os hashes obtidos já permitem sondar retenção dos URLs guardados.

### Procedimento após o próximo Publish — executor 0, não executado aqui

1. Antes da janela autorizada, o 0 confirma que buildId/commit/SW ainda correspondem a esta baseline. Se houve outro Publish, captura uma nova baseline antes de medir. Quando disponível, exporta também a lista integral do `dist/` original com SHA-256 e cruza-a com o inventário servido.
2. Regista hora UTC e identidade do próximo Publish. Publica somente na janela e com a autorização habitual; esta R0 **não** autoriza o Publish.
3. Em cliente HTTP novo, sem cache/SW, faz GET aos **mesmos URLs antigos**, conservando os nomes/hashes anteriores. Envia `Cache-Control: no-cache` e `Accept-Encoding: identity`; guarda status, URL final, Content-Type, bytes e SHA-256. Não valida retenção apenas por HEAD ou por HTTP 200: o fallback SPA pode devolver HTML.
4. Repete logo após a mudança de `version.json`/SW e, se a janela permitir, em T+10 min, T+1 h e T+24 h. Guarda as horas reais; não simula passagem do tempo. Recolhe em separado o inventário do build novo.
5. Classifica cada URL antigo: **retido idêntico**, **conteúdo alterado no mesmo URL**, **removido (404/410)**, **fallback HTML** ou **inconclusivo** (timeout/outro erro). Dá especial atenção aos chunks antigos ausentes do novo inventário. Publica os resultados na #352 e neste estudo, sem apagar a baseline.
6. Se for autorizado testar no ERP, valida separadamente um separador antigo a abrir uma rota lazy ainda não carregada e o efeito em duas abas. HTTP de assets e comportamento do navegador são provas diferentes. Retenção observada numa janela não é SLA nem garantia de retenção indefinida.

## 5. Último infra.json global — conteúdo pendente

SELECT em `storage.objects`, **24/10/2026 12:51:22 UTC**, filtrando bucket `database-backups` e `global/%/infra.json`, ordenado por created_at descendente:

- Objecto mais recente: `global/2026-10-21T03-00-05/infra.json`.
- created_at/updated_at: `2026-10-21 03:04:27.705548+00`; metadata size: **116310 bytes**.
- Bucket privado. O conector usado expõe leitura SQL/ficheiros de código, mas não download autenticado deste objecto. Não se criou signed URL, não se invocou pg_net/edge function, não se leu valor de segredo nem se exportou novo backup.

**Não confirmado a partir desse ficheiro:** número de crons, nomes dos segredos e lista de buckets **do backup de 21/10**. Não substituir o conteúdo histórico por valores actuais.

Leitura complementar, explicitamente **Live actual**, 24/10/2026 **12:49:33.178482 UTC**, sem comandos cron nem valores de segredos: **81 crons**, **14 nomes em vault.secrets**, **34 buckets**. A consulta e o resultado sanitizado estão em [infra-live-complementar.json](verificacoes-352/infra-live-complementar.json). Nomes e buckets aparecem abaixo. Não é inventário dos segredos das Edge Functions.

O produtor do backup chama `backup_infra_snapshot` ([`database-backup/index.ts:476–486`](https://github.com/pedrompropicio/mundopropicio/blob/480c09e1eabf204a7ba709181cbaac60fffbdd01/supabase/functions/database-backup/index.ts#L476-L486)). A [definição SQL:61–85](https://github.com/pedrompropicio/mundopropicio/blob/480c09e1eabf204a7ba709181cbaac60fffbdd01/supabase/migrations/20260918013934_19565c2d-6a1b-4179-899f-28c806ddef2f.sql#L61-L85) inventaria Vault por nome, não valores, no campo `segredos_vault`. O objecto inclui também comandos cron: na leitura futura pelo 0, extrair somente contagem, nomes e buckets, sem publicar comandos/cabeçalhos que possam conter credenciais. Trata-se de ler o objecto existente, não gerar outro snapshot.

Nomes Vault **actuais**, sem valores:

- `bol_master`
- `email_queue_service_role_key`
- `fever_b2b_token_coala_2026`
- `fever_credentials_coala_2026`
- `IPINFO_TOKEN`
- `META_CAPI_ACCESS_TOKEN`
- `META_WA_PHONE_NUMBER_ID`
- `META_WA_SYSTEM_TOKEN`
- `ticketline_3def1b85-0ed0-4166-b45d-3a4561564e15`
- `ticketline_4fca2381-1db9-4ff5-9dc0-91068de88a02`
- `ticketline_56e431e8-adcc-4f87-99fd-545c9bb1aefa`
- `ticketline_95051bc2-8580-405c-a1ad-f2526ddf9bd4`
- `ticketline_fdfb39fe-45f2-43f5-9ec9-7cb536360ae1`
- `ticketline_master`

Buckets **actuais** (`public` indicado):

| Bucket | Public |
|---|---|
| `accountant-exports` | false |
| `ads-invoices` | false |
| `bank-statements` | false |
| `bp-version-snapshots` | false |
| `cache-extra-documents` | false |
| `camarim-documents` | false |
| `card-documents` | false |
| `closing-cost-documents` | false |
| `club-mission-assets` | true |
| `club-proofs` | false |
| `company-branding` | true |
| `company-logos` | true |
| `crm-meta-creatives` | true |
| `data-entry-staging` | false |
| `database-backups` | false |
| `entity-documents` | false |
| `event-ab-attachments` | false |
| `event-forecast-attachments` | false |
| `event-images` | true |
| `exports-temp` | false |
| `festival-edition-videos` | true |
| `funnel-test-screenshots` | false |
| `implementation-files` | false |
| `import-reports` | false |
| `operacao-media` | false |
| `partner-extra-documents` | false |
| `portal-marketing-images` | true |
| `press-clippings` | true |
| `standalone-invoices` | false |
| `supplier-credit-documents` | false |
| `supplier-documents` | false |
| `test-artifacts` | true |
| `ticket-office-settlements` | false |
| `transaction-documents` | false |


## 6. Custos publicados em 24/10/2026

Valores USD, referência de tabela, não contratação nem estimativa fechada do ERP. Consumo excedente, compute adicional e impostos podem alterar o total.

| Serviço | Preço/capacidade verificada | Fonte oficial e consulta |
|---|---|---|
| Supabase Pro | **A partir de US$25/mês por organização**; US$10 de créditos compute cobrem uma instância Micro. Projectos adicionais desde US$10/mês; o crédito não se repete por projecto. Inclui Edge Functions, franquia **2 milhões/mês**; excedente US$2/milhão. Projectos pagos não pausam por inactividade. | [Pricing](https://supabase.com/pricing), [Edge Functions pricing](https://supabase.com/docs/guides/functions/pricing), [Project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) — 24/10/2026. |
| pg_cron no Supabase | Disponível como módulo/extensão; a documentação manda activar `pg_cron` no projecto. Não foi encontrada uma linha de preço adicional por cron na tabela consultada; execução consome recursos da base e eventuais chamadas de Functions têm as suas quotas. Pro é o plano pago mínimo identificado para evitar pausa automática. Nenhuma extensão foi activada nesta etapa. | [Cron](https://supabase.com/docs/guides/cron), [Install](https://supabase.com/docs/guides/cron/install), [Pricing](https://supabase.com/pricing) — 24/10/2026. |
| GitHub Pages | Sem custo adicional no GitHub Free para repositórios públicos; privados exigem plano elegível pago. A documentação **não permite usá-lo como hosting gratuito de negócio/SaaS comercial**; portanto US$0 não é uma oferta elegível de produção comercial deste ERP. Limites: site 1 GB, bandwidth soft 100 GB/mês. | [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) — 24/10/2026. |
| Cloudflare Pages, estático | **US$0 no plano Free**; pedidos a assets estáticos gratuitos/ilimitados. Free: 500 builds/mês, 20 mil ficheiros/site, máximo 25 MiB/ficheiro. Functions/Workers são contabilizados separadamente; estes valores não incluem backend, domínio ou serviços externos. | [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Limits](https://developers.cloudflare.com/pages/platform/limits/) — 24/10/2026. |

Um único projecto de homologação Micro numa organização Pro nova enquadra-se na base publicada de US$25/mês, sob as quotas. O custo marginal numa organização já paga depende do compute/crédito já usado; não foi inspeccionada facturação nem escolhido/contratado plano.

## Plano proposto da etapa seguinte — arquitectura A, INERTE

Decisão A fechada por Pedro: **desenvolvimento local + Supabase próprio de homologação; produção permanece no Lovable Cloud**. B descartada. C não é pré-requisito; não há decisão de migrar a produção. Este plano não reabre essa escolha.

### Pré-condições ainda R0

1. Codex conclui o replay **nativo** num ambiente local permitido, com bootstrap Supabase real, e separa falhas do runner de falhas do SQL. Codex/Claude revêem a ordem efectiva de instalação; propostas/rollbacks/INERTES não passam a candidatos aplicáveis por terem sido executados no diagnóstico literal.
2. O 0 lê o **infra.json já existente** no seu canal autorizado e fornece apenas as três extracções pedidas; completa o inventário original de dist quando acessível e executa a medição de retenção somente após o próximo Publish autorizado. Esses pontos mantêm-se abertos, com origem/data.
3. Claude revê por leitura este relatório, anexos, divergências e plano; Codex responde aos bloqueios técnicos. Uma nova revisão não está presumida por este fecho documental.

### R2 posterior, somente com autorização específica

| Passo | Responsável | Acção e critério de aceitação | Autorização |
|---|---|---|---|
| 1. Definir proprietário e custo | **Pedro** | Escolher conta/organização Supabase, região e plano; autenticar-se, activar MFA e aceitar facturação/limite de despesa. Registar nome/ID do destino e custo aprovado, nunca credenciais no Git. | “Sim” próprio para conta/projecto e custo; decisão A não o substitui. |
| 2. Criar projecto de homologação | **Pedro** na conta; Codex apenas no âmbito delegado | Criar **um** projecto com identidade claramente de homologação. Conferir que referência/URL são diferentes do Cloud de produção. Não ligar o projecto de produção do Lovable ao novo banco. | R2 expresso, com destino e orçamento identificados. |
| 3. Preparar instalação exacta | **Codex**; **Claude** revê por leitura | Fixar SHA, manifesto de scripts aprovados e pré-requisitos. Plano de DDL próprio da homologação, com backup do estado do destino antes de cada lote; crons/integradores/egress reais ausentes ou desligados. Parar se catálogo/bootstrap divergir do ensaio nativo. | “Sim” para o lote exacto de DDL no ID da homologação; nenhum DDL no Live. |
| 4. Aplicar e validar esquema | **Codex**, se o canal e a autorização o permitirem | Aplicar somente o manifesto revisto no destino; comparar as seis categorias de catálogo. Registar diferenças intencionais dos serviços Cloud. Não copiar integralmente produção nem aplicar todos os manuais. | R2 próprio para aplicação; sem deploy de funções por arrasto. |
| 5. Dados e identidades de teste | **Codex** prepara; **Pedro** aprova âmbito | Preferir fixtures sintéticas. Criar utilizadores/memberships/empresas de teste só após autorização, com matriz RLS/isolamento. Dados reais, storage e Auth de produção só mediante decisão separada e anonimização adequada. | “Sim” próprio para contas/DML/qualquer importação identificada. |
| 6. Configurar desenvolvimento local | **Codex** | Checkout/branch do SHA aprovado, variáveis locais apontando exclusivamente à homologação; segredo administrativo só no backend autorizado, nunca VITE/Git. Sinal visível de homologação e guardas para recusar referência de produção. Testes provam destino e isolamento. | Alterações de código seguem R1/reserva/CI; não inclui Publish. |
| 7. OAuth, segredos e integrações | **Pedro** para contas, consentimentos e custos; Codex prepara configuração; **0** para eventual deploy autorizado | Começar sem credenciais de produção nem destinos reais. Só ligar sandbox específico quando existir e for aprovado. Não transplantar os 81 crons nem copiar segredos. Rever funções antes de qualquer implantação em homologação. | “Sim” por OAuth, segredo/integração, cron e deploy necessários; nenhum envio real implícito. |
| 8. Aceitação | **Codex** executa; **Claude** revê; **Pedro** aceita | Testes locais/homologação: Auth, RLS multiempresa, leitura/escrita de fixtures e storage de teste; chamadas externas bloqueadas; catálogo comparado; nenhum tráfego/escrita na produção. Registar resultados antes de propor alojamento de preview ou outra expansão. | Aprovação de aceitação não autoriza Publish/deploy na produção. |

**Rollback e paragem:** qualquer URL/ref de produção, chamada externa não prevista ou diferença não explicada interrompe a etapa. Parar a aplicação local e retirar a configuração local basta para interromper o uso; produção não foi redireccionada e não exige restauro. Se um lote de DDL falhar, usar a transacção/restauro **só da homologação** quando aplicável; não executar rollback genérico de `manual/`. Se houver custo activo, Pedro gere/cancela a subscrição; apagar o projecto/contas ou dados continua a exigir “Sim” próprio. Preservar provas, backup do destino e inventário antes de eliminar qualquer recurso. Não apontar temporariamente o cliente local ao Live como fallback.

Autorização futura proposta, a preencher **depois** dos bloqueios e revisão: “Sim, autorizo a criação de um projecto Supabase de homologação na organização [ID], região [região], plano [plano], com custo-base [valor] e limite [valor], mantendo a produção no Lovable Cloud. Aplicação de DDL, dados, contas de teste, OAuth, crons e deploys serão autorizados nos seus passos.” **Nenhuma autorização desta fase foi pedida ou consumida nesta R0.**

## Estado de fecho R0

| Verificação | Estado |
|---|---|
| 1 — origem URL/chave | Confirmada por código/linhas; sem patch. |
| 2 — replay/catálogo | Diagnóstico completo dos 1126 ficheiros e comparação publicados; **replay nativo e paridade de instalação pendentes**. |
| 3 — Cloud | Documentação actual lida; env por deploy/acesso externo directo não confirmados; retirada Test/Live e backend partilhado nos drafts confirmados documentalmente. |
| 4 — assets | Baseline servida 714 ficheiros guardada; **inventário integral original dist e retenção pós-Publish pendentes**. |
| 5 — infra.json | Objecto histórico localizado; **conteúdo privado não lido**; Live complementar identificado separadamente. |
| 6 — custos | Preços/limites/fontes consultados; nada contratado. |

Fecho é documental, com pendências explícitas; **não é aprovação técnica para executar R2**, nem fecho da #352 como concluída. Próxima criação de homologação continua a exigir revisão e “Sim” próprio de Pedro. Decisão A registada como **D-ERP304** em `docs/DECISIONS.md`; estado em `docs/estado/estado-plataforma-e-infra.md`; comentário da #352 liga as provas e a libertação das reservas.
