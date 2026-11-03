# P9 — preparação de sessões independentes

Nenhum destes scripts foi executado. Exigem autorização posterior e PostgreSQL descartável `issue486_synthetic`, catálogo fiel com controlos canónicos, roles/RLS/triggers reais, sem dados operacionais, egress ou crons. Cada linha da matriz começa numa base nova. Não se usa PGlite/sequência/advisory isolado como prova de concorrência.

A fixture usa empresas sintéticas A/B, BP100/compromisso70 e duas faturas de20 em meses diferentes (sem colisão pelo mês legado). `concorrencia-setup.sql` confirma os pedidos antes dos writers nos casos C3 financeiros. `issue486_test` contém apenas o estado e as fotografias de ensaio, fora do candidato: os helpers copiam as funções da fixture; nenhum substitui um controlo financeiro. O actor das sessões é autenticado com `SET SESSION AUTHORIZATION`, além do JWT, e cada sessão imprime PID/session_user/current_user. O owner só instala/semeia a base sintética.

## Ordem e observação independente

1. Criar a base fiel vazia numa etapa autorizada; executar preflight, candidato e pós-verificação. Guardar os hashes finais e o catálogo. `enabled=false` é o resultado de instalação; só a fixture na base descartável o abre.
2. Executar setup com as opções da matriz. Abrir dois processos `psql -X -v ON_ERROR_STOP=1`, com as mesmas opções; não reutilizar transações de outros casos.
3. Para os casos C3, A faz a primeira mutação e pára em `\prompt`, mantendo a transação aberta. Iniciar B; a terceira sessão C observa B bloqueada por A. Só então fornecer stdin à barreira de A, escolhendo commit/rollback pela opção. O futuro controlador deve automatizar esta libertação dentro do prazo, sem sleeps como prova. Se o prazo expirar, o caso falhou; não reinterpretar `55P03/40P01/57014` como `preview_stale`.
4. Para o par financeiro original, iniciar **B primeiro** até capturar/confirmar e fazer COMMIT; A gera e pára; libertar B, observar o bloqueio em C e libertar A. Para callback, A muta primeiro; B pode ler `operation` antes de esperar pela mutação.
5. Guardar stdout/stderr completos, PIDs diferentes, estado da barreira, bloqueio observado, ordem de commit/rollback e todos os asserts. Cada combinação da matriz tem transcrição própria; a prova de um vencedor não cobre o outro.

Consultas da sessão observadora C (substituir os PIDs pelos impressos, nunca por valores presumidos):

```sql
SELECT pid,application_name,usename,backend_xid,state,wait_event_type,wait_event,
       pg_blocking_pids(pid) AS blockers
FROM pg_stat_activity WHERE datname='issue486_synthetic' ORDER BY pid;
SELECT pid,relation::regclass,mode,granted,transactionid
FROM pg_locks WHERE pid IN (:pid_a,:pid_b) ORDER BY pid,relation,mode;
SELECT set_config('issue486.pid_a',(:pid_a)::integer::text,false),
       set_config('issue486.pid_b',(:pid_b)::integer::text,false);
DO $$ DECLARE a int:=current_setting('issue486.pid_a')::int;
              b int:=current_setting('issue486.pid_b')::int; BEGIN
 ASSERT a <> b,'independent_backends';
 ASSERT a = ANY(pg_blocking_pids(b)),'observed_real_wait';
END $$;
```

O controlador fornece os PIDs inteiros impressos; o bloco recusa PIDs iguais ou ausência da espera. Para `closed` e `noninterference`, exigir B **terminada enquanto A continua na barreira**, com bloqueadores de B vazios; não se espera bloqueio nesses casos. O acesso do observador não altera a identidade NOLOGIN das sessões A/B.

## Matriz critério → sessão → resultado

Em cada linha repetir `-v winner_rollback=false` e `-v winner_rollback=true` em A/B. As opções não alteram o candidato. Para C3 passar `-v c3_case=<caso>` também ao setup e usar `concorrencia-financeira-a.sql` / `concorrencia-financeira-b.sql`.

| Critério/caso | Opções e par | Commit A → assert B | Rollback A → assert B |
|---|---|---|---|
| P9-CAS | setup normal; `concorrencia-fatura-a/b.sql` | `revision_conflict`, `one_winner`, revisão2 | `rolled_back_winner_allows_cas`, revisão2 dentro da transação B (B faz rollback) |
| P9-KEY-SAME | `c3_case=same_key` | `same_invoice_winner_outcome`: already=true, uma mãe+filha e mesmos IDs | already=false, B cria esse único grupo |
| P9-KEY-DIFFERENT | `c3_case=different_key` | outra chave recupera o ciclo aplicado, sem outro grupo | B gera uma vez com a chave distinta |
| P9-LINE | setup normal; financeiro original sem c3_case | `serialized_100_70_20_20`: pedido antigo stale, nova prévia exige10; sem aceite zero; com aceite BP110/baseline100 | `winner_rollback_no_raise`, BP100/baseline100 |
| P9-CATEGORY | `c3_case=different_bp` | stale; nova prévia conserva BP302 e duas finalidades na mesma rubrica; `distinct_bp_preserved`, sem eleger BP maior | pedido original conserva BP302; sem aumento |
| P9-CREATE | `c3_case=create` | stale; cria BP próprio, `created_ids_distinct`=2, uma criação por finalidade | só B cria, um ID novo, sem reutilizar o BP desfeito de A |
| P9-TX-UPDATE | `c3_case=commitment_update` | A já alterou compromisso70→80; stale, revalida80 | pedido original, compromisso70 |
| P9-TX-DELETE | `c3_case=commitment_delete` | A já apagou compromisso; stale, revalida ausência | pedido original, compromisso70 presente |
| P9-V0-MOTHER | `c3_case=legacy_parent` | mãe v0 já inserida; conversão recusa duplicate_invoice e continua v0; mãe preservada | conversão revisão1; nenhuma mãe residual |
| P9-V0-DELETE | `c3_case=legacy_lines_delete` | DELETE de fonte já executado; conversão recusa invalid_plan, nenhuma operação parcial | conversão revisão1; fonte intacta |
| P9-V0-BP | `c3_case=legacy_bp_update` | UPDATE de âncora já executado; conversão conserva o estado confirmado da âncora, sem repor valor velho | conversão conserva a âncora inicial |
| P9-CURRENCY | setup normal; financeiro com `currency_race=true` | UPDATE empresarial EUR→BRL; stale/nenhum custo B e blocker currency_unrepresentable | geração EUR possível |
| P9-CLOSED | `c3_case=closed` | B recusa generate antes do cerco, operation/preview acabam com A aberta; `closed_all_effects_absent`, `closed_no_financial_fence` | mesmos asserts, sem quota financeira partilhada |
| P9-READS | setup normal; financeiro com `noninterference=true` | B operation/preview terminam com writer B aberto; `reads_only_access_share` | idem; A termina pelo desfecho selecionado |
| P9-CALLBACK-FIRST | setup com `callback_race=true`; `concorrencia-legado-a/b.sql` com a mesma opção | callback original termina; revert B retira grupo, mantém cleanup/operação | callback desfeito; revert B ainda retira grupo |
| P9-REVERT-FIRST | callback_race=true + revert_first=true no setup/A/B | callback recusa request_conflict, grupo ausente, cleanup retido | callback conclui no grupo que sobreviveu ao rollback de revert |
| P9-LEGACY-LATE | setup normal; legado original, A lê e pausa, B gera e confirma | A tenta cada primeira escrita tardia (mãe/linhas/âncora/grupo/reopen/confirm): ads_v1_command_required, grupo e âncora intactos | O resultado inverso é coberto pelos casos v0 já dentro do DML acima; este caso pressupõe explicitamente a geração confirmada de B |

Os casos C3 verificam ainda repetição com IDs estáveis e fotografia integral sem efeitos (`race_retry_no_effects`/`same_invoice_retry_no_effects`). Depois da espera, a repetição da recusa compara a fotografia integral por `issue486_test.expect`; a primeira tentativa verifica também ausência de custos/operação da fatura B. Não comparar um digest global anterior ao commit legítimo de A com o posterior e chamar a diferença efeito de B.

## Contenção a medir na etapa própria

Generate e revert mantêm cerco **global** SHARE ROW EXCLUSIVE; podem afetar writers de outras empresas. A leitura independente e o controlo fechado não demonstram ausência universal de interferência. Na futura prova, repetir os casos com writer de empresa B e registar `\timing on`, início/fim (`clock_timestamp()`), wait_event e pg_locks para generate/revert, percentis e duração máxima observada; repetir commit/rollback/cancelamento. Medir também o custo de snapshots transitivos e do limite documental. O catálogo e a capacidade real do harness, efetividade dos limites internos2s/15s e essa medição continuam pendentes. Não se altera o timeout para transformar um cenário falhado em prova.

A drenagem D3 terá de incluir writers/Storage/HTTP legados em voo, além das guardas DB. Nenhum merge abre o controlo; uma prova sintética posterior não autoriza instalação ou ativação.
