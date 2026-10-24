# #352 — plano v2: execução privada

24/10/2026. Executor Codex; R0. Sem escrita Live, DSN, infraestrutura paga, deploy ou Publish. G6 continua com Pedro.

## Preparação aprovada

Checkout público fixo ad160ee9fbc5b7c5a73f0a63fc44b0c1c86a2708. Correspondência por MD5 do original sem whitespace, sem tolerância temporal. 499 órfãos (Março30/Abril223/Maio157/Junho87/Agosto1/Setembro1), 711 ledger e 242 Drizzle: **1.452 entradas cronológicas**. Nas seis diferenças exactas prevalece ledger; 31 ficheiros após corte excluídos. Lista de revisão 0fc45e9e1b3bf417ce81d78a4cee28b821bdac83, aprovação expressa de Pedro neste despacho.

6 overlays novos retiram exactamente os 16 INSERT VALUES aprovados, substituindo apenas os seus caracteres por espaços/newlines. As linhas e todos os restantes trechos da cópia publicada foram preservados. 58 INSERT VALUES restantes e UPDATE/DELETE/INSERT SELECT/DO/WITH intactos, salvo redacções PII autorizadas. 9 overlays anteriores preservados; total15. Hashes original/publicado/executado separados no plano. Nenhum original alterado.

PII:81 redacções de literais (29emails/1telefone/51candidatos de texto livre) mais1comentário, conforme autorização. Em 20260429021930 linha196 substituído só o email por `<redigido:email>`. REDACTIONS.md actualizado; gate completo **1.227 ficheiros,0ocorrências**, cobrindo ledger/overlay/orphan (inclui dois históricos Drizzle). Padrões não certificam anonimização semântica absoluta.

## Runner e validação

Regra destrutiva preservada. Nova classe: CREATE TABLE/INDEX/POLICY/TYPE/FUNCTION/VIEW/SCHEMA e ALTER TABLE ADD COLUMN/CONSTRAINT, só SQLSTATE42P07/42701/42710/42723/42P06. Savepoint por instrução; erros fora das classes param/rollback da versão. ALTER misto, DO e DML não recebem salto idempotente. JSONs separados ledger/skipped-destructive.json e ledger/skipped-idempotent.json, incluindo versão/linha/verbo/objecto/SQLSTATE/hash e confirmação de commit da versão. Catálogo final ainda precisa validar o resultado de cada salto; ausência de erro não prova equivalência com Live.

14 testes locais passaram. 514 ficheiros publicados conferidos por Gitblob, zero diferenças. Código privado [05e1761a](https://github.com/pedrompropicio/mundopropicio-replay/commit/05e1761a2525d5297ad9b2e12cfedb754649021c); corretivo só da expectativa do autoteste [bc5d4c5c](https://github.com/pedrompropicio/mundopropicio-replay/commit/bc5d4c5c21a9224d2117b3c00af7a2cabae395eb).

Primeiro [run40140785863](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40140785863): gatePIIverde; parou no autoteste mixed_add_drop antes de aplicar migrações. PostgreSQL valida DROP primeiro e devolveu42703; teste esperava42701. O runner recusou correctamente o salto/commit. Corrigida só a expectativa; SQL de origem, overlays e plano inalterados. Novo run desde vazio abaixo.

## G1 — vermelho: primeira falha fora das classes

[Run40141040181](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40141040181), SHA bc5d4c5c21a9224d2117b3c00af7a2cabae395eb. Replay de 23:02:22 a23:04:40UTC,24/10/2026. Supabase CLI2.84.2, Postgres nativo vazio. **11 autotestes nativos passaram**, cobrindo os nove códigos autorizados e recusas de DML/instruções mistas/DO/outros erros. GatePIIremoto verde.

**43 entradas concluídas (40ledger+3órfãs),1falhada,1.408não tentadas.** Drizzle ainda não alcançado. A nova sequência inclui origens que antes faltavam; a contagem não é comparável como percentagem de avanço ao antigo plano953.

Primeira falha: **ledger20260319231859**, ficheiro `ledger/20260319231859_20260319231855_publish_migration_from_pg_dump.sql`, **linha50**, instrução10 (índice9), ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_pkey. **SQLSTATE55000**: `index "role_permissions_pkey" is already associated with a constraint`. Hash original/publicado/executado b25cc9046f6e0033b04fb1c0ff92e72c7be6b6c08cd11634862c9c8f1c68299f.

**Não é o caso companies por slug→NULL**; esta execução parou antes desse ponto. Não se alargou a lista de SQLSTATE nem se editou migração/overlay para passar. Versão falhada revertida integralmente.

### Saltos destrutivos

**0**. [JSON privado](https://github.com/pedrompropicio/mundopropicio-replay/blob/208bae80cd4d65ae50eababd9222375827679d98/ledger/skipped-destructive.json).

### Saltos idempotentes

**4**, todos na versão falhada20260319231859; `version_committed=false` nos quatro registos. São eventos de salto observados antes do rollback, não quatro alterações confirmadas. [JSON privado](https://github.com/pedrompropicio/mundopropicio-replay/blob/208bae80cd4d65ae50eababd9222375827679d98/ledger/skipped-idempotent.json).

| Linha | Verbo | Objecto | SQLSTATE | Coincide com Live? |
|---|---|---|---|---|
|26|CREATE TABLE|public.role_permissions|42P07|Não verificado: G2 bloqueado|
|33|CREATE POLICY|Role permissions manageable by admin|42710|Não verificado: G2 bloqueado|
|40|CREATE POLICY|Role permissions viewable by authenticated|42710|Não verificado: G2 bloqueado|
|48|CREATE INDEX|role_permissions_pkey|42P07|Não verificado: G2 bloqueado|

Os JSONs estão também no artefacto; commit208bae80 guarda apenas evidência com skip-ci, sem novo replay.

## G2 e fecho

**G2 não executado**, pois G1 não ficou verde. Não se recolheu catálogo Live novo nem se atribuiu equivalência aos objectos saltados. As seis consultas foram executadas sem mudança sobre a base local parcial e estão no artefacto; isso não é G2 nem reprodução completa.

Agendador off e firewall de egress confirmados; cron.job exportado antes do unschedule:0antes/0depois. Sem SQL em Live. [Artefacto12579385781](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40141040181/artifacts/12579385781),25ficheiros,ZIPSHA85337bb248c98faafaed253cb1236d1d6fbef12183f6c3fd3be67328aebbcb80 (download verificado). [Resumo sanitizado](plano-v2-g1.json).

Próxima revisão Claude: decidir o tratamento específico de ADD CONSTRAINT USING INDEX quando o índice já pertence a uma constraint. Possível proposta: verificar a definição da constraint/índice existente contra a pedida antes de admitir esse caso; **não** ignorar55000 genericamente. Não implementado nem autorizado implicitamente por este relatório. Mantida paragem na primeira falha desconhecida. #352 permanece aberta; reserva própria libertada, #329 conferido antes das escritas.
