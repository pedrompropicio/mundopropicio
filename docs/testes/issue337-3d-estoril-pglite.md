# Issue #337 — E2b / 3d: lançamento Estoril em PGlite

Execução local em 03/11/2026 sobre HEAD `1fa70e1e3c534714a21425a5c7792c31860272df`, autorização 6612285368. Apenas três testes novos, este registo e o resumo de entrega expressamente pedido em `.executor/resumo.md`. Nenhum ficheiro existente foi alterado.

## Comandos e resultados

| Comando | Resultado |
| --- | --- |
| `bunx vitest run src/test/issue337-launch-offset-sql.test.ts` | Código 0; 6 testes aprovados. |
| `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` | Código 0; sem diagnósticos. |
| `bunx vitest run` | Código 0; 387 ficheiros aprovados e 2 ignorados; 4672 testes aprovados, 6 ignorados e 11 todo; duração 203,02 s. |

Os três ficheiros novos somam 11 testes aprovados na suíte completa: 3 estruturais, 6 PGlite e 2 UI. Nenhum teste novo usa skip/todo; os ignorados e todo pertencem aos ficheiros existentes, que ficaram intactos.

## Prova por critério

- **1:** `offset-core-agnostic.test.ts` extrai a definição de `_issue335_execute` até ao primeiro `END $$;`, recusa referências a `bank_statement_lines`, `bank_line` e `p_line_id`, e exige `IF p_movement IS NULL` e `acc IS NULL`.
- **1:** A definição executável de `reconcile_bank_line` em 0301 entrega ao núcleo `v_line.financial_account_id` e `v_line.amount`; o rollback comentado não é confundido com a definição activa.
- **1:** A porta `transaction_offset_execute` insere a operação `execute` em `issue335_commands`; o trigger chama o dispatcher, que chama `issue335_worker`; o worker passa `NULLIF(p_command->'movement','null'::jsonb)` a `_issue335_execute`.
- **2:** Receita sintética aprovada de 30.996,00 e despesa sintética aprovada de 7.590,00, ambas com IVA 0 e fornecedor `00000000-0000-0000-0000-000000000020`, fecham com estado `applied` pela porta lançamento.
- **2:** A receita recebe uma perna `transfer` de 23.406,00 na conta `00000000-0000-0000-0000-000000000030` e uma `compensation` de 7.590,00 sem conta; a despesa recebe uma `compensation` de 7.590,00 sem conta.
- **2:** Os `paid_amount` derivados são 30.996,00 e 7.590,00; a soma das pernas na conta bancária é 23.406,00; a caixa `00000000-0000-0000-0000-000000000031` tem zero pernas.
- **2:** O grupo do lançamento mantém `bank_line_id NULL`; uma linha bancária sentinela e a contagem de ligações bancárias permanecem iguais antes e depois.
- **3:** Sem conta, a RPC recusa com `invalid_movement`; com a conta de caixa, recusa com `account_not_allowed`.
- **3:** Com movimento NULL e ambos os itens `offset`, a mensagem começa por `Excedem 23406,00 €`; com 23.406,01, começa por `Faltam 0,01 €`.
- **3:** Cada recusa preserva a contagem de pagamentos, grupos, itens e ligações bancárias, bem como os documentos e linhas bancárias da fixture, após recuperar a instrução recusada por savepoint.
- **4:** Um segundo par sintético igual, pela RPC original `reconcile_bank_line` de 0301, produz as mesmas tuplas `(type, open_amount, cash_amount, compensation_amount)` do lançamento.
- **4:** Só o grupo da conciliação tem a linha associada; a linha fica `matched` e a ponte aponta à receita com dinheiro; o grupo do lançamento continua sem linha.
- **5:** O assistente real aberto na receita bloqueia «Seguinte» sem conta, mesmo com valor 23.406,00 e data válida.
- **5:** Seleccionar `acc1` permite confirmar e entrega a `applyLaunch` o movimento `{ account_id: "acc1", date: "2026-10-22", amount: 23406 }`, receita `settle` com `cash_order: 1`/3099600 cêntimos e despesa `offset` com `cash_order: null`/759000 cêntimos.
- **5:** Os itens não contêm `amount`, `paid_amount` ou `iva_rate`; o teste injecta os serviços e usa `supabase: {}`, sem chamadas ao cliente ou à porta bancária.
- **6:** Tipos e suíte completa passaram; os testes reservados e todos os componentes, libs e SQL existentes ficaram intactos.

## Instalação local do harness

O teste cria uma instância PGlite em memória com a extensão `unaccent`. O bootstrap usa `supabase_admin`, através de `username` e `initDbStartParams: ["--username=supabase_admin"]`, reproduzindo o `initdb -U supabase_admin` de `run.sh`; cria `postgres` e atribui-lhe a base antes de instalar o baseline.

Os ficheiros são lidos com `readFileSync` e executados integralmente com `db.exec`, nesta ordem:

1. `supabase/tests/issue335/stub.sql`.
2. `live/dependencies.sql`, `live/functions.sql`, `live/triggers.sql`.
3. `live/phase2c-auth.sql`, `live/phase2d-constraints.sql`, `live/phase2c-invariant-registry.sql`, `live/phase2d-legacy.sql`, `live/phase2e-replay.sql`.
4. `live/phase2d-role.sql`, como `supabase_admin`, incluindo a verificação do deployer `postgres NOSUPERUSER`.
5. `20261021_issue335_offset_group_storage.INERTE.sql` e `storage-only.sql`.
6. `20261021_issue335_offset_core.INERTE.sql`, `20261021_issue335_offset_approval.INERTE.sql`, `20261021_issue335_status.INERTE.sql`, `20261021_issue335_offset_invariants.INERTE.sql`.
7. `20261021_issue335_offset_balance.INERTE.sql`, `20261021_issue335_cash_position.INERTE.sql`, `20261021_issue335_cash_position_invariant.INERTE.sql`.
8. `supabase/manual/0301_issue401_reconcile_bank_line_devolucao.sql`.

Os candidatos da lista vivem em `supabase/manual/`. As chamadas funcionais usam `SET SESSION AUTHORIZATION authenticated`, o JWT sintético do admin e uma transacção descartada por teste. Cada cenário verifica `current_user`, `session_user`, `auth.uid()` e a empresa resolvida. O núcleo, 0301, `_derive_paid_amount` e auth não foram substituídos. Não houve stubs adicionais, incluindo das quatro funções-marcador.

As tentativas iniciais encontraram os seguintes erros exactos, resolvidos apenas no bootstrap do teste:

| Ficheiro | Erro | Correcção da fixture |
| --- | --- | --- |
| `live/phase2d-role.sql` | `0A000: permission denied to alter role`; detalhe `The bootstrap superuser must have the SUPERUSER attribute.` | Inicializar o PGlite com o bootstrap `supabase_admin`, em vez de `postgres`. |
| `live/phase2d-role.sql` | `42501: permission denied to grant role "authenticated"`; detalhe `Only roles with the ADMIN option on role "authenticated" may grant this role.` | Seleccionar explicitamente `SET SESSION AUTHORIZATION supabase_admin` antes deste ficheiro; `RESET SESSION AUTHORIZATION` não repôs essa identidade nesta sessão PGlite. |
| `20261021_issue335_offset_group_storage.INERTE.sql` | `42501: permission denied for schema public` | Reproduzir também `ALTER DATABASE postgres OWNER TO postgres`, presente no bootstrap de `run.sh`. |

Na execução final todos os ficheiros instalaram integralmente, sem fallback.

## Não feito / lacunas

- Não ficaram critérios locais 1–6 por cumprir.
- Não foram executados SQL em bases externas, Live, controlos N1/N2, deploys, Publish ou merge.
- A fase 3c, a migração 0312 e os ficheiros reservados permanecem fora deste despacho.
- A execução local não constitui prova de CI remoto nem de homologação em Live.
