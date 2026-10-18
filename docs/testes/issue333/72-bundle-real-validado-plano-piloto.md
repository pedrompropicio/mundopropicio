# Prova72 — bundle real recebido, validado e consumido em ordem

18/10/2026, pedido recebido às 19:13 UTC. HEAD local observado `3cbc591ae4e2314a77eef18a80c2d0b4a81c0de7`, igual ao último HEAD comunicado pelo Pedro; não constitui verificação independente de GitHub/CI. Autorização de receção exclusivamente neste ERP: metadados técnicos, sem registos financeiros individuais. Nenhuma consulta Cloud adicional, CLI SQL, psql, conta, login, sessão Cloud, permissão, fatura, escrita Cloud, DDL, deploy ou Publish. Contas59/63 não utilizadas; artefactos preservados. AGENTS/#323/DECISIONS intactos. Fases1–7 concluídas,8PARCIAL,9–18pendentes.

## Captura e consumo reais

Cada texto entre marcadores foi capturado separadamente em UTF8 sem newline final, ficheiro0600 no diretório0700 `/tmp/issue333-proof72/`. Não houve geração de payload a partir de fixtures nem substituição do segundo snapshot pelo primeiro. Os bytes capturados foram comparados aos metadados upstream ANTES do consumo pelo receiver integrado de bundle71. Os três hashes/bytes coincidiram integralmente:

- metadata-0001:4038 bytes; SHA256 `1b2aa4d8177a471849dd3655422647b4fe117369ff7739d62e8e8b8e29f5c69a`.
- baseline-0001:9258 bytes; SHA256 `9e99b6a7b7ca18827ccef511a716af31dd356b5f33790875c95a0226951ce725`.
- baseline-0002:9258 bytes; SHA256 `e820885431c0ed7641750b9f0a17c6af79f1e9d87a7fc072d210a68a64419b34`.

Preparação/receção realizadas sequencialmente pelo `bundle71-cli.ts` LOCAL (não CLI SQL): metadata→baseline1→baseline2, todas exit0; requests finais consumed. Receiver valida version/id/query/fingerprint/chaves/schema aninhado/rowCount1/limite65536 e igualdade upstream. Receipts e raw originais ficam privados no subdiretório `receiver/`. Bytes originais `metadata-received.json`, `baseline1-received.json`, `baseline2-received.json`; metadados e comparação privados no mesmo diretório.

Query fingerprints iguais aos contratos71. Cinco fontes canónicas iguais às constantes revistas do driver; incompatibilities vazio, allowlist ATIVA zero. `JSON.stringify(data)` dos dois snapshots exatamente igual; quinze relações únicas com nomes exatos do bundle, todos count/hash iguais. Dezoito assinaturas de configuração únicas; fontes/ACL/config/owners iguais entre snapshots; owner preservado como string sem coerção. Core/attempt fechados. Hash da gate coincide também entre metadata e config. Linhas históricas da allowlist são distintas de permissões ativas; não foram removidas.

Não se publica conteúdo de ACL, identificadores internos, contagens financeiras nem hashes de relações. Igualdade das ACL prova estabilidade entre os dois snapshots, não uma nova auditoria de todas as permissões. Metadata cobre presença de colunas, não tipos/RLS/índices/buckets. MD5 não é assinatura; SHA upstream comprova correspondência dos bytes recebidos, não autenticação criptográfica do emissor. A origem oficial upstream é a comunicada pelo controller. Nenhum dos SELECTs foi reexecutado aqui.

## Verificações locais

```text
bun docs/testes/issue333/pilot8/bundle71-cli.ts prepare /tmp/issue333-proof72/receiver <id>
bun docs/testes/issue333/pilot8/bundle71-cli.ts receive /tmp/issue333-proof72/receiver <id> /tmp/issue333-proof72/<nome>-received.json /tmp/issue333-proof72/<nome>-upstream.json
metadata / baseline1 / baseline2: prepare0, receive0, consumed
bunx vitest run src/test/issue333-controller-message69.test.ts src/test/issue333-controller-checkpoint71.test.ts src/test/issue333-checkpoint66.test.ts
3 files PASS, 51 tests PASS
```

Logs privados `tests.log`, `comparison.json`, `readiness72.json`. Esta suite não é um novo piloto Cloud nem nova prova Chromium Cloud. PDF fictício existente validado por pdfinfo e pelo `exactPdf57` real:1517bytes, MIME application/pdf, SHA256 `8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f`.

## Novo manifesto e prontidão

Manifesto concreto privado0600: `/tmp/issue333-proof72/future-pilot/manifest72.json`; PDF privado0600: `/tmp/issue333-proof72/future-pilot/pilot8-fiction.pdf`. Marcador novo aleatório compatível com driver, email marcador@fixture.invalid, referência FICTICIO-marcador; empresa MP estabelecida. Owner/role/created_at nulos: nenhuma identidade criada. PDF reutiliza apenas conteúdo fictício aprovado, nunca identidade59/63. Ausência real do novo marcador/referência ainda NÃO verificada, requer SELECT específico antes de qualquer criação futura. Manifesto e PDF aceites pela parametrização real do driver.

Transporte necessário está validado; não medir150KiB nem chunks. Piloto não autorizado nesta tarefa. Prontidão CONDICIONAL: exige autorização expressa das etapas, mecanismo oficial autorizado de AuthAdmin e SQL de ativação/revogação revisto para NOVO marcador/identidade. A entrada atual depende de ambiente AuthAdmin privado; disponibilidade não verificada, não pedir chaves privadas inacessíveis no Cloud. `render64.py` conserva o marcador antigo nos templates: NÃO usar diretamente para nova identidade. Não alterar templates antigos nem reabrir fixture63.

## Plano concreto de UM piloto — proposta, NÃO execução

1. Controller revê manifesto privado e autoriza etapas específicas e o meio AuthAdmin. Verificar ausência marcador/referência, fontes e flags; dois baselines atuais estáveis, sem efeitos. Falha pára antes de conta.
2. AuthAdmin autorizado cria UMA identidade, email confirmado sem envio, senha aleatória apenas em memória/tmp0600; papel inicial user, metadata/PDF exatos. Checkpoint finito com UUID/created_at/role_id exatos, zero login/sessões/documentos. Nunca criar conta em retoma.
3. `prepare`: revalidar identidade/empresa/PDF/fontes/baseline/flags. Cada SELECT em pedido persistido e retorno imediato controller_select; consumir envelope oficial como nesta prova. Sem timer/SELECT pendente entre turnos. Chega await_activation.
4. Controller revê SQL NOVO transacional com esses parâmetros: role user→manager (uma linha, auditoria), exatas duas permissões preparation/assistant_create, prazo600s; flags globais falsas, nenhuma identidade histórica alterada. Janela≤10min só de ativação, created_at exato independente da pausa humana. SQL nunca executado pelo receiver.
5. `execute`: revalidar tudo pós-ativação e expiração ANTES do único login. UI canónica: um PDF/documento, uma prévia imutável EUR0/IVA0, autorização por nome servidor; DUAS requests execute da MESMA prévia. Persistir browser.json sanitizado e as duas respostas HTTP antes de guards. Conferir exatamente um resultado/fatura avulsa fictícia, downloadSHA igual e zero efeitos financeiros. Checkpoint await_revocation.
6. Controller revoga exatas duas permissões por owner/company/operation/reviewed_note; conservar linhas/PDF/fatura/evidências. `finish`: revalidar revogação e check autenticado do próprio lote HTTP200/conferido, baselines antes/depois sem escrita. Não exigir negar leitura legítima.
7. Finally: logout global, ban SÓ nova identidade, SELECT independente sessões0 e baselines/fontes/flags; apagar secrets/journals privados de sessão, preservar evidência. Falha/expiração/estado incerto nunca autoriza retry/login/parHTTP novo; cleanup separado e autorizado, sem segunda conta.

Comandos de etapa para revisão, NÃO correr agora:
```text
PILOT8_MARKER=<do manifesto privado> PILOT8_PRIVATE_DIRECTORY=<diretório privado revisto> PILOT8_AUTHORIZATION=PEDRO_AUTHORIZED_CHECKPOINT66_PREPARE bun docs/testes/issue333/pilot8/run-cloud57.ts --checkpoint66=prepare
Etapas seguintes: EXECUTE/execute, FINISH/finish ou CLEANUP/cleanup, cada qual com autorização própria.
```
Não há comando de criação na entrada por checkpoints. O meio AuthAdmin deve ser acordado antes; nenhum fallback CLI/cliente direto/relay antigo. SQL final só após identidade revista, sem placeholders tratados como valores reais.

## Fecho

Bundle real validado; prontidão condicional/plano entregues, não aceitação integral fase8. Reserva333 libertada; GitHub/CI novo não confirmados. Próximo único passo: revisão/autorização do manifesto, mecanismo AuthAdmin e etapas; nenhum sintético/piloto automático.