# ESTADO — newgang-portal

Atualizado: 17/10/2026 12:10 UTC. Frente: newgangfestival.pt.

## Em que pé está
- #332 whatsapp APLICADO e FECHADO (17/10 12:10 UTC): migração 0185 + deploy só `newgang-portal`.
  Canal `whatsapp` (versão whatsapp-v1) no ledger append-only, ligado ao número do perfil por
  HMAC-SHA256 (chave em `app_secrets`, RLS sem grants, nunca exibida); sem número em claro no livro.
  Mudança de número invalida (`valid_for_current_number=false`) até nova autorização; grant exige
  telemóvel guardado (`whatsapp_no_phone`); revoke nunca exige número; CAS contra grant atrasado;
  parental <13 e adapter_pending preservados. Prova Live completa (conceder/retirar/mudar número/
  independência de email e anúncios) com membro de teste já limpo. club_points intacto
  (53 linhas / 4.875 pontos / hash 478b8c570440405c4380ad19b61050c8). Prova: docs/testes/issue332/whatsapp-aplicacao.md.
- #332 imediato APLICADO em Live (17/10 11:28 UTC): migração 0184. Inscrição Clube vira membro no
  mesmo instante e boas-vindas sai em <1 s (medido 0,67 s). Reserva durável: 1 welcome/membro, até 3
  tentativas só com prova pré-fila; `unknown` nunca repete. `request_access`: sent / not_member /
  pending; 20 pedidos/IP/10 min → 429. Provas: imediato-aplicacao.md e imediato.md.
- #332 consentimento por pessoa aplicado pela 0182/0183: email-v3 independente, anúncios-v1 no
  ledger #322 por membro/site/finalidade; backfill 47 linhas, 0 duplicadas. Provas:
  consentimento-pessoa.md e aplicacao-signup-backfill.md.
- #332 passo 4 Meta: ramo newgang_clube:v2 (migração 0181) verificado em Live; P_NG27_LISTA
  enabled=false, audience_id_meta=NULL, replace=true; nenhum envio.

## Outras frentes preservadas
- #327: configuração 2027-v1 ativa; inscrição 100, indicação 75/cap 750, Crew 100; níveis Gang 0/Crew 750/Goat 3000; compras indisponíveis; direitos adquiridos preservados.
- #328: identidade/concorrência/pendência Crew aplicadas; não alteradas.
- #330: profile-v1 ativa, 50 únicos por adesão/site mediante confirmação explícita. Menores de 13 parental_flow_required.
- Portal separado não alterado; Publish por Pedro. Artes Wallet aprovadas; visual no dispositivo pendente.

## A trabalhar agora
Nada em execução. Reserva #332 whatsapp libertada.

## Próximos passos
- Portal separado: caixa WhatsApp (marcada só se granted E valid_for_current_number=true; versão visível);
  caixa email marcada para granted de qualquer versão; estados pending do request_access; Publish por Pedro.
- Texto whatsapp-v1 aguarda validação jurídica antes de qualquer Publish.
- Descadastro/«PARAR» por WhatsApp: modelo preparado, sem envios nem webhooks (a implementar quando decidido).
- Pedro publicar portal com consent_text_version clube-newgang-v2 e criar/ligar público Meta; depois reconsultar elegibilidade e autorizar separadamente ativação/envio/cron.
- TikTok/Google, pixels e restante #332 fora desta etapa; coordenar #322 sem sobrepor.
- Pendências anteriores: fluxo parental verificável, PDF na primeira conclusão de perfil, link Fever, primeira revelação, fotos/aftermovies, benefícios a decidir. Early entry suspenso até validação MEO Arena.

## Factos que não se reinvestigam
Portal separado chama newgang-portal e portal-track; configuração no CRM. Sem totais de atrações; revelações obedecem club_at/public_at. Acesso por link pessoal; sem sorteio. Merch é produto e não prémio. Cache CRM até 60 s aceite; revelações expiram em public_at. Trackers do evento vêm do CRM, nunca do código. Descadastro chama handle-email-unsubscribe e grava supressão. Wallet cor por objeto não suportada, sem classes alternativas autorizadas.

## Onde ler
.lovable/memory/features/portal-newgangfestival.md; docs/specs/portal-newgangfestival.md; docs/testes/issue327/, issue328/, issue330/, issue332/.
