# #352 — entrada gerida C1–C7: ensaio verde; prontidão BLOQUEADA

**NÃO PRONTO para aplicação.** A entrada gerida passou G1, idempotência e G2 para o catálogo com 0285–0291. Na reconferência, Live já incluía a **0292**, com literais novos e uma diferença bloqueante em G2. A **CA pública do painel** também está pendente. A reserva **R2 mantém-se**; nenhuma ligação ao mp-homolog, utilização da sua credencial, criação de segredo ou escrita em Live foi feita.

Preparação sob 6457767848 e [revisão 6470659655](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6470659655), mantendo 6458541603, 6459990752, 6465391041 e 6466343281. O Sim de aplicação 6469468379 referia o candidato anterior e **não autoriza este novo hash**. Entrego ao revisor 0 a entrada completa, a prova e os dois bloqueios abaixo.

## 1. Candidato, commits e integridade

- Commit ensaiado: [`4269696615adfcf1c445d8bc0b7816ce8fb27d7c`](https://github.com/pedrompropicio/mundopropicio-replay/commit/4269696615adfcf1c445d8bc0b7816ce8fb27d7c).
- Commit final do dossier: [`73e5476a6b7c59dc24fb014307fc68ea57e0e4c0`](https://github.com/pedrompropicio/mundopropicio-replay/commit/73e5476a6b7c59dc24fb014307fc68ea57e0e4c0), descendente direto, **só 22 ficheiros de documentação/prova**. As 50 fontes do candidato são byte-idênticas às ensaiadas.
- ZIP do candidato: SHA-256 **`48f31d7541e0cf0b13f96a7f243503aa3932cde127d8474d8c2aa1054d91fcdb`**, 2 103 726 bytes; 50 fontes, 2 084 933 bytes. Manifesto SHA-256 `755c2f5c196cf085c7b1511f179ddbc9ad6d0889a9afab66d0e1e4bc6bedee1a`.
- `managed_apply.py`: SHA-256 **`de30f2b8ef71e5cab70807f1896e1053d05c9248b8c4713b31d7857f9143416b`**.
- Workflow manual: SHA-256 **`cfe7d44545f6afd31d3ed9565b9053ec857cd32c5993d98549407cd1c471e20b`**.
- Base G3 preservada: `c316fc12b8b9b9ef890bb2975c9e6f32b1a312a933956c9fe704f07f3db0d715`.
- [Dossier privado](https://github.com/pedrompropicio/mundopropicio-replay/tree/73e5476a6b7c59dc24fb014307fc68ea57e0e4c0/docs/352/managed-entrypoint-20261028); [run 20 / 40716332118](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40716332118), success em **28/10/2026 15:50:04 UTC**. Artefacto CI integral 12829679131, 12 651 190 bytes, SHA-256 `1b2074d16c4cc9cb3b85635ccaba7211e0618f1a55e0fd8c858986a1539737b9`.

O arquivo duradouro de revisão tem SHA-256 `742104d4b70d898f0a6c634c812b837eb2142f09f04762960cdc5abfa35c4b15`; conserva C1, catálogo final, manifestos, contadores, fixtures, triggers e resultados. As cópias reprodutíveis excluídas estão enumeradas em `archive-manifest.json`. A prova renovada com guardas está preservada separadamente, SHA-256 `82eb55e29bbbee408625cb4a95ee6bf2a20757764638ba7baac3fd07722f9e88`.

Destino: mp-homolog existente. **Referência técnica e metadados Connect apenas em `target.private.json` privado**. O workflow lê esse ficheiro fechado por hash; nenhuma identidade técnica é publicada aqui.

## 2. Mesmo SQL, migrações incluídas e seguimento bloqueado

`managed_apply.run()` é a mesma entrada usada pelo ensaio e pelo launcher futuro. Mantém manifesto, SQL efetivo, ordem, overlays e regras. Não chama bootstrap, não usa supabase_admin, não instala guardas nem substitui objetos da plataforma. Os dois SQLs de aplicação que o executor antigo fazia antes de G1 — extensão pgmq 1.5.1 e tabelas de ledger — mantêm os bytes das constantes públicas fixadas; passam a executar depois de C1, como postgres sem superutilizador. A prova renovada cobre também essas duas primeiras execuções. Não há nova concessão de privilégios.

O [inventário integral, com ordem e hashes de todas as fontes incluídas](https://github.com/pedrompropicio/mundopropicio-replay/blob/73e5476a6b7c59dc24fb014307fc68ea57e0e4c0/docs/352/managed-entrypoint-20261028/all-included-migrations.json) permanece no privado: histórico, baseline, pós-baseline 0282–0284, suplemento e compensações ACL já aprovadas. As duas admissões da 0286 continuam fechadas por posição/hash, sem alargar o scanner. A 0291 entrou pela regra de seguimento 6465391041: bytes iguais ao ledger, scanner zero e zero referências aos membros da classe.

| Migração do suplemento | ID no ledger Live | SHA-256 integral |
| --- | --- | --- |
| `0285_0285_p6b_a_pagar_caches.sql` | 287 | `7ac3022659a738f39be5218d1f197e3d57828cdb1e2d1ab5529a9fe838505de7` |
| `0286_reembolso_pagamento_fora_resultado.sql` | 288 | `232e449253bddb32a9d8a6bca3e8e7a2328fda1b93490b3e393115da9b9fdff8` |
| `0287_reembolso_invariante_corpo_exato_0286.sql` | 289 | `4bea9f3b0e3e5a3bf3bca899834124e4265a41c04637f60a2fbf1f07a119e397` |
| `0288_reembolso_invariante_corpo_exato_0286_b.sql` | 290 | `51eeb696a791d919c8f748dd6e13f08bc956481be2006fd1eb50cd732370c19f` |
| `0289_0289_p5c_cenario_receita_prevista.sql` | 291 | `b489f043fa7796769f4530fd84e1dc10ef964376b9764c8f1774f7ebe35f317b` |
| `0290_p5c_rpc_exact_manual_bytes.sql` | 292 | `e6058e8aae7d38b10f66f4e99731564be7026c7d187ec68b540aebf93f6ba400` |
| `0291_issue359_ponto4_descadastro_independente.sql` | 293 | `aaf752e4e5e50a6e9aa350eb8002d473aab3a1a5f94885601d810ea3a421285b` |

**0292 excluída do candidato e nunca executada.** `0292_issue359_eb_open_authorisations_link.sql`, ledger 294, SHA-256 `6c977a3e6f2974b2affbc1f629cc62bf88fcdae201027c1facda95218c88d108`, 8 179 bytes. O hash é igual ao ledger, mas o scanner inalterado encontrou email na linha 12 (hash do literal `2ad81d28d902f115abae1207d35925f9489fb0fb90698f21f0c75d0717cd46a3`) e endpoint de produção na linha 93 (hash `20d5ab8514aa9e9c84068e774c6dd6b359c963d9271c9d88bc1732018db4d7a8`). Há cinco ocorrências HTTPS no ficheiro. Os valores não são reproduzidos neste parecer. **Pelo próprio 6465391041, qualquer literal novo volta ao revisor e exige novo Sim.** Não os admiti, removi ou substituí.

## 3. C1–C7, ensaio e inventário completo da classe

C1 confere identidade/TLS, postgres sem superutilizador nem membership em supabase_admin, vazio da aplicação e inventário de schemas/objetos/ACL/papéis/dependências, extensões/versões e os 22 membros fornecidos pela plataforma. A lista completa C1 inclui as 25 categorias de catálogo. O ensaio usa perfil gerido descartável; a simulação da plataforma é instalada apenas administrativamente antes de C1. Cron desligado, egress bloqueado e **zero guardas administrativas na fase gerida**, conferidas também no inventário C1.

`cron.job`, `cron.job_run_details` e `vault.secrets` são obrigatórios e têm SELECT/visibilidade/RLS conferidos. Filas e respostas pg_net são contadas quando existem, ou a ausência é provada por catálogo. `row_security=off` impede aceitar zero oculto por RLS. Há medição antes da primeira escrita, em cada unidade/checkpoint e no terminal, mesmo em falha; qualquer valor positivo ou falha de visibilidade pára. A prova de efeitos combina essas medições com o ensaio com guardas, ligado por hash ao mesmo manifesto/SQL efetivo e aos oito fixtures.

| Verificação | Resultado para 0285–0291 |
| --- | --- |
| G1 / fixtures | 1 547/1 547; 8/8 |
| Idempotência | 307 operações × 2: 566 execuções DDL, 44 verificações Storage, 4 verificações ACL geridas |
| ACL adicionais da aplicação | 2 compensações já aprovadas × 2 |
| Sessões de SQL da aplicação | 2 095 |
| Checkpoints de catálogo / cidades | 114/114; 47/47 |
| Contagens na entrada gerida | **2 153 medições, incluindo terminal; todas 0** |
| Prova com guardas, separada | 2 150 checks + 4 dos dois pré-requisitos, **0 tentativas**; prova anterior de 2 149 checks preservada |
| Triggers na prova | 8 funções / 709 chamadas, **0 tentativas** |
| Operações administrativas / guardas instaladas pela entrada | **0 / 0** |
| G2 congelado, pré-suplemento e captura 293 | verdes, N1–N9 inalteradas; 152 políticas Storage iguais; R8 não bloqueante 1 |
| Testes | 41 do candidato + 15 geridos + 8 workflow + 10 regras = **74 PASS** |
| Scanner das fontes | baseline 1 534 ficheiros / 0; suplemento 7 ficheiros / 0; apenas duas admissões fechadas da 0286 |
| Reset executado / workflow de aplicação disparado | **0 / 0** |

O scanner do artefacto integral analisou 287 ficheiros de texto, incluindo arquivos internos. Os 26 480 matches lexicais são chaves técnicas geradas de constraint triggers N1, com prova individual; zero matches sem explicação e nenhuma nova admissão SQL. Uma linha técnica do log de dependências foi redigida apenas na cópia partilhável; o hash do log original ficou registado. Não se alterou a regra nem a allowlist.

**Inventário `platform_storage_feature`:** todos os 22 membros têm schema `storage`, owner nativo `supabase_storage_admin` e **zero referências de aplicação ao objeto**, com hashes/grep preservados nas fontes do candidato. Os 25 matches homónimos de `archived_at` são de `public.bp_versions`/`public.profiles`, com instruções identificadas, não referências a Storage. O seguimento até 0291 também foi conferido. São 21 definições fornecidas pela plataforma e a ausência R6 já aprovada do índice antigo. Storage local versão 56; Live versão 73; as definições requeridas coincidem. A entrada apenas verifica; outros owners, referências de aplicação, GRANT/REVOKE em alvos geridos ou objetos noutros schemas geridos continuam a parar.

| Membro | Categoria/estado | SHA-256 da definição Live, ou prova de ausência R6 |
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

Para `storage.bucketid_objname`, o hash acima é da prova de ausência em Live, não de uma definição inexistente. Definição nativa antiga SHA-256 `97af4e351472982d50cf327b7f2f8ba3919318ccf2bb9e9b0726cbcff38d76fc`; fonte baseline `c040a39f15460fbb13eade409048f7cae03762be70d4dac06e0fc5e70821289b`. Mantém-se R6/6445145238; a aplicação não remove esse índice nem recria membros Storage.

## 4. Aceitação contra Live atual: G2 vermelho por um objeto

Reconferência **28/10/2026 15:50:47.281–15:59:27.102 UTC**, exclusivamente SELECT de catálogo. As 25 fingerprints e os ledgers completos coincidem nos dois extremos: **294 hashes Drizzle / 711 versões Supabase**. Só a categoria funções mudou desde a captura 293; a linha alterada foi lida e as restantes só foram reutilizadas depois de provar igualdade das fingerprints. Captura privada SHA-256 `ec4ee91613eec32044257b2fb6f79eae8ee1ebbfc6347db65521b0d2ea7d1beb`.

**G2 atual: 1 categoria / 1 objeto bloqueante**, `public.coala_send_eb_open_alert(pg_catalog.int4,pg_catalog.bool,pg_catalog._text)`, mais o hash 0292 por cobrir no ledger. Hash normalizado do replay `197beaab148db51da038b5801799278d1d2dafaf2c0b09c325ba2382e3a90beb`; Live `2e8e39f1ce1b113ea55620d6f1f7cd091f33a7e5e542050a22d0994a8b3093ed`.

O diagnóstico usa os mesmos 32 ficheiros Python dos comparadores do CI, byte a byte. Antes de comparar o Live novo, reproduziu exatamente a referência normalizada e o agregado do replay do run verde. Não executou SQL da 0292 e não mudou N1–N9. **O G2 verde para a captura 293 não é apresentado como aceitação do catálogo 294.**

## 5. Workflow, instalação, acesso ao segredo, reset e revogação

O workflow passa a chamar a entrada gerida com o hash fixado. Só `workflow_dispatch`, branch fixa, nenhum input livre, concorrência única sem cancelamento automático. C0, sem password de base de dados, confere commit revisto, novo Sim/revisão, candidato, entrada, workflow, target, CA e prova por hashes. Consulta o histórico para impedir reutilização de uma tentativa com passo de credencial já iniciado. Lista positiva privada do destino, rejeição explícita de Live, TLS `verify-full`, ações por SHA e checkout sem credenciais persistidas. Permissões: `contents:read` e `actions:read`, esta última só para o histórico.

`MP_HOMOLOG_DB_PASSWORD` aparece **uma única vez**, no ambiente do passo de ligação C1–C7. O launcher retira-a do seu ambiente e passa-a ao processo psql só por `PGPASSWORD`, num ambiente mínimo, nunca por argumento/ficheiro/log/artefacto. Não aceita DSN/host/SQL por input nem herda PGHOSTADDR/service files/tokens. Evidência capturada é verificada antes do upload para impedir exposição de password/identidade. O histórico completo `workflow_dispatch` do replay tem **0 runs**.

**Instalação apenas preparada:** [commit de proposta `8dcf0f194c8b12cb2f6ffbdf3300f9bab7196045`](https://github.com/pedrompropicio/mundopropicio-replay/commit/8dcf0f194c8b12cb2f6ffbdf3300f9bab7196045), filho da main privada `9ed9941e95e7e626c0c5d8be15399fb13e3f2b59`, acrescenta apenas o workflow de 79 linhas. [Diff exato](https://github.com/pedrompropicio/mundopropicio-replay/blob/73e5476a6b7c59dc24fb014307fc68ea57e0e4c0/docs/352/managed-entrypoint-20261028/default-installation.patch). **A main não foi movida**; nenhum segredo ou release binding foi criado. A proposta atual é para revisão, não para instalação enquanto os bloqueios estiverem abertos.

Auditoria de todas as **10 branches e 0 tags**: 14 presenças, 9 definições únicas de workflows, 1 referência ao segredo de mp-homolog, 0 expansões dinâmicas ou `secrets: inherit`. Workflows legados conservam ações com tags móveis, mas o código auditado não lhes entrega este segredo. O conector não disponibilizou o registo Actions de workflows; o inventário foi obtido por árvores Git de todas as refs. Quem puder escrever workflows pode mudar esse acesso: antes de Pedro criar o segredo, é obrigatório reconferir os blobs auditados e o workflow revisto. Não foram alterados settings ou permissões do repositório.

**CA bloqueante:** os metadados Connect fornecidos estão fixados só no ficheiro privado; falta o certificado CA público descarregado de Database Settings › SSL Configuration. Não há sessão de painel autenticada disponível. O hash da CA fica nulo e C0 pára **antes do passo secreto**; não se presumiu uma CA. É necessário entregar o certificado público ao executor por canal privado para conferir SHA-256 e fixar bytes/hash. **Nunca enviar password pelo chat.**

**Reset:** não há reset/retry automático. Em falha, pára no primeiro SQLSTATE e deriva um plano exclusivamente do inventário C1 e posterior. Alteração de objeto/ACL/dado pré-existente, alvo gerido, owner diferente, dependência externa ou ciclo bloqueia. Execução do plano exige hash e inventário correntes iguais; ordem inversa de dependências, transação, RESTRICT, sem CASCADE, no máximo uma tentativa. A reserva desse uso é feita antes da primeira escrita e também é consumida em falha. A causa tem de estar compreendida e coberta; não há descoberta automática de migrations para reparar.

**Revogação:** o caminho terminal aguarda processos, limpa ambiente e regista a obrigação mesmo em falha. A rotação da password e remoção do segredo são do Pedro, também em timeout/cancelamento; o fim do job não é prova de revogação. A reserva R2 só fecha depois dessa verificação. No ensaio local não existiu credencial de mp-homolog a revogar.

## 6. Decisão e próximo Sim

**Parecer BLOQUEADO; não proponho ainda um Sim de aplicação para este candidato.** Ao revisor 0 ficam apenas os dois pontos que as regras atuais não fecham:

1. **0292:** decidir o tratamento dos novos literais identificados por posição/hash; a inclusão exige parecer e novo Sim, conforme 6465391041. Até lá, excluída. Depois da decisão, a preparação deve repetir-se e G2 tem de ficar verde contra o catálogo atual.
2. **CA:** entregar o certificado público do painel para conferência/fixação no privado. Não é uma password; a credencial continua fora do chat e só será criada mais tarde pelo Pedro.

Depois de ambos fechados: concluir a integridade e novo parecer com hashes finais, novo Sim de aplicação, revisão final do workflow, rotação/criação do segredo pelo Pedro, execução manual com C1 antes da escrita, aceitação e revogação/fecho. O texto de autorização da secção 6 anterior **não pode ser reutilizado para este hash**. A proposta de instalação na default branch também aguarda essa sequência.

**R2 mantida; #329 confirmada antes dos pushes e commits documentais com skip ci.** Nenhuma ligação ao mp-homolog, segredo criado, escrita Live, G4/G5, job de aplicação, agenda, deploy ou Publish. Todos os ensaios executados foram nas bases descartáveis do replay privado.
