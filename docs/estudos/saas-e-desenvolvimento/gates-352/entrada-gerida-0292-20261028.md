# #352 — 0292 e CA concluídas; prontidão bloqueada por tabela nova fora do ledger

**G1 e idempotência verdes; G2 atual sem função bloqueante, mas ainda vermelho.** A 0292 foi incluída sob o Sim [6474988465](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6474988465), usando exatamente a regra `sanitized_literal_reconstruction`. A CA pública foi descarregada e fixada no privado. O único desvio bloqueante é a nova tabela `public.bkp_359_p6_prova_reconstruida` e os seus objetos dependentes, presentes em Live e fora do ledger. Não foi incluída nem excluída por uma regra nova. **R2 mantida; nenhuma ligação ao mp-homolog, credencial sua, segredo criado ou escrita em Live.**

Este parecer substitui os bloqueios 0292/CA de [6474743735](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6474743735). Preparação sob 6457767848 e revisão 6470659655, mantendo 6458541603, 6459990752, 6465391041 e 6466343281. O Sim de aplicação 6469468379 continua limitado ao candidato antigo; não cobre os novos hashes.

## 1. Candidato, commit e integridade

- Código ensaiado: [`d473cd040b213b7c6bdfb4fa6be9048c5eaded2c`](https://github.com/pedrompropicio/mundopropicio-replay/commit/d473cd040b213b7c6bdfb4fa6be9048c5eaded2c). Commit final do dossier: [`3b00905cbaffe99409959ce7a0b57a938c11191d`](https://github.com/pedrompropicio/mundopropicio-replay/commit/3b00905cbaffe99409959ce7a0b57a938c11191d), descendente direto do código ensaiado; só documentação/provas.
- Candidato ZIP: **`2d2c9096d4c64715e86e06b034246a70aff2874a6680c8540fa5ecb146a5cf11`**, 2138061 bytes; **55 fontes**, 2117291 bytes. Manifesto SHA-256 `5deef62e242556424e4bf88c32e1caa6dcdd0663ea59d263db19a0eeacf46df5`.
- Entrada `managed_apply.py`: **`545d6a35ccff708efb231e2950324c82988eefa519034d9147033be2b2ab1ec9`**.
- Workflow manual: **`811cb4809594de73b7d0d8e8a1f4757cee1d1c13d0aa5114a7ba989a1f2ff085`**.
- [Run 21 / 40741282470](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40741282470), terminado em **28/10/2026 15:28:16 Fortaleza**. Resultado global **failure**, deliberadamente fechado em C7/G2; não é apresentado como run integralmente verde.
- [Dossier privado](https://github.com/pedrompropicio/mundopropicio-replay/tree/3b00905cbaffe99409959ce7a0b57a938c11191d/docs/352/managed-0292-20261028); inventário integral e provas preservados. Artefacto CI `12840339498`, SHA-256 `0a02fe35c9094e860369ee2f83dc787f3b4dc91df3ba182b9065ffaa38455262`. Arquivo duradouro de revisão SHA-256 `4c71b0d22c5b2d46fe61113a21b350dc0dcf587547de5d7befaaafdd7f315199`; exclusões reprodutíveis enumeradas em `archive-manifest.json`.

A identidade técnica e os metadados Connect do destino permanecem apenas em `target.private.json`, no privado. A CA foi obtida do URL público fornecido pelo Pedro, é a Supabase Root 2021 CA e foi validada offline; bytes e SHA-256 são conferidos pelo launcher, com o pin apenas no ficheiro privado. Nenhum teste de ligação ao destino foi feito.

## 2. Migrações e reconstrução exata da 0292

O [inventário completo, ordenado, com hashes de todas as migrações e operações incluídas](https://github.com/pedrompropicio/mundopropicio-replay/blob/3b00905cbaffe99409959ce7a0b57a938c11191d/docs/352/managed-0292-20261028/all-included-migrations.json) conserva o histórico, a baseline, 0282–0284, o suplemento abaixo e as duas compensações ACL de aplicação já aprovadas. O suplemento cobre todos os hashes observados: **294 entradas Drizzle e 711 versões Supabase**. Não surgiu uma migração posterior a 0292 nas reconferências registadas.

| Migração | ID no ledger Live | SHA-256 original integral |
| --- | --- | --- |
| `0285_0285_p6b_a_pagar_caches.sql` | 287 | `7ac3022659a738f39be5218d1f197e3d57828cdb1e2d1ab5529a9fe838505de7` |
| `0286_reembolso_pagamento_fora_resultado.sql` | 288 | `232e449253bddb32a9d8a6bca3e8e7a2328fda1b93490b3e393115da9b9fdff8` |
| `0287_reembolso_invariante_corpo_exato_0286.sql` | 289 | `4bea9f3b0e3e5a3bf3bca899834124e4265a41c04637f60a2fbf1f07a119e397` |
| `0288_reembolso_invariante_corpo_exato_0286_b.sql` | 290 | `51eeb696a791d919c8f748dd6e13f08bc956481be2006fd1eb50cd732370c19f` |
| `0289_0289_p5c_cenario_receita_prevista.sql` | 291 | `b489f043fa7796769f4530fd84e1dc10ef964376b9764c8f1774f7ebe35f317b` |
| `0290_p5c_rpc_exact_manual_bytes.sql` | 292 | `e6058e8aae7d38b10f66f4e99731564be7026c7d187ec68b540aebf93f6ba400` |
| `0291_issue359_ponto4_descadastro_independente.sql` | 293 | `aaf752e4e5e50a6e9aa350eb8002d473aab3a1a5f94885601d810ea3a421285b` |
| `0292_issue359_eb_open_authorisations_link.sql` | 294 | `6c977a3e6f2974b2affbc1f629cc62bf88fcdae201027c1facda95218c88d108` |

A 0292 original tem 8179 bytes. O SQL efetivo tem 8235 bytes e SHA-256 **`839485d299097f3590246e009d2f3457bec70c1486c6310dc5bd008d1d532537`**. Só foram substituídos os dois fragmentos autorizados: email da linha 12, coluna 47, hash `2ad81d28d902f115abae1207d35925f9489fb0fb90698f21f0c75d0717cd46a3`; host do URL da linha 93, coluna 30, hash `7a562dd5164092811104ca344ff4e8cb3fea1480f3864670b54ed2e49bdb7ca0`. O URL completo da linha 93 tem hash `20d5ab8514aa9e9c84068e774c6dd6b359c963d9271c9d88bc1732018db4d7a8`. Os valores originais não são publicados.

O sanitizador existente foi copiado byte a byte. A prova fixa posições, classes e hashes, verifica todos os bytes inalterados e reconstrói exatamente a fonte original. O ledger continua a registar o hash original; manifesto, scanner, prova com guardas e entrada gerida ligam o SQL efetivo ao hash sanitizado. A definição Live é provada igual à fonte canónica antes da reconstrução; só o par exato de hashes entra na substituição N3 existente. **Nenhuma regra ou allowlist foi alargada.** As duas admissões da 0286 mantêm-se. A correção do URL do produto continua na [#394](https://github.com/pedrompropicio/mundopropicio/issues/394).

## 3. Ensaio C1–C7 e ausência de efeitos

O workflow de preparação chamou a mesma `managed_apply.run()` prevista para a aplicação. C1 precedeu qualquer escrita e provou identidade/TLS, postgres sem superutilizador nem membership administrativo, vazio de aplicação com inventário, extensões/versões, 22 membros da plataforma e visibilidade dos contadores. A simulação Storage foi instalada só na preparação administrativa descartável, antes de C1. A entrada gerida fez **zero bootstrap, zero operações administrativas, zero guardas instaladas e zero substituições de objetos da plataforma**. Cron desligado e egress bloqueado.

| Verificação | Resultado observado |
| --- | --- |
| G1 / fixtures | 1547/1547; 8/8 |
| Idempotência | 307 operações × 2; 566 DDL, 44 verificações Storage e 4 verificações ACL geridas |
| ACL adicionais de aplicação | 2 compensações aprovadas × 2 |
| Sessões de SQL da aplicação | 2096 |
| Checkpoints de catálogo / cidades | 114/114; 47/47 |
| Medições geridas, incluindo terminal em falha | **2153; todos os contadores a 0** |
| Prova separada com guardas, mesmo SQL efetivo por hash | **2151 checks + 4 dos pré-requisitos; 0 tentativas** |
| Triggers na prova | 8 funções / 709 chamadas; **0 tentativas** |
| G2 congelado / pré-suplemento | verdes |
| G2 atual | vermelho apenas pela tabela de backup e dependentes; **0 funções bloqueantes** |
| Testes | 45 candidato + 15 geridos + 10 workflow + 10 regras = **80 PASS** |
| Scanner | baseline 1534 ficheiros/0; suplemento 8/0; duas admissões 0286 e duas reconstruções 0292 fechadas |
| Reset executado / workflow de aplicação disparado | **0 / 0** |

`cron.job`, `cron.job_run_details`, `vault.secrets` e as tabelas pg_net existentes foram medidos antes da escrita, a cada unidade/checkpoint e no terminal. SELECT, visibilidade e RLS foram conferidos; `row_security=off` impede aceitar um zero oculto por RLS. Ausência de tabelas pg_net é provada por catálogo. Nenhum contador positivo ou falha de visibilidade foi observado. A prova renovada, SHA-256 `551e9dacf0a2b5c08ee8b04708816057209344ed3f6880e92c7db0874fc0318b`, é ligada ao mesmo manifesto e aos oito fixtures. O caminho terminal correu mesmo com G2 bloqueado; não houve retoma nem reset automático. Não existia credencial de mp-homolog a revogar no ensaio local.

O scanner recursivo do artefacto analisou 292 ficheiros de texto. Há 29790 matches reconstruídos individualmente como chaves técnicas N1 de constraint triggers e um endereço sintético `example.invalid` num teste negativo: o verificador rejeita esse input, sem executor de base de dados. **0 ocorrências sem explicação**, sem nova admissão SQL. O log partilhável conserva a prova por hash do original e a redação técnica documentada.

**Inventário completo `platform_storage_feature`:** todos os membros abaixo têm schema `storage`, owner `supabase_storage_admin`, zero referências de aplicação ao objeto e provas de grep/hashes preservadas. Os homónimos `archived_at` em tabelas `public` mantêm a classificação já revista. Seguimento 0291–0292 também com zero referências. São 21 definições e uma ausência R6; versões Storage local 56 / Live 73, com as definições exigidas iguais. Qualquer outro owner, referência de aplicação, GRANT/REVOKE em alvo gerido ou objeto noutro schema gerido continua a parar.

| Membro | Categoria/estado | SHA-256 Live ou prova de ausência |
| --- | --- | --- |
| `storage.buckets.versioning_status` | columns | `2b9723656417085ca969c7764af20ece86a1bdfc5f405d84a4c70f79f4c393e2` |
| `storage.objects.archived_at` | columns | `361a22f45f69166707968ce807177e9432bb9a31bb38465e252e62a034257cff` |
| `storage.objects.is_delete_marker` | columns | `ad0e32768e9704c6800b08b4d07a4ee845dbf89e3acbf594614cf7c3a5e81a28` |
| `storage.objects.is_versioned` | columns | `ad0e32768e9704c6800b08b4d07a4ee845dbf89e3acbf594614cf7c3a5e81a28` |
| `storage.buckets.lifecycle_configuration` | columns | `b15a33ea37e7d7fdab1d3af0afdd3fb5f500a38aed60e12cf08f1f07ac947e24` |
| `storage.buckets.lifecycle_configuration_generation` | columns | `b5f524320a821e314dd9f72cf0594974438dd2b9758c5ba83e123869f090d341` |
| `storage.protect_bucket_control_columns()` | functions | `dac4257ed931d18bac0cbbc3135d0c75a36aae55309059d2913ed5e6792fa8de` |
| `storage.enforce_bucket_lifecycle_service_role()` | functions | `1cb7aecc95a27f8600fc8e7aab11f6a40b9b46a5cb86e02438f3af9642a0d2c4` |
| `storage.buckets.buckets_versioning_status_check` | constraints | `2565df75fa6c2fbd631c78fe568e46130f3f69b8cb1a8009e93ec7501b0b664f` |
| `storage.buckets.buckets_versioning_standard_only_check` | constraints | `3be3d68491c8fd47fc9878f848c84bfd8748f92c3709925a9142b88c08767bd0` |
| `storage.buckets.buckets_versioning_dark_check` | constraints | `12e975b3c36fa0a71188e90e4668e1e3264353f5f0b6b4b31b8be40456868de2` |
| `storage.buckets.buckets_lifecycle_configuration_shape_check` | constraints | `278af6fba5a20af3ff2715a7fa9ca1173ec911d27589f72951a6acef946acb1f` |
| `storage.buckets.buckets_lifecycle_configuration_pair_check` | constraints | `4ea243092f713e71fda46b95b119d274261ae90b7520952db0a0d2af8dca8acf` |
| `storage.buckets.buckets_lifecycle_configuration_standard_only_check` | constraints | `a4f6b42bb47557f71b03b4b34a9bf3adff6c10611077c58127edc3d21cbcc14b` |
| `storage.objects_bucket_id_name_version_key` | indexes | `df31434dd56befcd0e6ad218fc812b758c7d8376bc463ac8df92d403592eaa4d` |
| `storage.idx_objects_current_version` | indexes | `437f49b32411e31b6fc9e64a4c0cbd27d62d607889d5645c216d553d6455b027` |
| `storage.idx_objects_delete_markers` | indexes | `2826a5f13f6af652d885c3d5c3535b8010dda167a5a2163edd23e5130a4c511c` |
| `storage.idx_objects_null_version` | indexes | `b6663ffa89a44f12f8e8250d3e9f26b26bcc20dadc0995d8ba60cd494e402981` |
| `storage.buckets.protect_bucket_control_insert` | triggers | `9c4f45c4c979edd35a555fbc3f8fff288f6e51798a873c5979609f81357eff48` |
| `storage.buckets.protect_bucket_control_update` | triggers | `fff25903becd8ef98f74225ea9a56c4b05b44eee251bd4dccb884bbb97ce245d` |
| `storage.buckets.protect_bucket_control_update_role` | triggers | `2fcecce16bd2112f9f7a1abe081d62c44e51bc04f948f8e7a2dee96e10be572f` |
| `storage.bucketid_objname` | ausência R6 | `52b7307f987a6c3ff7f0799e0bc99c3e218a6e8462255ef17c187b9fd1ff4f02` |

Para `storage.bucketid_objname`, o hash é da ausência em Live, não de uma definição inexistente. R6/6445145238 permanece; a aplicação não remove o índice nem recria membros Storage.

## 4. G2 atual: único desvio, ainda não coberto

Captura de catálogo **28/10/2026 13:58:23–14:02:01 Fortaleza**, integral nas 25 categorias e com ledgers completos. Nova reconferência em **28/10/2026 15:27:38 Fortaleza**: fingerprints e ledgers **iguais**, exclusivamente SELECT de catálogo. Não se leram registos de aplicação. Captura SHA-256 `e48f217afb3c72b0d3c713f811c271948f91e24270d5e7c7d009cc6c08554110`.

**15 objetos / 6 categorias bloqueantes**, todos `only_live` e ligados a `public.bkp_359_p6_prova_reconstruida`:

| Categoria | Objetos |
| --- | --- |
| `acl` | 3 |
| `columns` | 7 |
| `rls` | 1 |
| `tables` | 1 |
| `toast_parents` | 1 |
| `types` | 2 |

A função `public.coala_send_eb_open_alert(pg_catalog.int4,pg_catalog.bool,pg_catalog._text)` coincide após a reconstrução autorizada; não resta o bloqueio funcional da 0292. Políticas Storage iguais (152); R8 não bloqueante 1; N1–N9 inalteradas.

A tabela tem owner `postgres`; não é um membro de plataforma. A frente Coala documenta-a como backup retido do backfill #359/D-ERP333 no commit público `c58dee93aace56f6b5a7d8bc61c8d17f7b4c2b8c`. Nenhum novo hash entrou no ledger com ela. **A regra de seguimento 6465391041 cobre migrações com hash igual, não esta criação fora do ledger.** Não a repliquei, removi, normalizei ou ignorei. Os objetos TOAST gerados seguem apenas N2 já existente.

## 5. Workflow, instalação preparada, reset e revogação

O workflow manual mantém só `workflow_dispatch`, branch fixa, permissões mínimas (`contents:read`, `actions:read` para histórico), ações por SHA, checkout sem credenciais persistidas e concorrência sem cancelamento automático. C0 verifica novo Sim/revisão, commit, candidato, entrada, workflow, destino positivo, rejeição de Live, CA e prova, todos por hashes. Recusa reuso após um passo de credencial iniciado. O fluxo offline foi alinhado com a preparação da reconstrução/N3 antes da ligação. **Nunca foi disparado.**

`MP_HOMOLOG_DB_PASSWORD` aparece uma única vez no ambiente do passo C1–C7. O launcher retira-o do ambiente, entrega-o só por `PGPASSWORD` ao psql e não o coloca em argumento, ficheiro, log ou artefacto. TLS `verify-full`; Connect por Session pooler e metadados fixados só no ficheiro privado. Não há input livre de host/DSN/SQL, herança de service files ou PGHOSTADDR. Os testes aceitam os bytes exatos da CA e rejeitam alterações.

**Default branch inalterada.** A nova proposta [7e050274de73326069ce830d1e34e88b5714e4c6](https://github.com/pedrompropicio/mundopropicio-replay/commit/7e050274de73326069ce830d1e34e88b5714e4c6) é um commit sem ref, filho de main `9ed9941e95e7e626c0c5d8be15399fb13e3f2b59`, e acrescenta só as 80 linhas do workflow. [Diff exato](https://github.com/pedrompropicio/mundopropicio-replay/blob/3b00905cbaffe99409959ce7a0b57a938c11191d/docs/352/managed-0292-20261028/default-installation.patch). Nenhum segredo ou release binding criado.

Auditoria repetida: **10 branches, 0 tags; 14 presenças, 9 definições únicas, 1 referência ao segredo, 0 leituras dinâmicas ou `secrets: inherit`**. Workflows legados conservam tags móveis, mas não recebem esse segredo no código auditado. Os blobs têm de ser reconferidos antes da criação futura do segredo; não foram alterados settings ou permissões. Histórico manual reconferido: zero runs.

Reset limitado ao inventário C1, inversão de dependências, sem CASCADE e no máximo uma tentativa; sem reset/retry automático e sem ampliar o âmbito para corrigir G2. **O plano desta falha tem `ready=false`**: o inventário detectou alterações de estado pré-existente e membros geridos/de extensões; as travas existentes proíbem o reset nesses casos. Foi guardado, não executado, e não é apresentado como recuperação pronta. Revogação obrigatória no terminal, inclusive em falha/timeout/cancelamento: fechar sessões, Pedro rodar a password e remover o segredo, verificar ausência de sessões e impedir outra tentativa. O fim do job não substitui prova de revogação.

## 6. Parecer e próximo passo

**BLOQUEADO para aplicação.** A CA e a 0292 estão fechadas; ao revisor 0 devolvo apenas o tratamento da tabela `public.bkp_359_p6_prova_reconstruida` e dependentes. É preciso decidir se há uma regra já aprovada aplicável ou propor um tratamento fechado por identidade/hash e obter novo Sim. Até essa decisão, não mudo regras, SQL, destino, privilégios ou âmbito.

Não há texto de Sim de aplicação pronto a usar enquanto G2 atual estiver vermelho. Depois de resolvido este único desvio: repetir a comparação/ensaio conforme o tratamento aprovado, emitir novo parecer com hashes finais e texto integral de autorização, revisão final, novo Sim de aplicação, rotação/criação do segredo pelo Pedro, execução manual com C1, aceitação e revogação/fecho. O Sim do candidato antigo não pode ser reutilizado.

**R2 continua aberta. #329 reconfirmada antes dos pushes; documentação com skip ci.** Mantêm-se negados mp-homolog, segredos, escrita em Live, G4/G5, jobs de aplicação, agenda, deploy e Publish. A reserva existente não foi duplicada nem libertada.

Estado documental: a reserva R2 existente permanece aberta. A [proposta restrita de atualização do QUADRO e estado](entrada-gerida-0292-estado-20261028.patch) altera apenas três linhas próprias e a secção da #352; **não foi aplicada aos ficheiros partilhados**. A revisão automática bloqueou anteriormente o envio integral do QUADRO por incluir dados alheios a esta frente; esta entrega publica apenas o parecer e o patch restrito. O parecer na Issue e o dossier privado são o estado atual desta preparação.
