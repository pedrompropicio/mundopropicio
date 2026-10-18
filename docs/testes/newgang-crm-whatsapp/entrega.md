# CRM Newgang — lista por membro e WhatsApp (18/10/2026)

## Entrega
- Migrações oficiais 0196 e 0197 aplicadas, sem Publish/deploy/crons/envios/Meta.
- 0196 byte-exata com supabase/manual/20261018_newgang_crm_members_whatsapp.sql; SHA256 15db5650ba0965c683ffd6ab1b54b1138568db27be27879cd18f471c0a446058.
- Lista: um lower(btrim(email)); primeira captura por created_at,id define identidade mostrada, data, cidade, UTM e idade; submissions conta todas as capturas. member_no/confirmed_at ligados por empresa + site Newgang.
- Summary mantém contrato JSON; total no cabeçalho vem do summary, não da página filtrada.
- Projeção AFTER INSERT do ledger, última decisão por id servidor; lock por contacto; grant=true/decided_at, revoke=false/data NULL. crm_contactos é VIEW security_invoker de contacts (não segunda tabela), recebe origem automaticamente.
- Origem histórica true marcada form_legacy_sem_prova; nenhum boolean/data de consentimento histórico alterado pela migração. Perfil→CRM histórico NÃO backfilled.
- Consentimento do perfil não é alterável pelo botão CRM; guarda DB impede que ingestão legada sobreponha revogação. Atualizações sem alteração de consentimento não fazem backfill implícito.
- Elegibilidade única: consentimento CRM ativo, última decisão não revogada, E.164; grants do perfil também exigem fingerprint do telefone atual. Exportações CSV de contactos/lista/snapshot retiram números inelegíveis; audiências SQL e builder usam a mesma função.

## Verificações Live — 13:54–13:55 UTC
Chamadas RPC autenticadas reais, só leitura: summary.total=344; lista.rows=344; unique emails=344; duplicados=0; sum(submissions)=411. Erros RPC null.
SELECT oficial correspondente:
```sql
SELECT count(*) captures,count(DISTINCT lower(btrim(email))) distinct_emails
FROM public.lead_capture WHERE source='clube_newgang'
AND company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
```
Resultado: captures=411, distinct_emails=344. Captação concorrente explica crescimento anterior 400/336→411/344; números não são constantes.
Query direta das RPCs pelo canal read_query foi recusada por ACL; não ampliámos privilégios. RPCs foram verificadas pela sessão autenticada do próprio Pedro no Chromium.

Preview oficial (query integral em backfill-preview.sql): contacts=66; false_to_true=62; true_to_false=0; changes=65; origem club_profile_whatsapp-v1. Os 3 adicionais são alinhamento de data/origem, não novas ativações. NÃO executado.
Origem dos true existentes MP: form_legacy_sem_prova=308; club_profile_whatsapp-v1=1 (nova decisão concorrente, não backfill executor).
Triggers confirmados por pg_get_triggerdef. List/summary SECURITY DEFINER, owner postgres, search_path public; ACL de 4 funções existentes preservadas. Views security_invoker, anon sem SELECT; helper privado sem EXECUTE nominal anon/authenticated/service_role.
club_points não foi escrito: baseline 462/hash9a0ce71e792a9d9e16ce31f7202ab5ea →478/hasha7b26437938fe953b0d35a6b58c71727 por atividade concorrente do portal; não alegamos igualdade integral. Nenhum código portal/inscrição/pontos alterado.

## Consumidores auditados
- DB: crm_filter_match, crm_contacts_by_audience (agora elegibilidade); clube_newgang_list (estado/origem/eligibilidade); crm_ingest_lead_captures, crm_ingest_clube_captures_by_ids, process_lead_captures_batch (escritores protegidos pelo guard contacts, corpos intocados).
- crm_meta_audience_collect_leads lê lead_capture.consent_whatsapp no ramo genérico: Meta fora do âmbito, não modificado; ramo Newgang estrito email-only permanece intacto.
- React: ContactosList, ContactDetailsSheet, LeadsList (indicadores); contactsQuery (filtro administrativo por estado, CSV gate); audienceCriterion/audienceSnapshot (gate audiência/export); ClubeNewgang (gate CSV).
- Não foi encontrado envio WhatsApp de fãs consumidor de contacts. Twilio operacional usa notification_optin de staff, fora deste domínio/intocado.
- CustomerMatchUpload/crm-meta-audience-upload aceitam ficheiros externos para Meta, não são envio WhatsApp; não alterados nem invocados. Não alegamos política global de dados externos/Meta resolvida.

## Testes e UI
17 novos testes SQL PostgreSQL embebido, 3 regressões audiência: PASS. Concessão/revogação/regrant/sem contacto/idempotência/legado/telefone inválido/telefone alterado/tenant/rollback/backfill local/lista/search/paginação.
Suite completa: 178 ficheiros PASS, 1 skipped;1435 testes PASS,1 skipped,11 todo. Sem novos falhados. Build automático OK.
Chromium autenticado: lista real, Submissões, pesquisa 2 resultados, página2/7; desktop1280x1800 e mobile390x844 sem overflow horizontal. Não criámos fixtures Live nem consentimentos para teste.

## Commit e limites
Commit técnico observado: bb3375446ffe9925241080b379368d2e546e963b. Sincronização final/CI não observadas nesta entrega (HEAD remoto ainda ancestral durante execução); sem claims de CI final success.
Backfill inerte: supabase/manual/20261018_newgang_whatsapp_backfill.PENDENTE.sql; aguarda Sim de Pedro após preview renovada na hora. Sem Publish.
