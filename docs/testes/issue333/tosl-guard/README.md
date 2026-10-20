# #333 — correção mínima tosl_guard, 20/10/2026

Preparação autorizada, não aplicada. Base `28db3ec459b9dbd39e2d8ccc6e106f8622b7f185`; CI controller run39467528287 SUCCESS. Reserva apenas linhas/apuramentos/documentação; #322/#323 preservadas. Pacote A não repetido.

## Fonte exata e âmbito
Leitura oficial Cloud `pg_get_functiondef`, md5(prosrc), owner/ACL/SECDEF/search_path e trigger: definição atual corresponde ao snapshot canon12f e à migration0077. Definições completas anteriores guardadas nesta pasta. Guard antigo MD5 `4cb7d3b770237dd37543ee526089555f`; confirmação `2e868bc2a28ec291581028f6dc579c6a`. Trigger `trg_tosl_guard`, BEFORE INSERT/DELETE/UPDATE FOR EACH ROW, habilitado O. FK statement_id→statements(id) ON DELETE CASCADE confirmado oficialmente e reproduzido localmente.

Só muda `public.tosl_guard()`: pais OLD/NEW deduplicados, ordenados por UUID, bloqueados FOR NO KEY UPDATE antes de revalidar status; recusa se qualquer pai confirmado. Regra existente de empresa NEW preservada. Confirmação continua byte-identical com FOR UPDATE e verificação de permissões/documentos/soma. CREATE OR REPLACE conserva identidade/owner/ACL; nenhum GRANT, tabela, writer financeiro, RLS, gate ou endpoint alterado. Guard novo MD5 `e35ed107ee7c371d34d5a6dd938e1de7`.

## Prova efetiva
PostgreSQL17 descartável, 2 conexões; barreira por pg_blocking_pids (não sleeps para presumir ordem), snapshot de funções/triggers/constraints canon12f e FK real do pai. Comando: `ISSUE333_LOCAL_PROOF=1 bash docs/testes/issue333/tosl-guard/run.sh`. Dependências: PG17/initdb/pg_ctl, Python psycopg2, setpriv quando root. Runner exige socket local fixo, cria cluster trust só Unix, e remove o cluster em finally/trap.

20 verificações PASS: baseline antigo reproduz confirm→INSERT admitido; ACL/owner/SECDEF/search_path intactos; INSERT pendente→confirm espera e recusa; confirm→INSERT espera e recusa; INSERT válido→confirm inclui linha; UPDATE/DELETE em ambas ordens; draft CRUD; viewer e outra empresa recusados/manager permitido; empresa da linha; mover de pai confirmado recusado; mover contra destino/origem em confirmação recusado; movimento→confirm origem; UPDATE pendente→confirm; movimentos opostos sem ciclo de locks dos pais; rollback restaura bytes/ACL e retém linhas/reaplicação/drift; confirmação inalterada. Runner completo repetido após acrescentar casos, 20/20 PASS; cluster removido. Tentativas iniciais corrigiram só setup local (owner/UTF8), não aumentaram timeouts nem desativaram testes.

Não é prova RLS integral nem suite completa. Sem UI alterada: usa o mesmo trigger no modal manual e executor. Sem chamadas Cloud de dados financeiros, modelo/Gmail, deploy/Publish/DML/DDL.

### Limite explícito de deadlocks
Ordem UUID resolve movimentos opostos entre os dois pais numa operação. Não promete ausência universal de deadlocks em transações arbitrárias multirow: UPDATE/DELETE já podem deter o lock da linha antes do BEFORE trigger, enquanto o executor existente bloqueia pai e depois linhas. PostgreSQL aborta um participante (40P01), sem commit parcial; recuperação deve reler e repetir a transação inteira apenas sob autorização ainda válida. Eliminar esse ciclo global exigiria mudar contratos/writers de outros caminhos; fora deste patch mínimo. O teste não foi anunciado como prova desse ciclo global.

## Pacote revisável — ordem futura, NÃO executada
1. Controller confirma novo SHA/CI e autorização concreta para aplicar só guard. Ler readbackSELECT e comparar definições/owner/ACL/trigger com anteriores. Não reservar número manualmente: ferramenta oficial atribui quando autorizado.
2. Aplicar conteúdo INERTE pelo mecanismo oficial, removendo apenas BEGIN/COMMIT externos se exigido; lock_timeout5s preservado. Abortará se prosrc/config/owner/trigger/confirm divergir. ACL explícita atual é conservada, não corrigida globalmente.
3. Readback oficial: guard MD5 novo, confirmação MD5 antigo, identidade/ACL/config/trigger idênticos; assistant/review/executor/gates/scopes continuam fechados. Nenhum deploy necessário para função SQL; nenhuma ativação implícita.
4. Reversão somente se autorizada: ROLLBACK-INERTE exige hash novo e mesma confirmação/trigger, restaura definição antiga sem apagar dados. Não executar enquanto houver trabalho concorrente; reaparece a corrida antiga, portanto executor/assistente devem continuar fechados.

## SHA-256 completos
- INERTE: `8cda8d00a42135a89695e62f2cc379be2332680f52811308a2597d2ba121d233`
- ROLLBACK-INERTE: `4fe8eaf94db0f8919499e585500fae3362b356cdb30f12d11e7df35c4646464f`
- readback.SELECT: `a96d4b1609fbb72a01b0419335b62b59b36395ef1c3146c048c89420e8a05088`
- guard BEFORE: `3bf8057429d9271d211edbdc9c5cdd21528419999888f3c3f75b628472933924`
- guard AFTER: `c3ea29e20415ec135166b5ee417b3c862007f6e12b30bd56334c353f635cfe29`
- confirm BEFORE: `b78dec933b2b5a56fbbf8b2121a09e32ea5f3f4e703bf0e1fa01970a0f13c13e`

Checklist: patch mínimo preparado; corrida reproduzida/corrigida localmente; rollback/drift/ACL provados; pacote INERTE com hashes completo; aplicação/validação Cloud pendentes de revisão/autorização própria. Reserva própria libertada. Issue remota não editada (canal documental QUADRO disponível).