# #333 — Prova36: negativos Live; defeito de timeout em hash errado reproduzido

18/10/2026, até01:34 UTC (último commit efetivo confirmado pelo controlador; hora exata de início não reconstituída). Autorização Pedro 18/10 01:29 UTC (só prova técnica Auth/endpoint, sem ativação/faturas/Publish). HEAD recebido 8c0c3e294679dbdc7f36b8e81f70e77e54773a1d = GitHub = Lovable, checkout limpo, janela 10 min cumprida, CI 39083572592 success confirmado pelo controlador. Executor único, sem subagentes. Reserva #333 atualizada no QUADRO antes dos testes; #323 intacta. Sem deploy/DDL/DML fora das fixtures autorizadas/flags/Publish.

## Fixtures (novas, fictícias)
- 1 conta técnica `.invalid` via Auth admin createUser email_confirm:true, password aleatória só em memória, sem email/invite/magiclink; papel manager mínimo na empresa A (existente, não alterada). Limite de UMA conta respeitado; as 3 contas da prova34 NÃO foram reabertas.
- 1 reserva técnica `prepare` semeada por service (owner = conta nova, envelope sintético, destino UUID inexistente, sem objeto/upload/receipt/fatura). Nenhuma linha em standalone_invoices nem efeito financeiro, real ou fictício.
- Inventário de IDs apenas em /tmp/issue333-proof36/private (não commitado).

## Matriz (10 casos executados + finally)
```text
caso | esperado | observado | resultado
contexto canónico manager empresa A | 200 company/role ok | 200 role=manager | PASS
capabilities authenticated | 200 false/false | 200 false/false | PASS
header user forjado | 409 | 409 | PASS
header company forjado | 409 | 409 | PASS
check hash errado (pedido isolado, 40s) | 409 sem efeito | timeout, sem resposta HTTP | INCONCLUSIVO
check id inexistente | 409 | 409 pendente | PASS
check operação errada | 409 | 409 pendente | PASS
check owner correto (controlo positivo) | 200 read-only | 200 status pendente, envelope vinculado | PASS
RPC wrapper owner hash correto | 200 read-only | 200 | PASS
RPC wrapper hash errado | 4xx negado | timeout 30s, sem resposta HTTP | INCONCLUSIVO
ban conta nova + logout global | 200 | ban=200 | PASS
```
Total 11, PASS 9, INCONCLUSIVO 2 (ambos o mesmo defeito: hash errado).

## Defeito reproduzido (relato, sem correção — não autorizada)
Pedido `check` com hash errado (reserva existente do owner) NÃO devolve 409: excede 40s sem resposta HTTP, no endpoint e no RPC direto `standalone_attempt_333`. Reproduzido 3 vezes no total (prova34 + 2 nesta prova). Timeout é inconclusivo, não PASS; nenhuma chamada repetida cegamente. Correção documental da prova37: causa não demonstrada nesta prova.0191 e Live já comparam o hash após localizar a reserva e lançam40001; ausência de comparação/reordenação não são diagnóstico válido. Investigar retry de serialização, lock e transporte por evidência, sem correção Live. Ver prova37 para comparação server-side, reprodução PG17 e limites de telemetria. Sem correção de runtime/SQL/config nesta tarefa.

## Casos autorizados não executados — bloqueio exato
Listagem populada própria, prepare/execute/confirm com gates fechados neste deploy e tabelas privadas como authenticated ficaram por executar: o timeout no RPC interrompeu o script antes desses casos e o finally já tinha banido a única conta permitida (limite UMA conta consumido; proibido reabrir as 3 anteriores). Continuação autorizada e tentada na prova37, com uma conta adicional nova e todos os grupos independentes antes do hash errado;422 de fixture execute e limites de diagnóstico explicitados.

## Baselines antes → depois (agregados, sem exportar linhas)
- Financeiro IGUAL: transactions 1966 (hash cc236441…), transaction_payments 1417 (2536c646…), event_forecasts 2300 (75169b0d…), standalone_invoices 98 (92a64688…), financial_accounts 27 (dbedd9cd…).
- Settings/gates IGUAIS: data_entry_settings 0, standalone_attempt_settings_333 0; capabilities service-only false/false confirmado depois dos testes.
- Mudanças técnicas esperadas apenas: standalone_attempts_333 2→3 (reserva nova), auth users +1 (banida), roles +1. Audit 0→0; sessões/docs/previews/results/receipts 0→0. Storage não tocado (nenhum upload/list chamado pelo script).
- ACL funções #333 (antes): data_entry_* e standalone_attempt_333/list EXECUTE authenticated apenas; capability_333 e record_receipt service-only; gate_333 sem EXECUTE externo. A ausência de DDL não prova igualdade de ACL. Esta prova não apresenta comparação after independente; prova37 compara efetivamente corpos+ACL/RLS/policies antes/depois.

## Encerramento
signOut global + ban HTTP 200; auth.sessions da conta nova = 0 (verificado por SELECT). Ban/logout não provam revogação instantânea de access tokens já emitidos; nenhum token/password persistido. Fixtures anteriores e novas preservadas; nada apagado.

## Limites
- Positivos owner/peer/tenant da prova34 mantêm-se, mas não substituem os negativos pendentes listados acima.
- Timeout de hash errado é falha observada do percurso Cloud, com causa ainda não demonstrada; check com hash errado não é recusa comprovada.
- CI desta entrega documental a conferir pelo controlador. Sem ativação/piloto/Publish; #333 aberta/reservada; #323 intacta.
