# #333 12j — deploy da correção da conversa (R2) — 23/10/2026 ~00:09 UTC

Autorização: Pedro, nesta sessão — deploy APENAS data-entry, janela e lançamentos bloqueados. Base HEAD 1dba2cc54126dc30e27e089fec11d3f8f0f80a9c (código corretivo 42de3337); CI controller run39875891839 job120161284002 quality SUCCESS (informado pelo controller, não verificado pelo agente).

## Readback antes (read_query, 00:08:38Z)
executor=false; review=false; controlo rev21 closed, enabled=false, reviewed=false, claim NULL, stage idle, reason closed (changed_at 2026-10-22 23:39:49Z); âmbitos total 1 / ativos 0 (expirado 2026-10-22 23:39:49Z, preservado).

## Deploy
Ferramenta oficial deploy_edge_functions, `["data-entry"]`: "Successfully deployed edge functions: data-entry".
- source_sha256 submetido (ficheiros+settings): `cca1604229023302a2034f36cb2619b3be63c784a18fd5a4473130e226d9c7c0`
- sha256 index.ts local: `bad41ce54d58d69e6ab87bf80ceaaa413d58483725f10a5c4fdfa7f7d017809c`
- Versão/deployment ID: não expostos pela ferramenta. Hash submetido não é prova independente do hash live.
- Sem edição de código/flags; nenhuma outra função deployada.

## Endpoint pós-deploy
OPTIONS 200; POST sem Authorization 401 `UNAUTHORIZED_NO_AUTH_HEADER`; POST com chave pública anon 401 `Sessão inválida`. Sem login nem sessão.

## Readback depois (00:09:08Z)
Idêntico ao antes: executor=false, review=false, controlo rev21 closed/idle/claim NULL, 0 âmbitos ativos, âmbito expirado intacto.

## Não feito
SQL/DDL/DML, criar/renovar âmbito, abrir janela, Publish, OAuth, IA/Gmail, lançamentos, testes autenticados. #322/#323 intocadas. CI do commit documental posterior NÃO verificado. Janela aguarda passo próprio com Pedro presente.
