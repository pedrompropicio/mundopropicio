# ESTADO — newgang-portal

Atualizado: 17/10/2026. Frente: newgangfestival.pt.

## Em que pé está
- #332 consentimento por pessoa aplicado pela0182 e APIs Newgang/descadastro deployadas. Email-v3 separado; anúncios-v1 referenciam ledger#322 por membro/site/finalidade. me só estado/versão/data; CAS bloqueia grant atrasado; unsubscribe atómico. Provas docs/testes/issue332/consentimento-pessoa.md e contrato docs/features/newgang-consentimento-pessoa-332.md.
- Nenhum crédito/consentimento retroativo. 40/40 SQL,17/17 handler,1281 Vitest; smoke200/401/404. Portal separado não alterado. WhatsApp adapter_pending; parental verificável pendente; nascimento ausente bloqueia grants. P_NG27_LISTA/Reactivar/coletor antigo intactos e exigem decisão separada antes de entrega.
- #332 passo 4 Meta: ramo newgang_clube:v2 aplicado pela migração0181 e verificado em Live; Coala/genérico e assinatura preservados.
- P_NG27_LISTA registada na ligação MP indicada e verificada; enabled=false, audience_id_meta=NULL, replace=true. HTTP400 audience_not_linked_to_meta confirmado com dry_run=true; nenhum envio.
- SELECT17/10 às02:37–02:38UTC: 46 registos MP do evento,39 consent_email=true,0 versão clube-newgang-v2,0 emails elegíveis. RPC autenticada HTTP200 confirmou0. Números desta execução, reconsultar antes de ativar.
- Última captura por email/evento precisa de consentimento=true e versão v2; anteriores/v1 não entram; suppressed_emails global/MP e captura posterior false excluem. Telefone apenas de captura elegível do evento, preferindo preenchido.
- PostgreSQL local: casos Newgang e regressões Coala/9 filtros genéricos passaram. Vitest1281 passed/1 skipped/11 todo; build automáticoOK; CI baseline39417128success, CI final aguarda sincronização.
- Provas: docs/testes/issue332/README.md, live-counts.json, sql-test.md, vitest.md, vitest-full.md.
- #322/#323 preservadas: só leitura lead_capture; sem ledger/portal-track/CAPI, Publish, deploy, cron, backfill ou entrega Meta.

## Outras frentes preservadas
- #327: configuração2027-v1 ativa; inscrição100, indicação75/cap750, Crew100; níveisGang0/Crew750/Goat3000; compras indisponíveis e direitos adquiridos preservados.
- #328: identidade/concorrência/pendênciaCrew aplicadas; não alteradas.
- #330: profile-v1 ativa,50 únicos por adesão/site mediante confirmação explícita; Pedro confirmou edição sem repetir crédito. WhatsApp adapter_pending; menores13 parental_flow_required. Provas docs/testes/issue330/.
- Portal publicado segundo Pedro; esta tarefa não altera nem confirma nova versão do portal. Artes Wallet aprovadas e compatibilidade Gang/Crew/Goat existentes; visual no dispositivo pendente.

## A trabalhar agora
Fecho da etapa backend por pessoa; #332 permanece aberta para portal, política jurídica, integração de elegibilidade e plataformas. Reserva libertada após documentação. Comentário Issue e CI final ainda não confirmados.

## Próximos passos
- Pedro publicar portal com consent_text_version clube-newgang-v2 e criar/ligar público Meta; depois reconsultar elegibilidade e autorizar separadamente ativação/envio/cron. Não assumir newsletter/bandeira cookies como consentimento de partilha da lista.
- TikTok/Google, pixels e restante #332 fora desta etapa; coordenar #322 sem sobrepor.
- Pendências anteriores: WhatsApp canónico, fluxo parental verificável, PDF/atualização automática na primeira conclusão de perfil, link Fever, primeira revelação, fotos/aftermovies, benefícios a decidir. Early entry suspenso até validação MEO Arena.

## Factos que não se reinvestigam
Portal separado chama newgang-portal e portal-track; configuração no CRM. Sem totais de atrações; revelações obedecem club_at/public_at. Acesso por link pessoal; sem sorteio. Merch é produto e não prémio. Cache CRM até60s aceite; revelações expiram em public_at. Trackers do evento vêm do CRM, nunca do código. Descadastro chama handle-email-unsubscribe e grava supressão. Wallet cor por objeto não suportada, sem classes alternativas autorizadas.

## Onde ler
.lovable/memory/features/portal-newgangfestival.md; docs/specs/portal-newgangfestival.md; docs/testes/issue327/,issue328/,issue330/,issue332/.
