# #333 — outputs dos testes autenticados (17/10/2026 ~23:20 UTC)

Comandos e resultados não sensíveis. Resultados completos e baselines (hashes) no inventário privado gitignored `claude-outputs/2026-10-17-2315-issue333-*`.

## Ambiente
- HEAD: 7d61108230e594eff3ac87b684b5f1f12d3a1fe7 (git rev-parse HEAD, checkout limpo).
- Script: /tmp/issue333-auth-tests/run.mjs (bun), credenciais de serviço lidas do ambiente, nunca impressas.

## Resumo da execução
```
exit=0
total 37 fails 14 (todas formato: esperado 401, observado 403+SQLSTATE42501 = negação correta)
Após correção do formato: 37/37 PASS comportamental.
```

## Casos (caso | identidade | observado)
```
contexto_canonico mA1/mA2/mB/eA: 200 company_ok
capabilities_valido mA1: 200 {"capabilities":{"scanner_create":false,"accountant_edit":false}}
capabilities_empresa_forged mA1: 409
capabilities_user_forged mA1: 409
capabilities_token_invalido anon: 401
capabilities_sem_auth anon: 401
list_owner_vazia mA1: 200 {"next":null,"items":[]}
prepare_gate_fechado mA1: 409 {"error":"Conferência pendente. Não repitas uma gravação.","status":"pendente"}
rpc_leitora_manager mA1: 403 42501
rpc_leitora_editor eA: 403 42501
core_read_owner mA1: 200 read_only_ok
core_read_outro_gestor_mesma_empresa mA2: 403 42501
core_read_outra_empresa mB: 403 42501
core_read_nao_elegivel eA: 403 42501
core_create_gate_fechado mA1: 403 42501
core_create_nao_elegivel eA: 403 42501
core_note_gate mA1: 403 42501
core_add_document_gate mA1: 403 42501
core_prepare_gate mA1: 403 42501
core_commit_gate mA1: 403 42501
attempt_wrapper_gate mA1: 403 42501
de_attempt_wrapper mA1: 403 42501
tabela_direta_data_entry_sessions mA1: 403
tabela_direta_data_entry_settings mA1: 403
tabela_direta_standalone_attempt_settings_333 mA1: 403
tabela_direta_standalone_attempts_333 mA1: 403
storage_list_staging mA1: 200 [] (RLS oculta 1 objeto real; confirmado por service)
storage_list_staging anon: 200 []
storage_upload_staging mA1: 400
dataentry_status_manager mA1: 200 capabilities todas false
dataentry_status_editor eA: 403 "Sem acesso ao assistente nesta empresa."
ban_conta_tecnica ×4: 200
```

## Baselines (comparação por componente)
```
IGUAL data_entry_settings, event_forecasts, financial_accounts, helpers, policies,
      standalone_attempt_settings_333, standalone_invoices, table_acl_rls,
      technical_buckets, technical_storage, transaction_payments, transactions
MUDOU banned_accounts, roles_separate, technical_sessions (apenas fixtures novas esperadas)
```

## Limites
- Ban não prova revogação de JWT já emitidos; nenhum token persistido.
- Listagem owner vazia não prova isolamento de tentativas inexistentes.
- Sem teste de concorrência/retoma/execução positiva nesta etapa.
