# #333 — Consolidação finita fases6/7 e candidato piloto8

UTC 2026-10-18T03:25:07.072679+00:00. Base fb065e10fe2872ccdb163e0f968bde2c613a0ac9; ancestralidade exit0. Executor único; nenhum subagente, conta, login, request negativo, upload ou escrita Cloud. SELECT fontes/config apenas. CI39092652776 observada completed/success por API nesta entrega.

## Critérios fase6 → prova exata → estado
O corpo atual da Issue333 enumera aceitação e sequência1–4, NÃO um checklist numerado6–8. Comentários6244572107/6244860858 identificam timeout/fixtureHTTP como pendênciasfase6. Matriz abaixo consolida cobertura técnica solicitada, não inventa aceitação global dos adapters ainda indisponíveis.

- Auth/JWT e empresa/papel canónicos, anon/forjados recusados →28-testes-autenticados-isolamento-live.md matriz37;37-negativos-tecnicos-diagnostico-timeout.md → PASS Live.
- Sessão CORE própria vs peer/tenant/editor →28 matrizCORE → PASS Live RPC; endpoint preenchido no ensaio32 local, não alegado Cloud.
- Listagem owner populada e operação →37 endpoint/RPC → PASS Live; paginação>50 e resposta tardia →30/32 → PASS local.
- Tabelas técnicas/settings/reader interno inacessíveis ao browser →28/37; ACL real0193 →43/50 → PASS Live.
- Storage privado: objeto existente staging oculto + upload/list/read/signedURL negativas →28/37 → PASS Live staging. Teste standalone inexistente37 não prova isolamento de objeto existente: comprovação positiva/readback do novo objeto é fase8, não condição nova de6.
- Gates prepare/authorize/begin/commit/confirm fechados →37 matrizRPC42501 → PASS Live; execute endpoint com bytes válidos →39 (13 checks) → PASS Live409,zero upload/receipt/fatura/audit.
- Hash divergente check sem timeout atual →50 RPC403/42501 em0.148s e endpoint409pendente em0.858s → PASS Live. INCONCLUSIVOS antigos37 superados para comportamento atual, NÃO causa histórica demonstrada.
- Conferência read-only/reserva imutável/baselines sem efeitos →39/43/50 → PASS Live; result_check concluído/bytes persistidos/campos completos →30/32 → PASS local, positivoCloud fase8.
- Retoma/unknown/perda de respostas/troca Auth/empresa/duplo clique/locks/rollback →30/32 manifest+React Chromium → PASS local; fronteiras Auth/StorageHTTP simuladas declaradas. Não repetir PASS.
- Finalização conta única/logout204/ban200/sessions0 →50 e SELECT posterior → PASS Live.
- Fonte/ACL/owner/config/RLS/policies e16baselines preservados →43/50 → PASS Live.
- CI documental50 →39092652776 completed SUCCESS → PASS.

**Recomendação ao controlador: fase6 técnica gates-fechados pode fechar pelos critérios acima. Nenhum critério técnico negativo remanescente identificado.** Fecho da Issue/produto exige escopos posteriores; E2Epositivo pertence8. Causa antiga40001 permanece conhecimento limitado, não bloqueio adicional de6.

## Fase7 — bloqueios atuais para este piloto, fonte real
1. Não existe allowlistowner+empresa+operação (SELECT to_regclass NULL). Gates0190 data_entry_preparation_gate/commit e0191 standalone_attempt_gate_333 usam settings globais. Abrir flags seria inseguro para piloto: BLOQUEIO.
2. data-entry/index.ts uploadEnabledfalse; handler nega session/preview/upload e até check via essa chave. Precisa capability do JWT canónico + retoma somente leitura independente de ativação: BLOQUEIO.
3. Storage positivo Cloud de bytes novos não exercitado: preflight gerar/ler PDFválido ANTES conta e readback pósupload no8; NÃO outra rodada negativa.
4. Compatibilidade legada: locks333 e índiceexacto não demonstram exclusividade normalizada universal com clienteslegacy_untracked. Provas30/32 preservam moedas/23505/unknown. Para pilotoFICTÍCIO único, referência sintética nova e nenhum escritor legado concorrente do mesmo identificador; todos novos scanner/accountant/ingest permanecem gatesfechados. Não liberar universal nem alterar índice/global legado. Vulnerabilidade residual delimitada, não resolvida por esta allowlist.

### Mudança concreta preparada (não aplicada)
`pilot8/allowlist.INERTE.sql`: tabela privada sem grantsbrowser/service, owner+company+op exata, enabledfalse por defeito/expiração, actorrolecanónico, lockFOR SHARE por transação, capability autenticada e gatesCORE/assistant substituem globalflags — não fazem OR com flagglobal. scanner_create/accountant_edit/ingest_create fechados. 4funçõesCREATE OR REPLACE preservam ACL/owner/config existentes; guardsMD5fontes Live iguais. Operaçõespreparation/assistant_create independentes; checkSQLexistente sem mutação.
`handler.PENDENTE.patch`/`index.PENDENTE.patch`: só cópia/docs; capability por JWT real, uploadEnabled produtivofalse permanece; revalida antes upload e receipt, SQLrevalida prepare/authorize/begin/commit. Retoma check/document/sessionexistente continua read-only depois revogar. Recusa nunca apaga candidato.
`activation.INERTE.sql`: controlador parâmetrosliteraisDECLARe/nova conta exclusiva/proveniência/company/manager/semLogin/flagsglobais0/semhistórico;2linhasallowlist expirável, nenhuma execução agora. Não prepara papel automaticamente.
`rollback.INERTE.sql`: flagsglobais devem estarfalse; restaura funçõesoriginais semDROP/limpeza nem destruir provas.

## Prova local atual —11/11 PASS (não Cloud)
PG17socket/pgcrypto/0190–0193 reais; PDFReportLab lido porpdfinfo e validateDocumentEXATO antes Authlocal; handlercandidato e SQLreais, StorageAPI/Auth transportes locais declarados; bytes em disco/releitura/hash/receipts verdadeiros.
Fonteguard/ACLownerconfig/dados/settings iguais, emptyallowlistfalse mesmo flagsglobaistrue em transaçãoROLLBACK, ownerpeer/tenant/expiração/disabled, ACLprivada, PDFuploadpréviabinding/execfechada, peer/tenantretoma recusados, duplaexecute1invoice/result/attemptaudit com0financeiro, nomeaprovadorservidor/valores0/IVA0/bytesexatos, checkread-onlyrevogado,2conexõeslockrevogação, revogaçãoapósreadback bloqueiareceipt/document preservandoobjeto, rollbacksemDELETE.
Regressões22hash+24fixture tambémPASS. Falhas iniciais do runner: reapplySQL explícitoBEGIN abortado exigiaROLLBACKlocal e serializaçãoJSON enviada como string; corrigidas no runner. Não eram falhasLive nem motivo para contas. Handlercandidato ajustado para read-only independenteupload; produto intacto.

## Piloto8 executável depois da revisão/aplicação autorizada — uma única prova
1. ANTES conta: regenerar PDFReportLabFICTÍCIO, validar pdfinfo + validateDocument importado atual, calcular SHA/size/MIME bytesexatos e preservá-los /tmp0600. Não reutilizar hash39 sem bytes. Preflight fontesMD5/ACL/config/buckets privadoslimite20MiB/destinoausente/referênciasintética e baselinesfinanceiro/core/attempts/receipts/storage/audit count+hash com filtroscongelados.
2. Controlador revê guards/diffs/11PG; aplicação oficial SQLnovo somente quando autorizada e deployrestrito data-entry para patchrevisto. Nenhuma aplicação/deploy nesta entrega. PrepararUIexistente atravésstatuscanónico semPublishautomático.
3. Só após1/2: UMA futura conta.invalidAuthAdmin sememail/invite/magiclink, markerfresh/nomerealperfilfictício/companyMP;passwordJWTprivados. Controlador prepara membershipmanagerexclusiva e2allowlistrows pela transaçãorevista; nunca flagsglobaistrue, nenhum clientelegacyativado. Espera finita + finallyban se preparação ausente; não alternativa automática.
4. Statuscanónico → UMA sessão → UM PDFuploadstaging; assertbytes/sha/size/mime/path/receipt; preview manualFICTÍCIO EURtotal0/IVA0, NIFclienteERP lido, supplierNIFsintético/referencefresca, pagador confirmado membro (pode owner da fixture), semevento/conta/BP. Prévia mostra exatamente documento/metadados1avulsa/0financeiro; sha/versionimmutable.
5. Autorizar explicitamente no UI existente após revisãofields; nomeaprovador autenticado não recebido do modelo. Execute wrapperprepare→authorize→begin→uploadfinal/readback/receipt→commit→result_check. Duplo clique coordenado da MESMA prévia/mesmoowner, não criar nova intenção; no máximo1 invoice/result/attemptaudit. Timeoutincerto=checkread-only, nunca reenviarcommit/novoID.
6. ReabrirMESMAsessão e check com resultadoSQL + download/hashdosbytes; assert invoicevalores/currencyEUR/data/nif/número/created_by/pagador/observação nome+timestamp, storagepath/receipt/effects1 e0TX/BP/pagamentos/contas/reembolsos/listas. Ledgeradministrativofixture separado; artefatoscongelados/IDsprivadossótmp, relatório sanitizado.
7. Controlador revoga enabled somente2rowsowner/company (semdelete); read-onlyretoma permanece. Finallylogoutglobal/banSÓnova/sessions0/destruirpassword/JWTtmp; preservarPDF/objetos/reservas/faturaFICTÍCIA/audit para conferência não destrutiva. Count+hashfinanceiroiguais, efeitos documentais previstos segregados. Não novas rodadas ou exclusão de candidatos.

## Registro correto preparação50
Controlador informou: primeira renderização trocou placeholder em comentário, não DECLARATION;22P02 na inicializaçãoDO ANTESqualquerDML. Renderização literalDECLARATION corrigida e única transaçãoposteriorPASS. Semincerteza/duplicação. Não foi primeiraexecuçãoperfeita. Esta entrega corrige atribuição factual sem exporIDs.

## Fecho e próxima ação
Controlador pode marcar6 técnica comprovada;7 tem candidato para bloqueios1/2, pendente revisão/aplicação;8 preparado mas NÃO realizado/ativado. Não há escolha de negócio nova. Issue aberta/reserva333 mantida/#323DECISIONS/AGENTSintactos. Issuebody/comments consultados read-only; writerGitHubautorizado não disponível ao agente, checklist consolidado aqui para controlador colar. CI nova deste candidato ainda a confirmar, não afirmar verde antecipadamente.
