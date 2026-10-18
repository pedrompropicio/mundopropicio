# Prova73 — preparação concreta, nenhum piloto

Pedido Pedro18/10/2026 19:18UTC. HEAD comunicado `fedf70a1d7d4634ead5da629f2276f9af8490a0d`; HEAD observado no checkout `b53eb19c500839ec2cc2c0afc70bc506944b1e5f`: não afirmar igualdade GitHub/Lovable nem commit desta entrega. Sem reset/rebase/push. #323/DECISIONS/AGENTS preservados;1–7done,8PARCIAL,9–18pendentes. Reserva333 única durante a preparação, libertada no fecho.

## Manifesto completo sanitizado para revisão

Manifesto72 revisto e promovido SOMENTE a proposta73, sem trocar silenciosamente o marcador já preparado. Nunca usado para conta. Regex exata `^issue333-pilot8-[a-f0-9]{32}$`: sufixo32hex, NÃO64hex. Retirados59/63 recusados por driver e renderer.

```json
{
 "version":1,
 "marker":"issue333-pilot8-63b8a466ff893f26f00e6ba66cce7f6a",
 "email":"issue333-pilot8-63b8a466ff893f26f00e6ba66cce7f6a@fixture.invalid",
 "reference":"FICTICIO-issue333-pilot8-63b8a466ff893f26f00e6ba66cce7f6a",
 "companyMP":"7c858982-6ccd-47ca-bd65-e0dd3eebf01c",
 "full_name":"Membro Fictício Piloto8",
 "pdfSha256":"8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f",
 "pdfSize":1517,
 "pdfMime":"application/pdf",
 "pdfPath":"/tmp/issue333-proof73/future-pilot/pilot8-fiction.pdf",
 "manifestPath":"/tmp/issue333-proof73/future-pilot/manifest73.json",
 "owner_id":null,"role_id":null,"created_at":null,
 "identity_created":false,"pilot_authorized":false,
 "expected":{"accounts":1,"login":1,"documents":1,"previews":1,"executeSamePreview":2,"results":1,"standaloneInvoices":1,"currency":"EUR","total":0,"IVA":0,"financialEffects":0,"permissions":["preparation","assistant_create"],"permissionSeconds":600,"afterRevokeCheck":"HTTP200/conferido sem escrita","finalSessions":0}
}
```

Manifesto/PDF locais0600; bytes PDF revalidados contra SHA/size aprovados, sem substituição documental real. `full_name` explícito corresponde ao candidato anterior; audit usa nome recebido no servidor, não hardcode de Pedro.

## AuthAdmin — presença não prova canal permitido

Revisão do método histórico63: classe `AuthAdmin57`, `POST /auth/v1/admin/users` com email_confirm=true, user_metadata do manifesto e senha aleatória temporária; uma chamada, sem retry/envio. Logout global e ban usam os endpoints próprios da mesma classe. Entrada por checkpoints não cria conta; criação é passo separado e nunca retoma.

Configuração verificada SOMENTE por presença: três variáveis exigidas pelo código presentes. Nenhum valor/tamanho/hash secreto foi lido/publicado; não houve secrets listing, probe HTTP, create/login ou sessão. Presença não prova validade/permissão. O código histórico pressupõe chave administrativa; instruções atuais do ambiente declaram-a inacessível no Lovable Cloud e não estabelecem provisionamento oficial deste caminho. Não assumir que a ocorrência histórica63 autoriza/revalida a execução atual. **Bloqueio concreto: falta confirmar um mecanismo AuthAdmin oficial permitido neste ambiente para criação/logout/ban; não pedir chaves ao Pedro, não usar CLI ou cliente alternativo.** Aprovação de piloto pelo Pedro não supera restrição de ferramenta. Ação controller: confirmar com a plataforma o meio gerido oficial que executará uma única criação e cleanup, sem expor credenciais. Até lá, zero chamadas Auth.

## SELECT atual autorizado, não baseline manual

Uma única `read_query` oficial: marker_count0,reference_count0,company_active1,active_allowlist0,core_open0,attempt_open0. Retorno textual map; apenas condição pontual, NÃO capturado/reconstruído como envelope/baseline. Sem funções de aplicação/escrita. Baseline72 histórica NÃO vale para piloto futuro. Contas59/63 não consultadas nem modificadas.

## Novos SQL inertes e renderer

Artefactos novos `pilot8-preparation73/{activation,revoke}.INERTE.sql`, `render73.py`, sem modificar templates/render64 ou identidade63. Template contém único `__MANIFEST73_PARAMETERS__`; nenhum marcador fixture embutido. Renderer deriva TODOS os parâmetros do manifesto validado, revalida bytes/PDF/regex/email/ref/company, exige UUID canónico e timestamp com timezone quando identidade for revista, recusa janelas invertidas/>600s, escreve exclusivamente novo ficheiro/tmp0600 e NUNCA executa SQL.

Ativação: BEGIN/COMMIT; lock transacional;5fontes MD5/triggers exatos;empresaMP/roleuser/auditoria real/contexto canónico;zero login/sessões/refresh_tokens/documentos/resultados/fatura/allowlist própria;flags globais fechadas. Nome/PDF metadata exatos. created_at por igualdade independente da pausa, não identidade futura. Janela de ativação atual≤600s revalidada antes de INSERT;roleuser→manager uma linha auditada;duas operações, TTL600s. Nenhum GRANT/DDL/flagglobal. Falha rollback total. Revogação: lock+identidade exata+escopo owner de2linhas, UPDATE enabled=false só nota/company/duasoperações revistas;sem DELETE/GRANT, após expiração também permitida. O role manager permanece na conta banida como no contrato existente; não inventar reversão adicional.

SQL para revisão com placeholders: `/tmp/issue333-proof73/future-pilot/{activation73,revoke73}.REVIEW.INERTE.sql`0600. NÃO executar estes ficheiros: ainda não há owner/role/created_at nem janela real.

```text
python3 docs/testes/issue333/pilot8-preparation73/render73.py activation /tmp/issue333-proof73/future-pilot/manifest73.json /tmp/issue333-proof73/future-pilot/activation73.REVIEW.INERTE.sql
python3 docs/testes/issue333/pilot8-preparation73/render73.py revoke /tmp/issue333-proof73/future-pilot/manifest73.json /tmp/issue333-proof73/future-pilot/revoke73.REVIEW.INERTE.sql
Futura renderização: acrescentar /tmp/identidade-revista.json e START END ISO8601 à ativação; não fornecer janela da criação.
Saída: rendered INERT only; placeholders require controller review
```

## Bundle por etapa e operação única futura

`bundle73.ts` produz nove contratos version1/id/query/fingerprint/expectedKeys/schema/maxBytes; catálogos, agregados/count/hash apenas. Templates com identidade são INERTES até UUID/role/created_at reais, dados técnicos privados, nenhuma linha financeira individual exportada. Uma linha JSON/SELECT por checkpoint reduz turnos e assegura snapshot dentro da consulta. Fontes completas/ACL via metadata e baseline; provas de browser/PDF separadas, nunca inferidas de count.

1. Controller recebe precreation+metadata+baseline1+baseline2 atuais; encaminha JSON.stringify(structuredContent.rows) completo+bytes/SHA256 upstream. Dois baselines iguais e ausência/flags/fontes aprovadas ANTES de criação; falha pára.
2. Meio oficial AuthAdmin confirmado+autorização concreta: UMA criação, senha só memória/tmp0600/emailconfirmsem envio. Controller revê UUID/role_id/created_at e manifesto. Bundle identity deve provar exact1/roles1/signed0/banned0/sessions0/refresh0/permissions0/invoices0/results0/docs0/previews0.
3. `prepare` por checkpoints66/receiver71: retoma mesma identidade; SELECT requests persistentes retornam sem timer/SELECT pendente. Baselines e PDF revalidados. Chega await_activation. Nenhuma criação em retoma.
4. Controller renderiza/revê identidade+janela ATUAL e ativa só SQL73 autorizado. Bundle activated: exact1/manager/roles1/permissions2/enabled2/unexpired2/global_active2/globals0/signed0/sessions0/invoices0. Limite600s desde INSERT, não desde revisão da conta.
5. `execute`: pré-check final antes do único login. UI canónica,UMPDF/UMpreview,autorização nome servidor;DUASHTTPexecuteMESMApreview. Browser.json+parHTTP sanitizados antes das guardas,downloadSHAigual. Bundle prerevocation:1faturaEUR0IVA0/1resultado/1doc/1preview e baseline não-fixture inalterada. await_revocation.
6. Controller revoga exatas2rows via SQL73;bundle revoked prova enabled0/global_active0 e artefactos conservados. `finish`: próprio lote HTTP200/conferido autenticado,nenhuma escrita; não exigir negar leitura autorizada.
7. Finally/cleanup:logoutglobal,ban somente identidade nova,senha/JWT apagados quando logout confirmado;bundle final SELECT independente sessions0/refresh0/banned1/permissions2enabled0 e baseline/fontes/ACL preservados. Incerto/falha/expiração nunca autoriza retry/login/parHTTP/conta nova. Cleanup pode ser retomado somente conforme journal, não execução.

Nove contratos complementares preparados em `/tmp/issue333-proof73/bundle73/`; não substituem magicamente os pedidos exatos gerados pelo executor71. O receiver exige id/query/fingerprint/schema do pedido persistido; templates nunca podem ser usados para responder outro pedido. Driver existente ainda emite múltiplos SELECTs finitos de cada método: previsão conservadora20–30trocas, não promessa de9turnos E2E. Controller precisa manifesto, identidade revista técnica, requests efetivos completos e metadados upstream; nunca senha/JWT no chat. Não exigir novas autorizações para cada leitura técnica já autorizada; aprovação concreta única deve cobrir as escritas/cleanup, e o executor recebe os tokens locais de autorização de etapa existentes.

Tamanhos reais queryBytes:precreation925,metadata3463,baseline3343cada,estágios7644–7647 com placeholders. Estimativa de envelope8/16/32KiB conforme contrato; não medida Cloud para novos estágios. LimiteLOCAL65536,oversized falha fechado e solicita redução necessária, sem chunks/150KiB. 18942bytes prova70 não é medição universal. O bundle foi executado somente em PG local para validar sintaxe/schema/read-only.

```text
bun docs/testes/issue333/pilot8-preparation73/bundle73.ts /tmp/issue333-proof73/future-pilot/manifest73.json /tmp/issue333-proof73/bundle73
bunx vitest run --config docs/testes/issue333/pilot8-preparation73/vitest73.config.ts
30 tests PASS — PostgreSQL local real, socket sem TCP, fetch proibido.
bunx vitest run src/test/issue333-preparation73.test.ts src/test/issue333-controller-checkpoint71.test.ts src/test/issue333-controller-message69.test.ts
39 tests PASS.
bunx tsgo -p docs/testes/issue333/pilot8-preparation73/tsconfig73.json
exit0, sem diagnósticos (drivers explicitamente incluídos).
```

PG:manifestoNOVO credencial-free/PDF exato,renderer real executado,identidade30min antiga+janela atual aceita,18negações rollback,metadataPDF/nome/refresh5negações,source/triggerdrift,segundoINSERTfalha,revoke após expiração/troca owner e9SELECT schema/read-only sem mudança. Sem novo Chromium/piloto nesta tarefa; testes39 reaproveitam integração receiver/executor local já existente, não Cloud. Logs privados/tmp; testes reproduzíveis não dependem do manifesto privado72/73 na CI. Build automático observado19:22:18 OK; nenhum build manual. GitHub/CI final não confirmados.

## Fecho e proposta de autorização

Preparação local concluída, transporte já validado; prontidão Cloud BLOQUEADA pelo meio AuthAdmin oficial atual, autorização piloto e revisão da identidade/baselines futuros. Zero contas/login/escritasCloud/DDL/deploy/Publish. Nenhum novo sintético. Próximo mínimo: confirmar meio oficial AuthAdmin e controller rever o escopo abaixo, depois bundle read-only atual antes de UMA criação.

Autoriza UM piloto do manifesto73 por meio AuthAdmin oficial confirmado, com criação única e login, promoção restrita user→manager auditada, duas permissões600s, uma fatura FICTICIO EUR0/IVA0 e duas execuções da mesma prévia, revogação exata, checkHTTP200 sem escrita, logout global/ban da nova conta e confirmação independente sessões0, sem retry/conta nova/efeitos financeiros/flags globais/DDL/deploy/Publish?