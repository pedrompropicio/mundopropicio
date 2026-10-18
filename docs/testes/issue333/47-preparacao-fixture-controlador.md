# #333 — Prova47: preparação integral LOCAL/INERTE para o controlador

## Correção após revisão concreta — 2026-10-18 03:02 UTC

A prova47 original NÃO reproduzia a fonte Live de auditoria: usou MD5 `68eb6557eb78e71984b5fb65fae9752e`; Live tem `9509fe109550c9e0367fcbe4ffc661c5`. A guarda original abortaria55000 antes da conta. Corrigido somente artefacto inerte/testes; fontes atuais obtidas por SELECT e guardadas em `preparation47/sources/`, com manifesto e diff. Nenhuma função Live/trigger/grant alterado.

Mudança semântica encontrada: Live acrescenta validação de existência da empresa; empresa já removida produz company_idNULL para auditoria. Auth.uid→system, resolução current_company→rowcompany, metadata schema/op, defesa not_null_violation e OLD/NEW já existiam no corpo anterior. Diferenças de formatação fora do corpo não explicam o MD5.

24/24PGPASS:19 casos preservados + antes47 recusa55000 + fonte divergente continua55000 + hashes helpers/FK + auditoria system/rowcompany + contexto autenticado local. Atual: UPDATE1/INSERT1/audit+1; falhas dão rollback integral. SQL exige também hashes auth.uid/current_company e verifica company/changed_by/metadata do audit. Tabela audit local tem colunas/defaults/nullability/FK reais lidos; RLS/Auth hosted não alegados como reproduzidos. Fontes3330190–0193 intactas.

SELECT agora: internalMD5b748a720b4cb1f988a927b5577e511dd; EXECUTE anon/auth/servicefalse; wrapperMD52516160137090ca2061f6dab482abe19; guardMD5ad7fa13bc8918b0acbacf4910ede9b39; settings CORE/attempt0; triggerauditAFTER INSERT/DELETE/UPDATE e guardattemptBEFORE DELETE/UPDATE preservados. User_rolescompanyNOTNULL/defaultcurrent_company, triggerBEFOREINSERTset_company atuais explicitados localmente. Profile/Auth campos usados confirmados via metadados, sem consultar contas ou segredos. Isto não garante que futuras pré-condições não mudem: controlador deve reler fonte/baselines antes da execução única.

SQL corrigido SHA256: `d9a01baee51fe0d210877a976bcc931795a33d2fbafbe220d7081a68b3fef9e5`. Histórico abaixo refere-se à entrega original quando indicar19PASS/fonte rastreada antiga; não é igualdadeLive. Coordenação futura permanece parametrizada e não executada.


Base autorizada `ac1321ad7dac64d71e5041fe45bab66f704eddab`; ancestralidade exit0. Início UTC2026-10-18T02:51:46Z. INDEX/QUADRO/estado/memória/0191/provas39/41/45/46 lidos. Sem subagentes, produto, AGENTS, regras, DECISIONS ou outra frente alterada. #333/reserva mantidas; #323 preservada.

## Canal e atribuição corrigidos

O requisito de SELECT no próprio run_sql era uma condição do controlador, não nova regra de Pedro. O controlador comunicou preflight real no SEU conector Lovable query_database: current_user=postgres; has_table_privilege(user_roles,UPDATE)=true; has_table_privilege(standalone_attempts_333,INSERT)=true. Sem escrita nessa observação. Evidência comunicada pelo controlador, NÃO execução pelo agente; não prova autoridade de run_sql. Nenhuma nova investigação de canal, pedido de token, GRANT ou sessão administrativa. Prova46 retificada.

## Artefactos concretos

- SQL integral parametrizado: `preparation47/prepare-fixture.INERTE.sql`. Não migração, nunca submetido ao Cloud. Transação BEGIN/DO/COMMIT; somente um UPDATE de role e um INSERT de reserva; sem CREATE FUNCTION persistente, helperSECDEF, SQL dinâmico ou DDL.
- Renderizador sem rede/conexão: `preparation47/render-private.py`. Aceita exatamente dez parâmetros não secretos; lê/escreve somente /tmp, output0600 e exclusivo. Escapa a única literal JSON; não executa SQL/Auth/login. IDs/email/marker/timestamps da futura conta nunca entram no repo.
- Teste local: `pg/fixture-preparation47.test.ts`, configuração PostgreSQL já existente. Fontes0190/0191/0192/0193 lidas integralmente, sem alterar SQL aplicado. Auditoria `log_table_change` copiada pela execução do ficheiro rastreado inteiro20260429212733; trigger audit_user_roles_changes AFTER INSERT/UPDATE/DELETE.
- SQL SHA256: `d66b2ba808c009badb01917db8a4fe1e437b51ddf2b232288ad12bd7752b5ee3`.
- Corpo auditoria rastreado MD5: `68eb6557eb78e71984b5fb65fae9752e`; hash-check0193 MD5 `b748a720b4cb1f988a927b5577e511dd`. SQL recusa fonte/trigger diferente, sem corrigir Live por suposição.

## Guardas e efeitos mínimos

Parâmetros company/owner/roleid pré-lidos; attempt/destination UUID novos e distintos. Empresa ativa; todas as flags333 sem enabled e COREsettings sem linhas. Conta criada dentro de janela limitada a15min, timestamp AuthAdmin exato, email exclusivo .invalid, metadata fixture_marker aleatório e company_id exatos, email confirmado, sem ban ativo/login/sessão. Profile já na empresa, sem mudar perfil/active_company. Exatamente uma membership user em toda a conta, roleid/user/company exatos; nenhuma tentativa/fatura anterior do owner, nenhum destino/objeto/receipt/audit existente.

Locks de linhas e advisory canónico. UPDATE exclusivo user→editor exige ROW_COUNT=1. Auditoria administrativa exige exatamente+1 e old/new integral corretos; ausência/falha aborta tudo, sem desligar trigger. INSERT explicita TODAS as17 colunas de0191: prepare/intenção1/priorNULL/confirmaçãoNULL/resultadoNULL/conclusãoNULL. Hash calculado no PostgreSQL de envelope::text UTF8, não JSON.stringify; principal=owner, efeitos=[scanner_create], payload0EUR/IVA0, sem pagador/finanças. Path canónico com empresa/attempt/SHA.pdf. ROW_COUNT=1 e conferência de conteúdo. Nenhuma fatura/upload/receipt/audit de execução/transição ou flags.

PDF39:1499bytes/application/pdf/SHA256 `71f5e44dc5b441804eb07ab099b006d4fb119f5c9b86f82b9645492ce711670a`, já parsing/validateDocumentPASS na39. Os bytes originais não estão disponíveis no /tmp desta sessão; NÃO gerei PDF novo fingindo o mesmo hash e NÃO repeti teste39. Os dois pedidos pendentes são check (sem bytes/upload), logo a reserva pode vincular os bytes históricos comprovados sem os enviar. Se futura tarefa incluir execute/PDF, recuperar original e conferir SHA/1499 antes da conta; ausência=parar, não substituir silenciosamente.

## Prova local finita:19/19PASS

PostgreSQL real descartável, socket Unix/listen_addresses vazio, pgcrypto; nenhuma credencial ou conexão Cloud. Contexto base compatible fixture existente (Auth schema mínimo ampliado localmente; roleidUUID corrigido localmente para schema real), não reprodução completa do hosted Auth/RLS. Fonte SQL333 e corpo audit rastreado exatos; não alegar comparação runtimeLive nova.

1 Fonte audit/trigger exatos.
2 Sucesso:uma role editor, uma reserva prepare integral, um audit administrativo; zero invoices/receipts/attemptaudit/objetos; segunda execução recusada.
3–9 Owner/company/roleid/marker/email/timestamp/janela errados recusados.
10 Segunda membership recusada.
11 Destino ocupado recusado.
12 Falha INSERT injetada localmente: role+audit+attempt rollback integral.
13 Trigger audit desativado só LOCAL: recusa55000 antes de mutação; restaurado.
14–18 Ban/login/sessão/objeto/receipt existentes recusados.
19 UPDATE com ROW_COUNT0 injetado LOCAL:55000; zero INSERT/audit, rollback integral.

Em cada recusa comparação real JSON integral de role/profile/attempt/audit/invoice/receipts/settings antes/depois. Nenhum teste desses conta como Cloud. Primeira execução com configuração padrão não encontrou testes (include src); corrigida apenas localização/configuração para configuração PG existente, sem mudar produto.

## Coordenação futura única — NÃO EXECUTADA

1 Controlador revê este SQL/19PASS e autorização de continuação; lê fonte/trigger/baselines atuais pelo seu query_database. Fonte audit distinta=parar e rever bytes, nunca alterar trigger. Baselines privados com filtros iguais; segregar nova identidade/role/um audit administrativo/reserva.
2 Em tarefa futura autorizada, agente cria UMAconta AuthAdmin email_confirm:true sem email/invite/magiclink, company_id explícito + fixture_marker aleatório. Mantém password exclusivamente memória/tmp0600, sem login antes da preparação. Faz finally em caso de falha. Entrega SOMENTE identificador técnico/created_at/marker/email não secreto por passagem privada autorizada ao controlador; nenhum password/JWT. Controlador pré-lê profile/membership/roleid. Não criar agora.
3 Há necessariamente UMA pausa de coordenação humana/ferramenta: controlador executa a transação renderizada no seu query_database; agente não possui esse conector. Output IDs só passagem privada/tmp. Se a superfície não permitir passagem privada de identificadores, manter roteiro parametrizado e NÃO consumir conta até o controlador definir essa passagem. Não publicar identificadores no repo/comentário público. Uma conta, um SQL, nenhum retry de resposta incerta.
4 Controlador confirma por leitura exatamente1 roleeditor/reservaprepare, entrega confirmação e hashcanónico por canal privado (sem credenciais). Agente retoma a MESMAconta com password preservada tmp/memória; não reabre banida nem cria outra. Antes dos negativos: contexto canónico editor/empresa, capabilitiesfalse/false e check correto; baselines iguais com exclusões explícitas.
5 No FINAL: exatamente UM POST RPC `/rest/v1/rpc/standalone_attempt_333` body {p_action:'check',p_id:attempt,p_operation:'scanner_create',p_envelope:null,p_hash:wrong64}; exatamente UM POST função standalone-attempt-333 body {action:'check',operation:'scanner_create',id:attempt,hash:wrong64}. wrong64 escolhido diferente do hashcanónico. Authorization só memória; timeout20s independente/SEMretry. Esperados403/42501 e409/pendente; medir HTTP/latência/SQLSTATE, sem upload/PDF. Não repetir execute39.
6 Incerto/timeout: só leitura de reserva/destino/audit/receipt/Storage/baselines; nenhuma repetição. Finally em qualquerresultado: logoutglobal se sessão criada, banSÓnova conta e SELECTsessions0 pelo canal do controlador; preservar fixtures. Se processo terminar durante a pausa, agente bane a nova conta e prova termina, sem segunda conta automática. Password tmp é apagada após encerramento; fixtures DB não são apagadas.

Nenhuma destas operações futuras foi executada; depende de revisão e uma pausa concreta de coordenação, não decisão de negócio nova. Produto desligado/Issueaberta/fase6 incompleta/causaantiga desconhecida. CI final da entrega por verificar após autocommit, não confundir19PGPASS com CI.
