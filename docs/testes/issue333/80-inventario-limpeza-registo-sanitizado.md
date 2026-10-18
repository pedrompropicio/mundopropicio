# #333 — inventário80 e limpeza proposta, NÃO executada

18/10/2026; retoma autorizada20:48UTC. HEAD inicial confirmado `fad61b7846bb5c180e3cf7b8e4527f64e7d982b7`, igual ao comunicado GitHub/Lovable pelo controller. Prioridade: apagar resíduos operacionais após preservar este registo.79/release pausados;1–7done/8PARCIAL/9–18nãoexecutadas. #323/DECISIONS/AGENTS preservados.

## Registo sanitizado de validação, para repo/Issue antes de qualquer limpeza

- Prova17,17/10~19:55UTC: Auth/Storage fictícios,31casosPASS; três contas bloqueadas, seis objetos preservados; nenhum lançamento financeiro.
- Prova22,17/10~21:12UTC: PDF técnico94B armazenado/releitura/hash conferidos; sem sessão/documento/receipt/fatura associada. Objeto operacional identificado80.
- Prova23,17/10~21:31UTC: uma conta técnica e uma sessão semeada para leituras/negativas; gates fechados. Limitação histórica da baseline agregada permanece, não corrigida retroativamente.
- Prova28,17/10~23:14UTC: quatro identidades técnicas, isolamento/negativas37casos comportamentaisPASS e uma sessão; nenhuma execução positiva. Identificação exata das quatro contas continua excluída da limpeza até revisão do mapeamento original privado.
- Provas34/36/37/39/43/50,18/10~01:15–03:08UTC: snapshots/recuperação/negativas com gates fechados, seis reservas prepare persistentes; nenhuma fatura/objeto/receipt por essas reservas. PDF39/50 sintético1499B, sem upload. Timeout37 não recebeu causa demonstrada;43 falhou preparação antes do login. Preservar limitações de cada prova, sem transformar negativos em E2E positivo.
- Piloto59,18/10~13:28–13:30UTC: uma fatura fictícia EUR0/IVA0, documento/prévia/resultado/tentativa e dois receipts; download200/1517B/SHA igual certificado na prova59; UI observada, mas parHTTP/browser.json e check autenticado pós-revogação não certificados. Conta banida; permissões revogadas.
- Complemento63/65,18/10~17:05–17:43UTC: identidade e duas permissões, nenhuma sessão/lote/fatura; finalização e revogação sem reutilização da conta.
- Manual76,18/10~20:05–20:22UTC: TESTE MANUAL OPERACIONAL APROVADO por Pedro/controller: upload→prévia→autorização→execução→conferência; uma fatura EUR0/IVA0 e um resultado. Comparação automática financeira/configuração reportada pelo controller preservada na78. Duas permissões renovadas e depois revogadas, não retry. Conta/histórico/sessões de Pedro preservados. Não alegar check iniciado depois da revogação, HTTP simultâneo, ou download separado de bytes finais.

PDF piloto1517B SHA256 `8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f`. Este hash/provas permanecem; não é preciso conservar faturas/contas/objetos operacionais para sempre. Nenhuma senha/token/email ou nome real, SQL bruto ou UUID de pessoa foi publicado aqui. Texto pronto para Issue; a Issue remota NÃO foi editada pelo agente.

## Inventário concreto, leituras oficiais80

- Auth18candidatos, todos banidos:14com origem corroborada para revisão;4da classe28 excluídos por falta do mapeamento original, não só por emailLIKE.
- Profiles18 e roles29:14profiles/21roles de origem elegível;4profiles/8roles excluídos. Identities18, todas email;3sessõesAuth e3refresh rows ainda presentes/não revogados, exclusivamente prova17. Outros dependentes Auth consultados0. Não se leu token, senha, identity_data, IP/UA ou credenciais.
- Lotes4=3das contas técnicas +1manual76; origem elegível3, excluído1(classe28).
- Documentos2/prévias2/resultados2/faturas2: piloto59 E manual76, não apenas a última. Cada cadeia conferida por JOIN exato sessão→documento→prévia→resultado→fatura, destino/hash/empresa/owner/ref/1517B/EUR0/IVA0/statusnew; correspondências2.
- O pagador de manual76 é a conta sintética da prova50, NÃO o owner real: ligação confirmada em `paid_by_partner_id`; retirar conta50 antes da fatura quebraria FK. Piloto59 paga-se pela própria conta sintética. Autorizador e pagador não são sinónimos. Retificação pontual da hipótese do investigador local: só a leitura oficial demonstrou este vínculo.
- Tentativas8=6prepare negativas +2completed positivas; prior_attempt_idNULL nas8. Auditorias próprias2preservadas; receipts4; mensagens0. Allowlist6, todasdisabled, expirações/nota/chaves compostas exatas privadas. Manual76 tem dois expires com microssegundos diferentes, não normalizados artificialmente.
- Storage11objetos:6prova17 +1PDF técnico22 +2staging e2finais de59/76. UUID/bucket/path/tamanho exatos privados. Os seis paths das reservasprepare NÃO têm objeto. Não executado download novo: hashes históricos e receipts não provam bytes lidos80.
- `system_audit_log`:38linhas relacionadas conhecidas(33roles/ações+5profiles), todaspreservadas; MD5 IDs `9b243ae20a72db2ea9f2978d2dc11414`. Não apagar automaticamente auditoria obrigatória; as2auditorias de tentativas também ficam fora do DELETE proposto.

Contagem de unidades de linha/objeto, sem contar evidência/auditoria como lixo:109com origem elegível,21excluídas(4users+4profiles+8roles+4identities+1lote). Das109,7formam a parcela mutável para revisão(6permissõesdisabled+1lote vazio23);102não executáveis hoje por canais/guardas/dependências, incluindo2tentativascompleted deliberadamente retidas pela FK da auditoria.40linhas de auditoria conhecidas preservadas separadamente. Não confundir109unidades com109contas.

## Cobertura de dependências e limites

Leitura de1396colunasUUID em346tabelas BASE public/crm e16colunas text de identidade: matches somente grafo técnico descrito; nenhum ator sintético em relações financeiras/outros módulos. Tentativas usam principaltext, por isso foram incluídas. Pesquisa dos paths exatos nas colunas documentais só encontrou documentos/receipts/faturas esperados. Não é auditoria universal de todo JSON/conteúdo; vistas inicialmente recusaram função privada, depois scan das tabelasBASE foi concluído sem alterar ACL. Origem ambígua fica excluída, não interrompe o restante inventário.

Catálogo FK122definições; MD5 `b580deb4860bd7824b428a4f528ecdf0`. PaisAuth/profiles possuem CASCADE/SETNULL em vários módulos; scan0fora do grafo NÃO autoriza CASCADEamplo. Profiles/roles devem ser tratados porIDs, preservando trigger de auditoria; Auth só pelo seu API gerido após checar zero dependências externas. Nunca SQL DELETE auth/storage, orphanpurge ou disable global de triggers.

**Bloqueio real SQL:** `data_entry_immutable` recusa DELETE de documentos/prévias/resultados/receipts/auditoria; `standalone_attempt_guard_333` recusa DELETE de tentativas. Ambas as faturas statusnew seriam apagáveis pelo guard da fatura, mas FKresults impede fazê-lo antes da remoção dos resultados imutáveis. Nenhuma exceção de manutenção existe. Não foi criada/alterada/desligada nenhuma guarda. Attemptscompleted têm FK de auditpreservado, portanto permanecem até decisão específica de retenção/mecanismo; não apagar audit para contornar.

**Bloqueio Auth/Storage:** ferramentas atuais não oferecem DELETE gerido de utilizador nem remove de pathsStorage. API contratual exato está no pacote privado; histórico de AuthAdmin prova existência passada, não canal permitido atual. Não pedir chave privada, não inventar endpoint/helper nem reabrir loop suporte. Essa classe bloqueia execução, não inventário.

## Pacote privado revisável

`claude-outputs/issue333-cleanup80/` — gitignored, ficheiros0600; manifesto45KB, abaixo de64KiB. Não contém senhas/tokens/URLs assinados. É transcrição técnica tipada dos campos mínimos do leitor oficial, NÃO envelope bruto nem prova de entrega upstream. SHA local garante integridade do ficheiro; controller deve reler os SELECTs e comparar antes de executar.

SHA256 do manifesto privado: `a2fa975c0ab6ee1cf8f3fd221692f558304a7ec98dbe0d003c9b84b06b1d851f`. MD5 do conjunto dos11UUIDsStorage: `04d2a78a264674806e8125531bbfb1d2`; só integridade deIDs, não download debytes80.

- `manifest.private.json`: IDs/proveniência/exclusões/vínculos/efeitos/counts e hashes.
- `SHA256SUMS`: hashes dos ficheiros privados.
- `01-dry-run.SELECT-only.sql` e `05-postconditions.SELECT-only.sql`: apenas SELECTs independentes; sem DO/temp/locks/configuração/mutações. Instruções para leitor oficial, não CLI/psql.
- `03-mutable-slice.INERTE.sql`:6permissões+1lote23, locks/chaves/nota/expiry/origem/rowcount; fence incondicional ANTES das escritas e ROLLBACK. Nunca executar como “dry-runSELECT”.
- `02-full-graph.BLOCKED.INERTE.sql`: ordem exata porIDs/hash/refs/empresa/locks/rowcounts, aborta antes de tudo; bloqueado pela imutabilidade e auditoria, sem bypass/DDL.
- `06-roles-profiles.BLOCKED.INERTE.sql`:21roles/14profiles, IDs/papéis/empresa/origem e dependências, aborta antes de tudo; triggeruser_roles permaneceativo;4contasambíguas não entram. Releitura abrangente de dependências necessária, não pressupor só FKs do script.
- `04-auth-storage.requests.INERTE.json`: contratos NÃO configurados/executados: Auth `DELETE /auth/v1/admin/users/{id}` com `should_soft_delete:false`/SDKadmin.deleteUser(id,false); Storage `DELETE /storage/v1/object/{bucket}` com `prefixes` exatos/SDKremove(paths). Sem credenciais/host; falta executor gerido permitido. Não apagar só metadadosStorage fingindo remover bytes.

## Ordem/rollback/decisões para o controller

1. Rever este registo e manifesto; confirmar integridade e comparar cada SELECT01porID/proveniência/count/hash; preservar exclusões e baselines.
2. Autorizar separadamente, se desejado, SOMENTE a parcela mutável7. Fence/ROLLBACK só mudam no artefacto futuro revisto. Mantém fechadas as operações; não concede acesso.
3. Resolver caminho restrito de manutenção dos registos imutáveis/retidos. Não aplicar02: é proposta bloqueada. Preservar auditorias; não redefinir guardas globais nem presumir dispensa.
4. Depois do caminho revisto: resultados→prévias→documentos/receipts→duasfaturas→lotes elegíveis;6prepare só com exceção expressa. Completed/audits permanecem conforme retenção. Conta50 só depois de manual76;conta59 só depois de piloto59.
5. BytesStorage11somente após checkpoint SQL coerente e cópia privada específica/hash se reversibilidade for exigida; nunca apagar bruto antes de resolver bloqueio SQL. Auth/Storage precisam de executor permitido existente; sem criar recurso nesta80.
6. Roles/profiles elegíveis porIDs e zero dependências externas; Authdelete depois, sem cascade aplicativo amplo. ContaPedro,4candidatos excluídos/história/#323 intactos. Conferir SELECT05porfase; não exigir0tentativascompleted quandoauditoria permanece.

SQL rollback antes do commit; após commit depende de backup privado específico que NÃO foi criado80. HarddeleteAuth não restaura senha/sessõesoriginais; não prometer reversibilidade. Storage exige bytes copiados antes se se quer rollback. SQL/Auth/Storage não partilham transação: checkpointporclasse, falha parcial→parar/conferir, nunca retrycego. Não há execução agendada/depois desta tarefa.

## Baseline financeira80

Hashes de conteúdo integrais computados NO servidor, sem trazer linhasreais:
- transactions1966: `642943741f0f66da4218b4b551470a9b`
- event_forecasts2300: `9cccc21e6e932e1096b6f204a058f026`
- financial_accounts27: `2c12a0c8a521fe1ff4da1f2077babfc1`
- transaction_payments1417: `829ade474fd3d249f6900a9229230353`
- reimbursement_notes44: `e40349ec169b75224dca0710ee898dfb`
- reimbursement_note_items180: `6490b4bf0dc630da6f25e5f635ed4316`
- payment_lists80: `97fc33ff047f2b4a7980da01253ea07d`

98faturas históricas fora dos2IDs de teste. Gatescore/attempt0, settings0linhas. Baseline80 é referência nova, NÃO nova comparação contra envelope76 do controller.

## Fecho80

Inventário e plano entregues, execução NÃO realizada: zeroDELETE/ban/logout/Cloudwrite/DDL/storagewrite/login/piloto/testes/produto/deploy/Publish. Validação somente integridade local/SELECT-only e JOINs oficiais; nenhuma bateria nova. Questões específicas em `docs/questoes-issue333-limpeza80.md`; avanço79/releasepausado. Reserva333libertada após entrega;#323preservada. Próximo objetivo continua limpar resíduos com registo, não fazer outros testes.