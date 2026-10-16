# #330 — Completa o teu perfil — preparação inerte

16/10/2026. Âmbito autorizado: SQL pendente, reversão, patch API/CRM inerte, contratos e testes locais. Nenhuma migration aplicada, DDL/DML Live, deploy, Publish, envio, Wallet ou alteração ao portal.

## Baseline e fontes

- No arranque, HEAD local = GitHub main `7d5a2bca950e7b948dde6185fb486a2132d2f62d`. CI 38964856071: completed/success, mesma SHA. O ambiente gera commits locais durante as edições; não foi feito commit/push/reset pelo executor.
- API ativa intacta: index.ts SHA256 `977f3edcc8f95a5d184d6c7912b4b7d08806a73f55e23feeda06a1a38d8e0c63`; history.ts `a2d36ee6e5885a0930a92df95e4d27ddbecf770db0486ed95ddc500f676053a0`. Diff contra baseline dessas fontes vazio.
- Catálogo Live lido apenas por SELECT, sem dados pessoais. `club_members` não tem DOB/país/cidade; tem telefone e handles sociais. `contacts` tem telefone e consentimentos agregados, não dados demográficos. Captura antiga tem DOB/cidade no raw; CRM legado lê essa captura.
- `profile` existente é social e fica intacto. Novo perfil demográfico será `club_member_profiles`, com prioridade exclusiva no novo `me.profile`; raw antigo permanece fotografia de aquisição, não sincroniza nem premia. Não há backfill automático ou identificação por telefone.
- Snapshot agregado observado durante inventário: 39 membros, 25 créditos, soma 2550. Não é guarda de aplicação futura: produção continua a receber inscrições legítimas.
- Locks #327: `_club_site_lock(site,false)` antes de membro `FOR NO KEY UPDATE`; configurador usa exclusivo. Motor `_club_award_core` intacto, novo evento gravado na primeira atribuição.

## Artefactos

- `supabase/manual/20261016_issue330.PENDENTE.sql`: três tabelas (países ISO, configuração da missão, perfil do membro), grants restritos, RLS staff por empresa, triggers de coesão/proteção, índice permanente do crédito e RPCs de sessão/configuração. Não cria linhas de perfil, configurações ativas nem pontos.
- `supabase/manual/20261016_issue330.ROLLBACK.sql`: desativa sob lock exclusivo, preservando dados, créditos, unicidade, RPCs e direitos; não é DROP nem reversão #327. Não executar automaticamente.
- `patches/issue330/newgang-portal.patch`: únicas fontes futuras index/history + módulos countries/profile; API publicada não editada. `me.profile` privado; montra `club.profile_mission` só configuração; países completos numa ação pública sem dados de membros. FKs novas não criam segunda relação portal_sites→events: sem embed novo.
- `patches/issue330/crm-profile-rule.patch`: artefacto inerte para bloquear edição dos pontos/identidade da regra, com guarda da mutação pela linha e proteção na DB. Label continua editável. Extrato CRM partilha o history label incluído no patch API. Nenhum editor CRM real foi alterado.
- Hashes integrais em `hashes.json`; outputs locais integrais nos documentos de prova adjacentes.

## Regras e segurança

- 50 constantes uma vez por membro/site, após ação explícita; confirmar email é requisito. Sem pontos por leitura, campos preexistentes ou defaults. Edição nova, clear, mudança de telefone, retry, void e reativação não renovam elegibilidade.
- Primeiro award e perfil na mesma transação. Exceção no crédito desfaz perfil/telefone; resposta não anuncia 50. Completion/evento/award não podem ser apagados/resetados por payload. Clear remove dados demográficos, mantém marcador permanente.
- RPC não aceita identidade, empresa, evento, pontos ou consentimentos. Resolve sessão access confirmada e site/empresa coerentes; revalida expiração após lock. EXECUTE só service_role; staff tem SELECT por empresa e não UPDATE no perfil/configuração.
- DOB ISO estrito, calendário real, sem futuro, calendário Europe/Lisbon. Idade não é dias/365. Países ISO alpha-2 (249) idênticos DB/API; normalização uppercase. Cidade trim/espaços, 1–120 caracteres, rejeita controlos e `< >`; UI futura tem de renderizar texto, nunca HTML.
- Telefone opcional/null E.164; só altera membro, nunca funde contactos. Não altera consentimento de marketing nem dispara envios.
- Nova regra fora caps referral/Crew; compra continua off; snapshots e funções #327/#328 não redefinidos.

## Dependências explícitas — não resolvidas

1. WhatsApp: ledger #322 `marketing_consent_record` tem finalidade fixa `meta_ads`; contactos têm flag/timestamp, mas não prova completa de versão/canal/finalidade da preferência do membro. Adapter pending: API responde 409; não grava flag falsa, não liga canal, não chama ledger #322. Coordenação #9 necessária para contrato canónico WhatsApp de aceitação e revogação. Tests provam a recusa do adaptador, não uma revogação persistida.
2. Parental: requisito do Pedro abaixo de 13 permanece. Não foi encontrado fluxo verificável na API/migrações inspecionadas. A missão retorna `parental_flow_required` para essa idade; isto é bloqueio técnico temporário, não nova proibição de adesão nem prova de consentimento. Não simplificar/remover DOB na adesão. Solução concreta futura: prova parental separada, versão/regulamento, responsável verificado e decisão server-side vinculada ao membro; nunca aceitar booleano do browser como prova. Só implementar após âmbito/revisão próprios.

## Testes e limitações

- Baseline/final Vitest: 158 ficheiros passaram + 1 skipped; 1271 testes passaram + 1 skipped + 11 todo; exit 0, ambos.
- PostgreSQL 17.9 real descartável: 57/57; exit 0. Socket Unix sem TCP, extensões/net/dblink indisponíveis, credenciais remotas removidas sem impressão. Fixtures exclusivamente @example.invalid. Sessões/tenant/ACL/RLS com SET ROLE reais, helpers de auth/empresa simulados por GUC: não é prova hosted-auth end-to-end.
- Concorrência: barreira exclusiva observada em pg_locks, 8 processos aguardados individualmente, exatamente 1×50 e 7×0; perfil único. Falha de crédito injetada por trigger reverteu perfil; retry posterior atribuiu 50.
- Negative control: SQL temporário com guarda de crédito errada falhou exit 3 (`profile_credit_failed`); artefacto entregue não modificado.
- Regressões runner #327/#328: exit 0, série/concorrência/epochs/retry/reversão existentes passaram. Não altera provas históricas.
- API módulo Deno sem permissões de rede: 8/8, exit 0. Patch aplica numa cópia temporária. Deno check da API: exit 1 antes/depois, mesmo erro prévio TS2783/TS2785 em wallet_sync; zero erros novos. Não foi corrigido fora do âmbito nem editada API ativa.
- Compilação automática: build OK. tsgo explícito não executado (harness gere verificações); não declarar tsgo exit 0. CI novo ainda não confirmado; CI baseline verde não substitui CI desta entrega.
- Sem E2E de escrita Live, sem teste de formulário portal/CRM real para #330, sem simulação de parental verificado ou preferência WhatsApp canónica inexistente.

## Âmbito exato de aplicação futura — NÃO executar nesta etapa

1. Revisão independente dos ficheiros/hashes, dependências, guarda de membro/site permanente e isolamento; confirmar commit sincronizado/CI.
2. Repetir SELECT de funções/grants/snapshot atuais e source baseline; criar migration canónica apenas a partir do PENDENTE aprovado. Zero backfill.
3. Aplicar patch API compatível com SQL presente; deploy apenas newgang-portal se autorizado. API deve manter erro explícito se backend da missão faltar, nunca inventar sucesso.
4. Aplicar/rever patch CRM numa fase autorizada antes de expor a regra. Frontend portal é tarefa sequencial, não implementada aqui.
5. Ativação da missão só por `club_profile_configure(site,'profile-v1',true)` explicitamente autorizada, com site Newgang real resolvido por catálogo. Nenhum UPDATE manual da configuração. Sem mexer no CUTOVER 2027-v1.
6. Se precisar desativar, reversão preservadora com janela/guardas e API compatível. Não apagar créditos/perfil/índice nem executar rollback global #327.
## Adenda — revisão final 23:01 UTC

Ver revisão-final-backend.md: isolamento integrado9/9; CRM real aplicado apenas compatibilidade, testes43/43; PostgreSQL59/59 com simulação default MAINTAIN PG17 e revogação explícita nas três tabelas. Patch API/history permanece inerte; fonte publicada não alterada. Substitui nesta entrega a indicação anterior de CRM ainda não aplicado. SQL sem alteração de regras/RLS/parental/WhatsApp; apenas controle explícito MAINTAIN no artefacto pendente. Nenhuma operação Live executada.
