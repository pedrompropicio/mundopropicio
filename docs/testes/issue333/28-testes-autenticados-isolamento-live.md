# #333 — testes autenticados e isolamento em Live, sem ativação

17/10/2026 ~23:20 UTC. Executor único0-CoworkChatGPT via agente ERP, sem subagentes. Base recebida 7d61108230e594eff3ac87b684b5f1f12d3a1fe7 conferida (git HEAD idêntico, checkout limpo). CI 39077290788/job117526980546 success confirmado pelo controlador antes desta etapa. Reserva #333 atualizada; #323 intacta. Sem deploy, DDL, Publish, flags ou efeitos financeiros.

## Fixtures (todas novas, fictícias)
- 4 contas técnicas `.invalid` via Auth admin createUser email_confirm:true, password aleatória só em memória, sem invite/signup/email: gestorA1, gestorA2 (empresa A), gestorB (empresa B), editorA (não elegível, empresa A). Papel manager concedido só às 3 gestoras; editor à quarta. Empresas já existentes, nenhuma criada/alterada.
- 1 sessão técnica CORE semeada por service (owner gestorA1, empresa A). Nenhuma flag aberta para a criar.
- Finalização em finally: signOut global das 4 sessões + ban das 4 contas (HTTP 200 confirmado). Nada apagado; fixtures anteriores preservadas. Limite registado: ban não prova revogação de JWT já emitidos; nenhum token persistido.

## Matriz (37 casos; formato corrigido: PostgREST devolve HTTP 403 com SQLSTATE 42501)
| caso | identidade | esperado | observado | resultado |
|---|---|---|---|---|
| contexto canónico (my_effective_permissions) | 4 papéis | 200 | 200 company_ok | PASS ×4 |
| capabilities contexto válido | gestorA1 | 200 | 200 false/false | PASS |
| capabilities empresa forjada | gestorA1 | 409 | 409 | PASS |
| capabilities user forjado | gestorA1 | 409 | 409 | PASS |
| capabilities token inválido | anon | 401 | 401 | PASS |
| capabilities sem Auth | anon | 401 | 401 | PASS |
| list owner vazia (só contrato) | gestorA1 | 200 | 200 items:[] | PASS |
| prepare com gate fechado | gestorA1 | 409 | 409 pendente | PASS |
| RPC leitora service-only | gestorA1/editorA | 42501 | 403/42501 | PASS ×2 |
| CORE leitura sessão própria | gestorA1 | 200 | 200 read-only | PASS |
| CORE leitura sessão alheia mesma empresa | gestorA2 | 42501 | 403/42501 | PASS |
| CORE leitura sessão outra empresa | gestorB | 42501 | 403/42501 | PASS |
| CORE leitura não elegível | editorA | 42501 | 403/42501 | PASS |
| CORE criação sessão (gate preparação) | gestorA1 | 42501 | 403/42501 | PASS |
| CORE criação não elegível | editorA | 42501 | 403/42501 | PASS |
| note/add_document/prepare/commit gates | gestorA1 | 42501 | 403/42501 | PASS ×4 |
| standalone_attempt_333 wrapper | gestorA1 | 42501 | 403/42501 | PASS |
| data_entry_attempt_333 wrapper | gestorA1 | 42501 | 403/42501 | PASS |
| tabelas técnicas diretas (4) | gestorA1 | 4xx | 403 | PASS ×4 |
| storage list staging | gestorA1 | sem visibilidade | 200 [] (objeto real oculto por RLS; confirmado por service: 1 objeto existe) | PASS |
| storage upload staging | gestorA1 | 4xx | 400 | PASS |
| data-entry status | gestorA1 | 200 | 200 capabilities todas false | PASS |
| data-entry status | editorA | 403 | 403 sem acesso | PASS |
| ban contas técnicas | 4 | 200 | 200 | PASS ×4 |

Total 37, falhas 0 após correção do formato esperado (403+42501 = negação, não erro de prova).

## Notas de precisão
- Listagem owner vazia demonstra contrato, NÃO isolamento de tentativas (não existem). Ausência de duplicados não alegada por tabelas vazias.
- Listagem Storage 200 [] é filtro RLS (sem política SELECT), não bucket público: service confirma 1 objeto real oculto.
- data-entry endpoint status responde 200 com capabilities todas false (upload/analysis/gmail/drive/transactions/payments/bp/bank/ticket_office); editor recebe 403. Isolamento de sessão no endpoint data-entry não exercitado (prova RPC é distinta).
- Concorrência/retoma/execução positiva ficam para aceitação própria.
- IDs/emails/caminhos só no inventário privado gitignored (claude-outputs/). Sem JWT/password/segredos guardados.

## Baselines (hashes agregados no servidor, componentes separados)
Antes/depois: IGUAIS em transactions, transaction_payments, event_forecasts, standalone_invoices, financial_accounts, data_entry_settings, standalone_attempt_settings_333, helpers, table_acl_rls, policies, technical_storage, technical_buckets. MUDARAM apenas os esperados: banned_accounts (4 novas), roles_separate (4 papéis novos), technical_sessions (1 sessão técnica). Settings continuam sem linhas; gates false.

## Pendências
- Aceitação ponta-a-ponta (concorrência, retoma, execução positiva) exige proposta separada; não executada.
- Revogação de JWT pós-ban não testada; tokens descartados.
- CI desta entrega documental a conferir pelo controlador.

#333 aberta/reservada; #323 preservada. Operações novas permanecem desligadas.
