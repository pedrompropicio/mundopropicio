# #333 tarefa95 — scanner94 no ERP, janela NÃO aberta (sanitizado)

Base f9e113c9 (CI420 run39260050194 SUCCESS, controller).

## Feito
- data-entry: ANALYSIS_ENABLED/ANALYSIS_PROVIDER_REVIEWED=true; uploadEnabled=false, pilotScoped=true. Deploy só data-entry, source_sha256 757c75c3a7c9b1c81a5a491e7e91269c03328059653d2cf2fcc948920c013e19 (recibo de submissão, não inspeção dos bytes hospedados).
- Scanner legado (extract-camarim-receipt) não redeployado neste passo.
- Checks: POST sem auth 401 UNAUTHORIZED_NO_AUTH_HEADER; anon 401 "Sessão inválida". Zero chamadas ao modelo.
- Readback após deploy: control rev6 closed/idle, enabled/reviewed false, claim NULL; audit 6 linhas (igual); allowlist 1 linha preparation93 disabled/expirada; 0 capacidades abertas; 0 assistant_create.
- Efetivamente fechado: análise exige control reopen + preparation ativa.

## Modelo
SCANNER_MODEL google/gemini-2.5-flash (igual ao scanner legado em produção). Catálogo indica deprecated, não removido; não trocado. Disponibilidade só se prova na janela real. Alternativa se falhar: google/gemini-3-flash-preview, apenas com autorização do Pedro.

## Abertura (controller, com o Pedro no modal; mesma linha/gestor/empresa93)
```sql
update public.data_entry_pilot8_allowlist set enabled=true, expires_at=now()+interval '600 seconds'
 where reviewed_note='issue333-tarefa93-analysis-single' and operation='preparation';
select public.data_entry_analysis_responsible_333('reopen', 6, NULL, '373462ab7f6d6d8d872c62a4f83d7ff595f561522b1054408f81e7f1abfb175c');
```
## Fecho (sempre, após resultado/erro/Stop/expiração)
```sql
select revision, active_claim from public.data_entry_analysis_control_333;
select public.data_entry_analysis_responsible_333('close', <revision>, <active_claim ou NULL>, NULL);
update public.data_entry_pilot8_allowlist set enabled=false, expires_at=now()
 where reviewed_note='issue333-tarefa93-analysis-single' and operation='preparation';
```
Depois: gates false + deploy data-entry. Resultado incerto: não fazer confer/reopen. assistant_create nunca.
Hash da decisão: sha256("issue333-tarefa95-scanner94-window-v1").

## Limitações
PDF: só 1.ª página analisada, sinalizada (sem truncagem silenciosa). Candidatos ficam só no browser. HTTP200 não prova extração correta.
