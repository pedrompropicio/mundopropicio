# ESTADO — newgang-portal

Atualizado: 17/10/2026 sessão3. Frente: newgangfestival.pt.

Aplicação apósA dePedro14:42:0188reparação e0189coletorestrito aplicadas;deploy sónewgang-portal(source2fd2c38f4004cef6195d6205f68c4f5fe6cdb6c44ec580e86d1e190260f7a610)+crm-meta-audience-sync(507507a15887d4865d49eb6a3ec0a5167920c576271c4d26d49276dcee377554). SELECT308/278+19+11 assinatura c2173f4ab7f8f5a55e60b40cd24e414e igual fixture;nomes0204/0208/0405-0408/1606/1607 corretos. SQLreparação enviado1471bytes hash59a3f900c48c53fec17cd223043146f425c382e02c5a2e61bc54b16663129d2f;ficheirogerado ferramenta1472bytes,só1LFadicional.

ProvaLiveRPC passou:country_invalid/city_unknown/city_invalid,PTválido,BRsemcidade,50primeira/0repetição,legadoexcluído,grantemail-only,revoke/descadastroexcluídos. Teste teste332-faseb-20261017@mundopropicio.com criado pela captura normal e confirmadoRPCcanónico. Primeira provaemtransaçãoúnica rollback por statement_timestamp anteriorgrant;separadaempedidos passou. Portal separado/UI NÃO verificado. SemMeta manual;P_NG27_LISTAenabledtrue/replace;cron2499ativo04:35UTCintocado. Backfill/limpeza NÃOexecutados,aguardam doisSim;reservas mantidas,semfecho. Prova docs/questoes-332-aplicacao-dois-corro-20261017.md.

Sessão3: gate VERDE14:40:58UTC,remoto472fdccdc2cb5dec36be51ed66f8a6d32f6aed4e,CI/quality success de b6a37939d22d666d567ff159ea59f3e19ddcfb7f;1439ficheiros iguais e diff aplicável entre commits vazio. Bloqueio de execução: ferramenta de migração só aceita query textual,não tem parâmetro ficheiro;CLI disponível só diagnóstico,sem migração programática. Não enviadoSQL para cumprir regra sem retranscrição. Hash ficheiro reparação59a3f900c48c53fec17cd223043146f425c382e02c5a2e61bc54b16663129d2f;1471bytes. Nenhuma escritaLive/coletor/deploy/prova/backfill/limpeza/Meta manual. Reservas mantidas,sem fecho.

Sessão2: gate único por conteúdo às14:38:34UTC, remoto b6a37939d22d666d567ff159ea59f3e19ddcfb7f;1439ficheiros comparados,zero divergências/ficheiros não rastreados. CI e quality sem conclusion (null), portanto gate NÃO verde. Parado imediatamente,sem esperar. Nenhuma escritaLive,coletor,deploy,prova,backfill,limpeza ou Meta manual nesta sessão. Regra14:37 de Pedro substitui espera: próxima sessão começa pelo gate. Reservas mantidas,sem fecho.

## Em que pé está
- #332 cidade/lista Fase B parcialmente aplicada e BLOQUEADA:0187 aplicada às14:16 após gate por conteúdo remoto0cff4790,1436ficheiros iguais,CI/quality success. País obrigatório e cinco nomes pedidos corrigidos; erro de transcrição novo em0208/1606/1607, confirmadoLive14:36:17. ReferênciaLive308/278+19+11 MAS três divergências, não usar como oficial validada. Reparação compacta com hash+assinatura308 preparada/testada41/41+61/61. Espera14:18–14:36 sem sincronização de0187/runner/reparação; gate falhou, sem nova escrita. Coletor estrito NÃO aplicado; nenhum deploy novo, testeLive, backfill, limpeza ou Meta manual. Prova: docs/testes/issue332/correcao-pais-20261017.md.
- Contrato autorizado: cidade obrigatória/308concelhos só residênciaPT; país de residência obrigatório em todos os perfis; estrangeiro dispensa só cidade; cidade livre/vazia, sem inferir país. Nascimento/país nascimento/parental mantidos. Lagoa nominal, portal-track intocado. Autorizações cidade/lista e deploy somente portal+sync mantidas; backfill/limpeza requerem SQL+Sim separados.

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
- #332 passo4 Meta: ainda ramo0181 em Live, não estrito novo. P_NG27_LISTA enabled=true/linked/replace (SELECT12:45); cron2499 ativo35 4 * * * (SELECT13:02:22), ambos intocados. Elegibilidade projetada12:59:42:63membros/3emails; não confundir com coleta0181/totalMeta.

## Outras frentes preservadas
- #327: configuração 2027-v1 ativa; inscrição 100, indicação 75/cap 750, Crew 100; níveis Gang 0/Crew 750/Goat 3000; compras indisponíveis; direitos adquiridos preservados.
- #328: identidade/concorrência/pendência Crew aplicadas; não alteradas.
- #330: profile-v1 ativa, 50 únicos por adesão/site mediante confirmação explícita. Menores de 13 parental_flow_required.
- Portal separado não alterado; Publish por Pedro. Artes Wallet aprovadas; visual no dispositivo pendente.

## A trabalhar agora
Fase B parada14:36: gate por conteúdo não confirmou reparação após>15min. Remoto0cff4790 mantémCI/qualitysuccess, mas0187,metadadosDrizzle,runner eSQLreparação ainda não constam byte a byte. País obrigatório já aplicado; três nomes aguardam reparação. Testes atuais41/41cidade+61/61perfil+3/3handler+4/4Deno+6/6Vitest focados; suite anterior1287pass. Reservas cidade/lista mantidas; nenhuma reserva libertada nesta retoma.

## Próximos passos
- Portal separado: caixa WhatsApp (marcada só se granted E valid_for_current_number=true; versão visível);
  caixa email marcada para granted de qualquer versão; estados pending do request_access; Publish por Pedro.
- Texto whatsapp-v1 aguarda validação jurídica antes de qualquer Publish.
- Descadastro/«PARAR» por WhatsApp: modelo preparado, sem envios nem webhooks (a implementar quando decidido).
- Retomar após gate por conteúdo/CI: reparar três nomes0187, provar308semdivergências, aplicar coletor estrito, deploy somente portal+sync, provaLive e apresentar doisSQLs/Corro?. Nunca contar emailv2 como anúncios nem syncMeta manual.
- TikTok/Google, pixels e restante #332 fora desta etapa; coordenar #322 sem sobrepor.
- Pendências anteriores: fluxo parental verificável, PDF na primeira conclusão de perfil, link Fever, primeira revelação, fotos/aftermovies, benefícios a decidir. Early entry suspenso até validação MEO Arena.

## Factos que não se reinvestigam
Portal separado chama newgang-portal e portal-track; configuração no CRM. Sem totais de atrações; revelações obedecem club_at/public_at. Acesso por link pessoal; sem sorteio. Merch é produto e não prémio. Cache CRM até 60 s aceite; revelações expiram em public_at. Trackers do evento vêm do CRM, nunca do código. Descadastro chama handle-email-unsubscribe e grava supressão. Wallet cor por objeto não suportada, sem classes alternativas autorizadas.

## Onde ler
.lovable/memory/features/portal-newgangfestival.md; docs/specs/portal-newgangfestival.md; docs/testes/issue327/, issue328/, issue330/, issue332/.
