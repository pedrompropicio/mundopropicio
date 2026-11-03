# #383 — E2b: fixtures públicas de estágios de eventos

Base e HEAD de execução: `f6ebbaa0c4ffeeeee3e6c19cf187bc153f22820e` (main exigida pelo despacho). Autorização 6577892916; reserva 6577901042; parcela R1 do lote #473, em 02/11/2026. Cópia local, sem commit, push ou merge. O CI/quality da base (run 41447817160, success) é informação do despacho, não uma nova verificação remota desta execução.

## Método e contagens

Leitura delimitada ao ritual, feature `event-stages.md`, dois testes e dois SQL indicados. Conferência de todos os `INSERT INTO` dos dois testes, comparando o conteúdo de HEAD (`git show HEAD:<caminho>`) com os ficheiros finais e as definições locais. Contagem por instrução SQL escrita, não por linhas inseridas nem por execuções de beforeEach; o multi-row conta uma ocorrência. Expressão de inventário: `\bINSERT\s+INTO\s+([\w.]+)\s*(\([^)]*\))?`, com revisão manual das listas e valores.

| Suite | Tabela | Sem lista antes | Sem lista depois |
|---|---|---:|---:|
| P1 | actor | 1 | 0 |
| P1 | blockers | 1 | 0 |
| P1 | events | 1 | 0 |
| P1 | event_settlements | 1 | 0 |
| P1 | event_cache_configs | 1 | 0 |
| P1 | event_cache_city_settlements | 1 | 0 |
| P1b | events (multi-row) | 1 | 0 |
| P1b | blockers (multi-row) | 1 | 0 |
| **Total** | | **8** | **0** |

P1 contém 7 INSERTs no total e P1b contém 3, antes e depois. Os dois INSERTs de events já explícitos permanecem iguais. Não há outras formas de INSERT nestes dois ficheiros. Valores, NULLs explícitos, tipos, defaults, chaves, assertions, cenários e ordem de execução foram preservados.

As listas de actor, blockers, event_settlements, event_cache_configs e event_cache_city_settlements correspondem às respetivas CREATE TABLE locais. A lista completa de events preserva a associação original `id,name,date,status,company_id,parent_event_id,closed_at,closed_by,historical_at,historical_by`: as primeiras seis colunas são locais e as quatro últimas são acrescentadas pelo ALTER TABLE do SQL 0280 real antes dos INSERTs.

## Prova executável e reordenação

Ambas as suites criam `new PGlite()` sem caminho persistente, definem tabelas sintéticas e dependências locais em beforeAll e fecham a instância em afterAll (`db.close()`). Cada cenário executa BEGIN/ROLLBACK. A prova é descartável, sem ligação a serviços MP.

P1 carrega e executa os bytes de `supabase/manual/0280_p1_event_stages.sql` por `readFileSync(...,'utf8')` e `db.exec`. P1b carrega o mesmo SQL e depois `supabase/manual/0281_p1b_substage_follows_master.sql`, pelo mesmo mecanismo. Não se substituíram as funções públicas de estágios por cópias ou mocks; os auxiliares sintéticos das fixtures permanecem iguais.

Na P1b, a definição física de events passou de `id,name,date,status,company_id,parent_event_id` para `company_id,status,id,parent_event_id,date,name`. Nomes, tipos, chave primária e ausência de defaults continuam iguais; as quatro colunas de carimbos continuam acrescentadas pelo SQL real. Os cinco cenários existentes da P1b passam nesta ordem física diferente, incluindo relações master/sub-evento, carimbos, recusa de RPC no sub-evento e agregação de blockers. Não foi criado teste de inspeção de strings.

## Verificações

- Antes da edição: `bunx vitest run src/test/event-stages-p1.test.ts src/test/event-stages-p1b.test.ts` — exit 0, 2 ficheiros e 18 testes aprovados.
- Depois da edição: o mesmo comando — exit 0, 2 ficheiros e 18 testes aprovados (13 P1 + 5 P1b).
- `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` — exit 0, sem diagnósticos.

## SHA-256 finais dos testes

| Ficheiro | SHA-256 |
|---|---|
| `src/test/event-stages-p1.test.ts` | `e3f35025f371eb66fb9976fcaf309766e43954004c020fc5824da7d68cb7089f` |
| `src/test/event-stages-p1b.test.ts` | `ab42994e67dbf4540971563c69003c37754b898af8bca3e3238e3f28eec4f4d0` |

## Limitações

Esta parcela não fecha #383, não corrige outras fixtures, não demonstra compatibilidade com schema instalado ou replay e não resolve R4b. Não se abriram baseline, replay, bindings ou artefactos privados #352. PR #484 e reservas #413/#352/#404 não foram alteradas. Não houve acesso Live, serviços/bases MP, segredos, deploy, Publish, DDL/DML aplicado a bases MP ou envios externos; o SQL executado pertence exclusivamente às instâncias sintéticas descartáveis autorizadas.

`docs/estado/estado-testes.md` não existe na base: a tentativa de leitura devolveu ENOENT. A secção 11 do QUADRO não indica outro ficheiro de estado; foi lida a feature relevante, sem ampliar pesquisa. A suíte completa não foi executada antes da edição; a comparação antes/depois medida diretamente cobre as duas suites focadas. CI da entrega e registo remoto na #352 ficam fora desta execução exclusivamente local, sem commits/push. O Modelo A de #298 e as guardas #471 não foram editados.

## Build e escopo de entrega

`bun run build` terminou com exit 0 (`vite build`, 9146 módulos transformados; PWA gerada). Emitiu avisos de Browserslist desatualizado e de tamanho de chunks; não se alteraram dependências, configuração ou gates.

Lista fechada da entrega: `src/test/event-stages-p1.test.ts`, `src/test/event-stages-p1b.test.ts`, `docs/testes/issue383-fixtures-event-stages-20261102.md` e `.executor/resumo.md`. O diff dos testes foi lido integralmente; a recontagem final confirmou zero INSERTs sem colunas. `git diff --check` passou antes do fecho documental e será repetido no fecho.

`bunx vitest run` terminou com exit 0: 342 ficheiros aprovados, 2 skipped; 3448 testes aprovados, 6 skipped, 11 todo (3465), duração 229,28 s. Nenhum skip, timeout, gate ou configuração foi alterado. `git diff --check` final terminou com exit 0; `git status --short` confirmou exclusivamente os quatro caminhos autorizados.
