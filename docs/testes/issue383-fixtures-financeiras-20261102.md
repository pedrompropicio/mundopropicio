# Issue #383 — E2b: fixtures financeiras autocontidas

Execução local R1 em 02/11/2026; base/HEAD `d8d9c954f01cffb5a1234dd4d2c3cb7dc5e84a16`. Despacho #473, autorização 6570390159 e reserva 6570393875 fornecidos pelo controller; validade até 09:59 UTC. Sem commit, push ou alteração de ramo. CI da base informado no despacho; CI da entrega local não executado.

## Contagem efetiva e tabelas

Contagem por instrução INSERT, não por linha inserida, recontada no HEAD com `INSERT INTO (\w+)\s+VALUES\b` (case-insensitive) e revisão de todos os INSERTs dos dois ficheiros. Os helpers `fc` e `tx` já enumeravam colunas e foram preservados.

| Suite | Sem lista antes | Sem lista depois | Total de INSERTs no código (inclui helpers) |
|---|---:|---:|---:|
| `src/test/financial-position-base-p4.test.ts` | 7 | 0 | 9 |
| `src/test/p5b-a-pagar-por-evento.test.ts` | 6 | 0 | 8 |

| Tabela public | P4: linha anterior → final | P5b: linha anterior → final | Colunas explícitas |
|---|---|---|---|
| flags | 42 → 42 | 44 → 44 | pa |
| user_roles | 48 → 48 | 50 → 50 | user_id, company_id, role |
| events | 73 → 74 | 76 → 77 | id, name, date, company_id, parent_event_id, st |
| cache_payment_contracts | 135 → 136 | 117 → 118 | id, company_id, cancelled_at |
| cache_payment_contract_cities | 136 → 137 | 118 → 119 | contract_id, forecast_id, quota |
| event_bp_line_reviews | 144 → 145 | 119 → 120 | forecast_id, company_id, decision, saldo_at_review, reviewed_at |
| financial_accounts | 156 → 157 | sem INSERT | id, name, type, company_id, is_active, is_hidden, skip_balance_check, balance_visible_to_all, initial_balance_date, bal |

Valores, tipos, assertions, cenários e carregamento de migrações permanecem iguais. Nenhum campo foi acrescentado.

## Prova executável e âmbito da fixture

Cada suite instancia `new PGlite()` sem diretório persistente ou ligação externa. O `beforeAll` cria as tabelas usadas na própria instância: P4 linhas 42–69 e P5b linhas 44–72. Todas as tabelas da contagem têm CREATE TABLE local; não dependem de replay. Os cenários usam BEGIN/ROLLBACK e a instância fecha no afterAll.

P4 carrega `supabase/manual/0282_p4_financial_position_base.sql` por readFileSync + db.exec (linha 70) e chama `get_financial_position_base` por SQL (linha 20). P5b carrega a 0284 (linhas 8/73), chama a mesma RPC (linha 22), verifica igualdade de bytes com a migração pública e executa o cenário de paridade aditiva que carrega a 0283 e repõe a 0284 (linhas 144/146). A função financeira testada vem destes ficheiros reais; os auxiliares de sessão, permissões, estágio e saldos continuam a ser stubs locais, como antes.

A definição física de `events` passou de `id, name, date, company_id, parent_event_id, st` para `st, parent_event_id, company_id, date, name, id`, conservando nomes, tipos e chave primária. Os INSERTs mantêm a ordem semântica original pela lista explícita. Os 18 cenários existentes executam a RPC com esta permutação em ambas as suites, incluindo herança de estágio, futuro, histórico, contratos e gates. Não foi acrescentado teste de inspeção de strings.

## Verificação

- `bunx vitest run src/test/financial-position-base-p4.test.ts src/test/p5b-a-pagar-por-evento.test.ts`: exit 0; 2 ficheiros e 18 testes aprovados (12 P4 + 6 P5b), com a permutação física retida.
- Corrida integral inicial `bunx vitest run`: exit 0; 338 ficheiros aprovados, 2 skipped; 3373 testes aprovados, 6 skipped, 11 todo. Foi iniciada antes das edições e terminou depois; não é uma baseline imutável do código anterior.
- Corrida integral final `bunx vitest run`, com os dois ficheiros finais estáveis: exit 0; 338 ficheiros aprovados, 2 skipped; 3373 testes aprovados, 6 skipped, 11 todo; duração 247,19 s. Nenhum skip, timeout ou configuração de teste foi alterado; zero falhas nas duas corridas.
- `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`: exit 0.

Build não aplicável a este recorte exclusivo de fixtures de teste e documentação, sem produção ou configuração de build alterada. `git diff --check` passou; revisão do diff e comparação dos payloads VALUES confirmaram 9/9 e 8/8 preservados (incluindo os helpers).

## SHA-256 dos ficheiros finais

| Ficheiro | SHA-256 |
|---|---|
| src/test/financial-position-base-p4.test.ts | cb59ef3b1a35d8caf34de44ccd506f6c89f3fe0b1b85a56d108e6fdce61eab94 |
| src/test/p5b-a-pagar-por-evento.test.ts | 641fd9dead221ce02c2d546539caa550086bf74aa86d420848a94113411528e9 |

## Limitações

Este recorte corrige 13 ocorrências em 2 ficheiros; não resolve nem reconta o universo histórico de 47 ocorrências/21 ficheiros referido na atualização 6454202588. A classificação continua a ser `self_contained_fixture`, sem aceitação contra o schema aplicado ou replay.

A prova R4b de financial_accounts, incluindo partner_id, mirror_partner_aporte e advance_retention_pct, as outras fixtures e a aceitação do schema do replay ficam fora deste trabalho. Não foram lidos replay ou manifesto privados, nem consultada base aplicada ou serviços MP. A reserva #352 não foi transferida. Não houve alterações a produção, SQL/migrações, dependências, lockfiles ou caminhos proibidos. A issue-mãe permanece aberta; não houve publicação, deploy, merge ou comunicação externa.
