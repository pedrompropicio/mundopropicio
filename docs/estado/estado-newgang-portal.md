# ESTADO — newgang-portal

Atualizado: 17/10/2026 11:29 UTC. Frente: newgangfestival.pt.

## Em que pé está
- #332 imediato APLICADO em Live (17/10 11:28 UTC): migração 0184 + deploy só `newgang-portal`. Inscrição Clube vira membro no mesmo instante (trigger AFTER INSERT → collector canónico) e boas-vindas sai em <1 s (medido: 0,67 s; antes até ~5 min). Reserva durável: 1 welcome/membro, até 3 tentativas só com prova pré-fila (`error_pre_send`, intervalo 5 min); `unknown` nunca repete automaticamente (consulta manual em `club_welcome_reservations`). `request_access`: sent / not_member / pending (captura processed=false <30 min, sem sessão nem email); 20 pedidos/IP/10 min → 429. Provas: docs/testes/issue332/imediato-aplicacao.md e imediato.md.
- #332 consentimento por pessoa aplicado pela 0182/0183: email-v3 independente, anúncios-v1 no ledger #322 por membro/site/finalidade; backfill 47 linhas (37 legacy-sem-versao, 9 clube-newgang-v2, 1 email-v3), 0 duplicadas. me só estado/versão/data; CAS bloqueia grant atrasado; unsubscribe atómico. Provas: consentimento-pessoa.md e aplicacao-signup-backfill.md.
- #332 passo 4 Meta: ramo newgang_clube:v2 (migração 0181) verificado em Live; P_NG27_LISTA enabled=false, audience_id_meta=NULL, replace=true; nenhum envio.
- club_points preservado em todas as etapas (47 linhas / 4.375 pontos / hash 170f71afecb51e61fbc879a979298008 na última verificação).

## Outras frentes preservadas
- #327: configuração 2027-v1 ativa; inscrição 100, indicação 75/cap 750, Crew 100; níveis Gang 0/Crew 750/Goat 3000; compras indisponíveis; direitos adquiridos preservados.
- #328: identidade/concorrência/pendência Crew aplicadas; não alteradas.
- #330: profile-v1 ativa, 50 únicos por adesão/site mediante confirmação explícita. WhatsApp adapter_pending; menores de 13 parental_flow_required.
- Portal separado não alterado; Publish por Pedro. Artes Wallet aprovadas; visual no dispositivo pendente.

## A trabalhar agora
Nada em execução. Reserva #332 libertada.

## Próximos passos
- Portal separado: caixa de consentimento marcada para granted de qualquer versão (versão visível); integração dos estados pending do request_access; Publish por Pedro.
- Pedro publicar portal com consent_text_version clube-newgang-v2 e criar/ligar público Meta; depois reconsultar elegibilidade e autorizar separadamente ativação/envio/cron.
- TikTok/Google, pixels e restante #332 fora desta etapa; coordenar #322 sem sobrepor.
- Pendências anteriores: WhatsApp canónico, fluxo parental verificável, PDF na primeira conclusão de perfil, link Fever, primeira revelação, fotos/aftermovies, benefícios a decidir. Early entry suspenso até validação MEO Arena.

## Factos que não se reinvestigam
Portal separado chama newgang-portal e portal-track; configuração no CRM. Sem totais de atrações; revelações obedecem club_at/public_at. Acesso por link pessoal; sem sorteio. Merch é produto e não prémio. Cache CRM até 60 s aceite; revelações expiram em public_at. Trackers do evento vêm do CRM, nunca do código. Descadastro chama handle-email-unsubscribe e grava supressão. Wallet cor por objeto não suportada, sem classes alternativas autorizadas.

## Onde ler
.lovable/memory/features/portal-newgangfestival.md; docs/specs/portal-newgangfestival.md; docs/testes/issue327/, issue328/, issue330/, issue332/.
