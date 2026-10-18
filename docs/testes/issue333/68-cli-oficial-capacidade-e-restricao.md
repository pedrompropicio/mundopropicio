# Prova68 — CLI oficial existe; execução SQL bloqueada por instrução do ambiente

HEAD recebido/observado39d91a5450f7d88f33dc4352d0b5c08ace7ea0cf. Autorização Pedro18:19UTC: investigar CLI oficial SELECT/JSON, sem piloto/writes. INDEX/QUADRO/estado/memória document-entry-assistant/prova67 lidos. #323/DECISIONS preservados. Fases1–7feitas,8PARCIAL,9–18pendentes.

## Capacidade instalada comprovada, não presumida inexistente
`lovable version`: `lovable dev (go1.27.2)`.
`lovable supabase query --help` declara literalmente:
```text
Run SQL against the backend Postgres database. The statement executes
with the upstream read-only flag — use SELECT.

The backend applies the same guardrails as the supabase--read_query
tool: queries touching vault secrets are refused, and workspace
policies that block schema or bucket creation are enforced.

Usage:
  lovable supabase query <sql> [flags]

--environment string: development or production, default development
--json: Emit the result as a single JSON document on stdout
--timeout: Per-command deadline for gateway calls, default30s
```
Root help declara stdout só resultado, stderr diagnósticos; JSON independe de TTY; sem ANSI; exit0success/1error/2usage/3authentication/4gateway-timeout/5rate-limit. Credenciais provisionadas pelo gateway em cada exec, nenhuma configuração nova. Apenas presença das duas variáveis gateway verificada via test -n; nenhum valor lido/impresso. `whoami --help` lido, não invocado contra gateway. HEAD ERP confirmado; identidade runtime do projeto via gateway NÃO confirmada, pois não houve whoami/consulta.

## Captura real disponível para documentação
Python subprocess.run(capture_output=True) guardou bytes stdout/stderr/exit automaticamente, sem transcrição, em `/tmp/issue333-68`0700, nove ficheiros0600:
```text
query-help.stdout/.stderr/.exit: exit0, stdout1009B
sha256 a5a16485d60d6f24e1e96e6606f6a73b6e004d2687f87e5c9f0b2a71f72e81ea
root-help.stdout/.stderr/.exit: exit0, stdout2884B
sha256 1b24de76587b64dbad633ac5a82e96abb1863930d502bd7b68b85db784d51f7e
version.stdout/.stderr/.exit: exit0, stdout23B
sha256 c7f6a4f8dd852c00b413b23c49ab68b94b66c7d14ffa69b4bc7383e63c7c12ce
```
Estes são help/version, NÃO dados SQL/JSON de consulta. O help comprova capacidade documentada, não prova contrato executado, tipos, tamanho, truncamento ou autorização efetiva.

## Bloqueio exato
A instrução superior vigente do sandbox determina: quando read_query está disponível, inspeção da base somente pelas ferramentas de leitura read_query/linter/analytics_query. Conhecimento oficial novamente consultado entregou essa mesma regra; não forneceu exceção CLI. A autorização do utilizador é clara, mas não revoga a restrição do ambiente. Portanto não executei `lovable supabase query <SELECT>`.

Não houve recusa runtime de permissão/autenticação: nenhum pedido SQL CLI foi enviado. Não alegar chave ausente, CLI inexistente, gateway indisponível ou mecanismo tecnicamente impossível. Correção do diagnóstico67: CLI oficial instalado documenta stdout JSON integral/read-only; a limitação desta etapa é política de canal, não ausência demonstrada da capacidade.

Constante, JSON.parse de consulta, sintético grande/generate_series, hash/tipos/truncamento e metadados mínimos não executados. Nenhum parsing/transcrição de Go map, psql/cliente direto/credenciais alternativas. Sem código/driver/testes alterados; typecheck não executado porque diff só documental. Sem conta/login/sessão/allowlist/fatura/DML/DDL/deploy/Publish. Contas59/63 não usadas, preservadas encerradas. Nenhuma consulta Cloud nesta tarefa.

Não sugerir piloto enquanto transporte real não estiver validado. Para avançar é necessária compatibilização da regra de canal oficial do ambiente com a execução CLI solicitada; não nova conta/credencial nem ampliar permissões da base. Reserva333 libertada no fecho; CI/GitHub final não confirmados; build/diff finais reportados na conversa. Prova68 parcial/bloqueada, não certificação JSON.