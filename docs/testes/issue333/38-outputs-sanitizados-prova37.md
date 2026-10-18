# #333 — Prova38: outputs integrais sanitizados da prova37

Gerado 2026-10-18 01:50:46 UTC. Scripts/IDs/credenciais/baselines privados NÃO copiados. Conteúdo abaixo é a saída sanitizada integral, não linhas financeiras. O FAIL de fixture é mantido.

## run-sanitized.log
```text
{"case": "canonical manager context", "http": 200, "sqlstate": null, "elapsed_s": 0, "result": "PASS", "evidence": "company/role match, IDs omitted"}
{"case": "capabilities authenticated", "http": 200, "sqlstate": null, "elapsed_s": 1.016, "result": "PASS", "evidence": ""}
{"case": "endpoint populated own list", "http": 200, "sqlstate": null, "elapsed_s": 0.634, "result": "PASS", "evidence": "exact single own fixture, canonical operation/company, no foreign IDs"}
{"case": "RPC populated own list", "http": 200, "sqlstate": null, "elapsed_s": 0.158, "result": "PASS", "evidence": "exact same own fixture"}
{"case": "endpoint different operation empty list", "http": 200, "sqlstate": null, "elapsed_s": 0.581, "result": "PASS", "evidence": ""}
{"case": "RPC different operation empty list", "http": 200, "sqlstate": null, "elapsed_s": 0.184, "result": "PASS", "evidence": ""}
{"case": "endpoint prepare closed", "http": 409, "sqlstate": null, "elapsed_s": 0.694, "result": "PASS", "evidence": "valid schema; canonical RPC gate certified separately"}
{"case": "RPC prepare gate", "http": 403, "sqlstate": "42501", "elapsed_s": 0.174, "result": "PASS", "evidence": ""}
{"case": "endpoint execute closed", "http": 422, "sqlstate": null, "elapsed_s": 0.655, "result": "FAIL", "evidence": "valid PDF; authorize gate certified separately; no upload"}
{"case": "RPC authorize gate", "http": 403, "sqlstate": "42501", "elapsed_s": 0.166, "result": "PASS", "evidence": ""}
{"case": "RPC begin gate", "http": 403, "sqlstate": "42501", "elapsed_s": 0.178, "result": "PASS", "evidence": ""}
{"case": "RPC commit gate", "http": 403, "sqlstate": "42501", "elapsed_s": 0.169, "result": "PASS", "evidence": ""}
{"case": "endpoint confirm closed", "http": 409, "sqlstate": null, "elapsed_s": 0.629, "result": "PASS", "evidence": "valid schema, gate reached before state; not a completed prior result"}
{"case": "RPC confirm gate", "http": 403, "sqlstate": "42501", "elapsed_s": 0.162, "result": "PASS", "evidence": ""}
{"case": "authenticated private standalone_attempts_333", "http": 403, "sqlstate": "42501", "elapsed_s": 0.165, "result": "PASS", "evidence": ""}
{"case": "authenticated private standalone_attempt_audit_333", "http": 403, "sqlstate": "42501", "elapsed_s": 0.154, "result": "PASS", "evidence": ""}
{"case": "authenticated private standalone_attempt_settings_333", "http": 403, "sqlstate": "42501", "elapsed_s": 0.14, "result": "PASS", "evidence": ""}
{"case": "authenticated private data_entry_sessions", "http": 403, "sqlstate": "42501", "elapsed_s": 0.157, "result": "PASS", "evidence": ""}
{"case": "authenticated private data_entry_documents", "http": 403, "sqlstate": "42501", "elapsed_s": 0.167, "result": "PASS", "evidence": ""}
{"case": "authenticated private data_entry_messages", "http": 403, "sqlstate": "42501", "elapsed_s": 0.153, "result": "PASS", "evidence": ""}
{"case": "authenticated private data_entry_previews", "http": 403, "sqlstate": "42501", "elapsed_s": 0.15, "result": "PASS", "evidence": ""}
{"case": "authenticated private data_entry_results", "http": 403, "sqlstate": "42501", "elapsed_s": 0.156, "result": "PASS", "evidence": ""}
{"case": "authenticated private data_entry_storage_receipts", "http": 403, "sqlstate": "42501", "elapsed_s": 0.186, "result": "PASS", "evidence": ""}
{"case": "authenticated private data_entry_settings", "http": 403, "sqlstate": "42501", "elapsed_s": 0.144, "result": "PASS", "evidence": ""}
{"case": "Storage authenticated read data-entry-staging", "http": 400, "sqlstate": "NoSuchKey", "elapsed_s": 0.633, "result": "PASS", "evidence": "no bytes returned; staging existing technical object"}
{"case": "Storage authenticated list data-entry-staging", "http": 200, "sqlstate": null, "elapsed_s": 0.456, "result": "PASS", "evidence": "empty/denied scoped list, no global listing"}
{"case": "Storage authenticated read standalone-invoices", "http": 400, "sqlstate": "NoSuchKey", "elapsed_s": 0.519, "result": "PASS", "evidence": "nonexistent isolated path: denial/absence cannot prove existing-object isolation"}
{"case": "Storage authenticated list standalone-invoices", "http": 200, "sqlstate": null, "elapsed_s": 0.649, "result": "PASS", "evidence": "empty/denied scoped list, no global listing"}
{"case": "Storage authenticated signed URL staging", "http": 400, "sqlstate": "NoSuchKey", "elapsed_s": 0.218, "result": "PASS", "evidence": "no signed URL emitted or persisted"}
{"case": "correct owner check", "http": 200, "sqlstate": null, "elapsed_s": 1.072, "result": "PASS", "evidence": "technical prepare snapshot; no invoice result"}
{"case": "nonexistent RPC check", "http": 403, "sqlstate": "42501", "elapsed_s": 0.185, "result": "PASS", "evidence": ""}
{"case": "wrong operation RPC check", "http": 403, "sqlstate": "42501", "elapsed_s": 0.156, "result": "PASS", "evidence": ""}
{"case": "forged user header", "http": 409, "sqlstate": null, "elapsed_s": 0.465, "result": "PASS", "evidence": ""}
{"case": "forged company header", "http": 409, "sqlstate": null, "elapsed_s": 0.499, "result": "PASS", "evidence": ""}
{"case": "wrong hash direct RPC once", "http": null, "sqlstate": null, "elapsed_s": 20.031, "result": "INCONCLUSIVO", "evidence": "no client retry; bounded 20s; read-only check"}
Own-session activity observations: [{"after_s": 1, "own_sessions": []}, {"after_s": 2, "own_sessions": []}, {"after_s": 3, "own_sessions": []}]
{"case": "wrong hash endpoint once", "http": null, "sqlstate": null, "elapsed_s": 20.033, "result": "INCONCLUSIVO", "evidence": "single bounded read-only request, no resend"}
{"case": "global logout", "http": 204, "sqlstate": null, "elapsed_s": 0.173, "result": "PASS", "evidence": ""}
{"case": "ban new account", "http": 200, "sqlstate": null, "elapsed_s": 0.155, "result": "PASS", "evidence": ""}
CLOSURE [{"banned": true, "sessions": 0}]
BASELINES {"transactions": {"equal": true, "before_n": 1966, "after_n": 1966}, "transaction_payments": {"equal": true, "before_n": 1417, "after_n": 1417}, "event_forecasts": {"equal": true, "before_n": 2300, "after_n": 2300}, "standalone_invoices": {"equal": true, "before_n": 98, "after_n": 98}, "financial_accounts": {"equal": true, "before_n": 27, "after_n": 27}, "data_entry_settings": {"equal": true, "before_n": 0, "after_n": 0}, "standalone_attempt_settings_333": {"equal": true, "before_n": 0, "after_n": 0}, "standalone_attempt_audit_333": {"equal": true, "before_n": 0, "after_n": 0}, "data_entry_sessions": {"equal": true, "before_n": 2, "after_n": 2}, "data_entry_documents": {"equal": true, "before_n": 0, "after_n": 0}, "data_entry_previews": {"equal": true, "before_n": 0, "after_n": 0}, "data_entry_results": {"equal": true, "before_n": 0, "after_n": 0}, "data_entry_storage_receipts": {"equal": true, "before_n": 0, "after_n": 0}, "prior_attempts": {"equal": true, "before_n": 3, "after_n": 3}, "prior_auth": {"equal": true, "before_n": 59, "after_n": 59}, "prior_roles": {"equal": true, "before_n": 81, "after_n": 81}, "prior_profiles": {"equal": true, "before_n": 59, "after_n": 59}, "functions_acl": {"equal": true, "before_n": 22, "after_n": 22}, "table_acl_rls": {"equal": true, "before_n": 311, "after_n": 311}, "policies": {"equal": true, "before_n": 1276, "after_n": 1276}, "storage_objects": {"equal": true, "before_n": 105, "after_n": 105}, "storage_buckets": {"equal": true, "before_n": 2, "after_n": 2}}
TECHNICAL [{"destination_invoices": 0, "own_attempts": 1, "own_audits": 0, "own_objects": 0, "state": "prepare"}]
```

## local-first-failure.log
```text
LIVE SOURCE COMPARISON [{"function": "standalone_attempt_333", "body_exact": true, "source_body_sha256": "c3abe3f908af1cf3288707f0eea91083a69186b12efc9d5eb072b19e951067fb", "live_body_sha256": "c3abe3f908af1cf3288707f0eea91083a69186b12efc9d5eb072b19e951067fb"}, {"function": "standalone_attempt_internal_333", "body_exact": false, "source_body_sha256": "166409b13a34e1a62362aed94f82d4c2c477620d0ba228b051977b412781ab1c", "live_body_sha256": "e21748a97f9dbcc942e6911072881de8564d25987b684fa2dd79ef4dac77c081"}]
Traceback (most recent call last):
  File "/tmp/issue333-proof37/local.py", line 14, in <module>
    owner(['initdb','-D',str(local/'data'),'-U','postgres','--auth=trust','-E','UTF8','--no-locale'])
    ~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-proof37/local.py", line 5, in owner
    def owner(cmd):return subprocess.run(['runuser','-u','lovable','--',str(pg/cmd[0]),*cmd[1:]],env=env,capture_output=True,text=True,check=True)
                          ~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/subprocess.py", line 577, in run
    raise CalledProcessError(retcode, process.args,
                             output=stdout, stderr=stderr)
subprocess.CalledProcessError: Command '['runuser', '-u', 'lovable', '--', '/nix/store/avg1rhq9w93k03qmdaklazcsapn45zpd-postgresql-17.9/bin/initdb', '-D', '/tmp/issue333-proof37/pg/data', '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-locale']' returned non-zero exit status 1.
```

## source-diff-sanitized.txt
```text
--- 0191 body
+++ Live body
@@ -42,7 +42,7 @@
   IF p_envelope->'effects' <> jsonb_build_array(p_operation) AND p_operation<>'assistant_create' THEN RAISE EXCEPTION '#333: Efeitos divergentes' USING ERRCODE='22023'; END IF;
   allowed:=ARRAY['supplier_name','supplier_nif','invoice_number','invoice_date','currency','original_amount','fx_rate','fx_rate_source','total_amount','iva_amount','paid_by_partner_id','notes','file_name','created_by'];
   FOR key IN SELECT jsonb_object_keys(payload) LOOP
-   IF NOT key=ANY(allowed) THEN RAISE EXCEPTION '#333: Campo recusado' USING ERRCODE='22023'; END IF;
+   IF NOT key=[REDACTED] THEN RAISE EXCEPTION '#333: Campo recusado' USING ERRCODE='22023'; END IF;
    IF payload->key <> 'null'::jsonb AND jsonb_typeof(payload->key) <> (CASE WHEN key IN ('original_amount','fx_rate','total_amount','iva_amount') THEN 'number' ELSE 'string' END) THEN RAISE EXCEPTION '#333: Tipo inválido' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF payload->>'currency' IS NULL OR payload->>'currency' NOT IN ('EUR','USD','BRL','GBP') OR (p_operation='assistant_create' AND payload->>'currency'<>'EUR') THEN RAISE EXCEPTION '#333: Moeda inválida' USING ERRCODE='22023'; END IF;
```

## local-final.log
```text
LIVE SOURCE COMPARISON [{"function": "standalone_attempt_333", "body_exact": true, "source_body_sha256": "c3abe3f908af1cf3288707f0eea91083a69186b12efc9d5eb072b19e951067fb", "live_body_sha256": "c3abe3f908af1cf3288707f0eea91083a69186b12efc9d5eb072b19e951067fb"}, {"function": "standalone_attempt_internal_333", "body_exact": false, "source_body_sha256": "166409b13a34e1a62362aed94f82d4c2c477620d0ba228b051977b412781ab1c", "live_body_sha256": "e21748a97f9dbcc942e6911072881de8564d25987b684fa2dd79ef4dac77c081"}]
LOADED docs/testes/issue333/pg/fixture.sql a357d93224fb942cd3c55e3a204c51fe5d8ca63f23aa671bfb2b9b9a46c5decf
LOADED drizzle/migrations/0190_issue333_core_v2_closed_structure.sql b60f9360599f3204ce64c0eebd46350c73f07051ae3365e1dc043c14a3c1248e
LOADED drizzle/migrations/0191_issue333_attempts_closed_structure.sql d4c8029637361010c24d48801a0176181e7e5684706f3123436da0a04822b2e0
LOADED drizzle/migrations/0192_issue333_service_only_capability_reader.sql d2689cd635972292a93fd5abb4017f4ddd979760ccb0b7a56c6898580ab1c422
Captured body redacted by read gateway; use frozen 0191 for internal routine, not invent Live bytes
{"case": "wrong hash 40001", "exit": 1, "sqlstate": "40001", "seconds": 0.027, "pass": true}
ERROR:  40001: #333: Hash divergente
CONTEXT:  PL/pgSQL function standalone_attempt_internal_333(text,uuid,text,jsonb,text,uuid,boolean) line 96 at RAISE
PL/pgSQL function standalone_attempt_333(text,uuid,text,jsonb,text) line 5 at RETURN
LOCATION:  exec_stmt_raise, pl_exec.c:3911
{"case": "missing ID 42501", "exit": 1, "sqlstate": "42501", "seconds": 0.0332, "pass": true}
ERROR:  42501: #333: Tentativa indisponível
CONTEXT:  PL/pgSQL function standalone_attempt_internal_333(text,uuid,text,jsonb,text,uuid,boolean) line 95 at RAISE
PL/pgSQL function standalone_attempt_333(text,uuid,text,jsonb,text) line 5 at RETURN
LOCATION:  exec_stmt_raise, pl_exec.c:3911
{"case": "prepare closed 42501", "exit": 1, "sqlstate": "42501", "seconds": 0.0287, "pass": true}
ERROR:  42501: #333: Operação ainda não ativada
CONTEXT:  PL/pgSQL function standalone_attempt_internal_333(text,uuid,text,jsonb,text,uuid,boolean) line 20 at RAISE
PL/pgSQL function standalone_attempt_333(text,uuid,text,jsonb,text) line 5 at RETURN
LOCATION:  exec_stmt_raise, pl_exec.c:3911
{"case": "authorize closed 42501", "exit": 1, "sqlstate": "42501", "seconds": 0.0306, "pass": true}
ERROR:  42501: #333: Operação ainda não ativada
CONTEXT:  PL/pgSQL function standalone_attempt_internal_333(text,uuid,text,jsonb,text,uuid,boolean) line 20 at RAISE
PL/pgSQL function standalone_attempt_333(text,uuid,text,jsonb,text) line 5 at RETURN
LOCATION:  exec_stmt_raise, pl_exec.c:3911
{"case": "correct owner", "exit": 0, "sqlstate": null, "seconds": 0.0433, "pass": true}

{"case": "second connection row lock after error", "pass": true, "exit": 0}
LOCAL effects 0|0|0
```

## diagnose-sanitized.log
```text
SERVER SOURCE COMPARISON [{"function": "standalone_attempt_internal_333", "server_comparison": [{"body_matches_frozen_0191": true, "hash_comparison_present": true, "serialization_code_present": true}]}, {"function": "standalone_attempt_333", "server_comparison": [{"body_matches_frozen_0191": true, "hash_comparison_present": false, "serialization_code_present": false}]}]
AFTER CAPABILITIES 404 payload omitted
TECHNICAL STAGING READ [{"service_status": 200, "size": 94, "matches_proof22_fixture": true}]
SCOPED TELEMETRY AGGREGATE {"rows": []}
```

## capabilities-final.json
```text
{"http": 200, "capabilities": {"scanner_create": false, "accountant_edit": false}}
```
