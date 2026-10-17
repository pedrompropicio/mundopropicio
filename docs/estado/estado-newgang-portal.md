# ESTADO — newgang-portal (portal newgangfestival.pt)

Atualizado: 2026-10-17 · Decisões: D-ERP256, D-ERP257, D-ERP262, D-ERP269, D-ERP270, D-ERP271, D-ERP272, D-ERP273, D-ERP274, D-ERP275, D-ERP277

## Em que pé está
- Portal newgangfestival.pt publicado; versão6fb61d2 confirmada pelo Pedro nesta sessão.
- #327: configuração2027-v1 ativa confirmada porSELECT17/10: inscrição100, indicação75/cap750, Crew100, níveisGang0/Crew750/Goat3000, comprasindisponíveis; direitosadquiridospreservados.
- #328: correções identidade/concorrência/pendênciaCrew aplicadas anteriormente; não alteradas nesta tarefa.
- #330: profile-v1 ATIVADA por autorizaçãoespecíficaPedro. SELECT17/10 às01:20:03UTC: enabledtrue/50; site/bundleHTTP200 availabletrue/points50; countries249. Crédito apenasna confirmação explícita futura,1×adesão/site.
- Ativação não criouperfil ou retrocrédito: snapshotsna mesma transação/site-lock preservaramledger27/2750/hash10ec45aea047074dfbda903436e7edf4, perfis0/créditos330zero. São números dessa execução, não contagens permanentes.
- PostgreSQLlocal59/59, handlerreal9/9, CRM7/7 nesta sessão; CIbaselineb764d45bsuccess. SemE2EautenticadoLive nemPublish/deploy/códigoalterado nesta ativação.
- WhatsAppadapter_pending; abaixo13 parental_flow_required, sempersistênciaparcial. Nenhumconsentimentoinventado oualteração#322/CAPI/portal-track.
- Provasatuais: docs/testes/issue330/ativacao-profile-v1.md e.json; infraestrutura0179 e seed249 não reaplicados.
- Cachepública e leiturasopcionaisperfil mantêm isolamento; dadosprivadossóme. Falhasopcionaisnão transformam401emfallback.

## Histórico — atualização dos níveis e marcas (16/10/2026)
- Rodapé -15% implementado no portal; Pedro informou Publish feito. NG/Fever 20,4 px, MP 28,9 px.
- Live: Gang 0, Crew 500, Goat 1500, confirmado por SELECT e API pública action site HTTP200 depois do DML aprovado. IDs, limites e benefícios preservados por hash antes/depois.
- Criativos Crew/Goat aprovados por Pedro, publicados 1032×336; HTTP200/SHA e visual verificados independentemente. Wallet aceita novos nomes e legados, flag true, função newgang-portal deployada pelo agente; commit c65036cdd4d3e35bd4702b119595f030544037c2. Sem Publish frontend nesta etapa; dados não dependem de novo Publish do portal.
- Agente reportou 1248 testes aprovados, tsgo limpo; CI não confirmada independentemente. GET /meu-clube deu 403 neste ambiente; visual no portal/dispositivo Wallet pendente. Sync existente */10 previsto, sem PATCH manual.
- Referência textual do benefício Goat corrigida em Live após autorização específica de Pedro (16/10 00:24 Fortaleza): “Tudo de Crew + acesso antecipado à merch oficial + prémios de topo do ranking”. SELECT posterior confirma Gang/Crew/Goat e limites 0/500/1500; nenhum benefício funcional alterado.
- Pedro determinou execução Lovable no próprio chat do Portal. Regra registada no QUADRO; consolidação em CHATS/DECISIONS/PROC aguarda reserva #323. Issue da demanda recusada por revisão automática.
- Prova: docs/testes/newgang-niveis/01-wallet-crew-goat.md (Etapa 3). SQL PENDENTE já aplicado por ChatGPT: não reaplicar.

## Histórico — plano de lançamento do Clube — segunda-feira 19/10/2026
- Plano e documentação aprovados pelo Pedro; retomar na próxima sessão, sem implementação agora. Issue principal #324; #325 convite/Crew/instruções móveis; #326 bateria com membros fictícios e isolamento/egress bloqueado; #327 pontuações, conquistas e automação gradual.
- Prioridade: missões simples verificáveis, instruções por toque e histórico/progresso. Redes sociais, compras indicadas e desafios entram só após checagem real e bateria validada. Pontuações/novos critérios ainda provisórios; não aplicar nem bloquear níveis com divulgação indisponível.
- Próximo passo: fechar valores/regras de transição e isolamento dos testes; depois Pedro designa executor e autoriza âmbito concreto. Só há Live; nenhum utilizador fictício criado, nenhum ponto alterado, nenhum envio/OAuth/Publish realizado por este plano.
- Verificação visual do Publish dos níveis: Pedro informou “Verificação ok” nesta sessão. GET direto do ambiente continuou 403; API Gang/Crew/Goat já confirmada independentemente. Visual Wallet no dispositivo não inferido desta confirmação.
- Caso de indicação analisado por leitura: Crew com2 confirmados, bónus coletivo ainda não devido; inscrição do convidado sem vínculo de indicação. Solução geral em #325; eventual reparação individual depende de confirmação e SQL próprios. Dados pessoais não publicados nas Issues.

## Etapa SQL local concluída — 16/10 16:00 UTC
- Commits c934f74899bd09fc12435ab3777f1a618ecda4ee e ae49b380788c4cf6bc62ac3b30b08c35c711178f. PostgreSQL17.9 efémero, migrações reais e fixtures:64 asserções seriais e17 registos de concorrência/barreiras. Provas docs/testes/issue326/. Runner interrompe divergências de hash; negativos comprovados.
- Revisão independente de código/provas e SELECT das14 hashes; execução PostgreSQL feita pelo agente, não repetida pelo ChatGPT. Sem escrita Live/efeitos externos. Falhas e soluções #328; repetição de bónus Crew #327. API/RLS/E2E incluindo SSR e CI pendentes; #326 permanece aberta.
- Frontend anterior publicado segundo Pedro às12:43 Fortaleza; GET público403 neste ambiente impede confirmar versão independentemente. Autorização expressa de13:07 cobre republicação integral deste estado e QUADRO preservando restante conteúdo; não altera revisão automática da plataforma.

## Primeira etapa implementada — 16/10, sessão 12:02–12:41 Fortaleza
- #325/#326 parciais: convite Crew+ref do membro que partilha, preservação do par mesmo sem localStorage, ajuda móvel por toque, fixtures locais e bloqueio de rede reforçado. Commit portal `4df23d3238d3219a78455d40b0ddb5914217c15f`. Sem Publish, alteração Live ou novas pontuações/níveis.
- Provas versionadas lidas no commit:108 testes em14 ficheiros (baseline86), prova negativa do guard perante tentativa de rede com erro capturado. Leitura independente de código/diff e9 verificações do helper executadas por ChatGPT: aprovadas. Typecheck/build reportados pelo agente; CI ainda não confirmada independentemente.
- Capturas móveis/desktop com fixtures verificadas pelo agente. SSR do preview leu dados públicos: não representa E2E zero-egress. RPCs reais, motor de pontos, concorrência, E2E incluindo SSR e limite de bónus por edição continuam pendentes. #327: valores e regras de transição por fechar. Nenhuma nova integração social ativada.
- Issues #324–#326 atualizadas e abertas. Tentativas de reserva/fecho do QUADRO e deste estado foram bloqueadas pela revisão automática; Pedro autorizou expressamente gravar os ficheiros completos preservando o restante conteúdo às12:41. Autorização apenas documental; sem reserva ativa desta etapa, sem transferência #322/#323.
- Próximo passo: definir pontuações/transição e preparar verificação integrada isolada; não publicar esta etapa antes das verificações pendentes e decisão do Pedro.

## A trabalhar agora
- Nenhuma execução ativa #330: configuração ativada/verificada, reserva libertada. A confirmação real de perfil pelo membro não foi testada emLive nesta tarefa.
- #332 audiênciasNewgang: pedido recebido noQUADRO, executor a designar; não assumido nem executado.

Vídeos das edições por ficheiro (D-ERP277, 15/10): bucket, CRM e contrato `history` prontos; edge function newgang-portal e CRM por publicar; o site tem de tocar `provider:"upload"` (<video src=url poster=poster_url||cover_url>).

Criativos Google Wallet aplicados: quatro originais carregados e verificados, URLs ativos, função deployada. Classe existente e cartão de teste nº 3 atualizados e lidos na Google; 12/12 testes Wallet e suite completa 1.127 passed, 1 skipped, 11 todo, sem falhas. Pendentes: confirmação visual no dispositivo e decisão sobre cores (LoyaltyObject não suporta cor por membro).

## Próximo passo concreto
1. Link da Fever no CRM (`events.ticketing_url` vazio).
2. Primeira revelação do line-up.
3. Alargar os benefícios dos níveis (ensaios dos artistas, meet & greet) — Pedro.

## Bloqueios
- Wallet: Google ignora `hexBackgroundColor` em LoyaltyObject; só permite cor na classe Loyalty (única por decisão) ou em GenericObject. Não criadas classes alternativas. Confirmar no dispositivo o cartão nº 3; link anterior usa o mesmo objeto, novo link gerado HTTP 200 (pedido 202017).
- Fotos 2023 Porto e 2025; aftermovies 2024 e 2025 — equipa/Newgang Produções.
- Early entry dos Lenda no festival: suspenso até validação com a MEO Arena.
- Plano Resend antes de 03/11 — plataforma-e-infra.

## Factos que não se reinvestigam
- Sem contagens de atrações (nenhuma resposta da API traz totais).
- Cada revelação tem `club_at` (o Clube vê primeiro) e `public_at` (todos), com `public_at >= club_at`.
- A história é ordenada por ordem ascendente.
- Sem sorteio.
- O acesso ao Clube é por link pessoal (sem password).
- Os ids de pixel nunca ficam no código: vêm do CRM (`portal_sites` / `event_trackers`).
- Nas campanhas Google Newgang, a meta é só "NG27 - Inscrição Clube", para não contar a dobrar com o upload "offline (upload)".
- Alterações no CRM do site demoram até 60 s a aparecer no portal (cache); as revelações não esperam (expiração em public_at).
- Merch oficial é produto à venda, não prémio; membros têm acesso antecipado.

## Clube Newgang no portal MP (mundopropicio.com)
Conteúdo movido de `estado-crm-portal-e-leads.md` a 13/10 (D-ERP262).

- **Página `/pt/newgang-festival-2027/clube` (#306, fases 1–3 publicadas a 11/10)** — standalone com a identidade do festival (logo oficial, Anton/Barlow Condensed); serve `mundopropicio.com`. Formulário: nome\*, email\*, telemóvel, e data de nascimento/cidade/código postal no `raw` de `lead_capture`. Fonte `clube_newgang`. Confirmação com partilha. Assinatura Newgang Produções + Mundo Propício + Fever. As inscrições desta página (source `clube_newgang`) também criam membros do Clube pelo trigger. A página vai ter redireção 301 para `newgangfestival.pt/clube` (F3).
- **Captação** pela edge function `portal-track`, com `company_id` definido no servidor a partir do Origin já validado — linhas novas nunca nascem órfãs. Detalhe de IP/geo em `estado-plataforma-e-infra.md` e `.lovable/memory/features/ip-geo-cache.md`.
- **Pixels:** Meta Lead (pixel do evento em `events.meta_pixel_id`); TikTok ViewContent + CompleteRegistration (pixel `DB5VO83C77U5NP31S1P0`, só com consentimento de marketing, `event_id` = `client_event_id`); GA4 `sign_up` `{event_slug, method}` no dataLayer.
- **Trackers** lidos de `public.event_trackers_public` (D-ERP251), com fallback no Clube enquanto o evento estiver `portal_visible = false`. TikTok ViewContent/InitiateCheckout também nas páginas de evento com tracker — o InitiateCheckout leva o `client_event_id` da `portal-track`, para dedupe futura com a CAPI TikTok.
- **Envios à lista (12/10)** — `process-email-queue` encaminha `news.newgangfestival.pt` pelo Resend com o segredo `RESEND_API_KEY_NEWGANG` (deploy feito; segredo ainda por colar pelo Pedro). Migração `0117_derp256_enqueue_email_batch.sql`: `enqueue_email_batch(queue, payloads jsonb[], batch_size=5000, interval_minutes=50)` (só service_role) enfileira listas grandes em lotes com atraso pgmq, e o `queued_at` = momento visível, para o TTL de 60 min não expirar mensagens. Email de teste (from "Clube Newgang <clube@news.newgangfestival.pt>", purpose marketing, com unsubscribe) pendente do segredo e do domínio Verified no Resend. Fase 4 da #306 (email de boas-vindas pelo Resend) pendente: texto a definir pelo Pedro.
- **Acompanhamento no MP CRM (#308, P1 até 02/11)** — construído a 12/10, aguarda Publish. Página `/crm/clube-newgang` no menu do MP CRM: cartões total/hoje/7 dias + barra da meta 15.000 até 02/11, agregados por dia/cidade/UTM/faixa etária (hora de Lisboa), tabela paginada com pesquisa e consentimentos, export CSV formato Fever da base completa. Migração `0111_derp252_clube_newgang_crm.sql`: RPCs SECURITY DEFINER `clube_newgang_summary` e `clube_newgang_list` (anon sem acesso; papéis admin/platform_admin/marketing_manager/content_manager; filtro à empresa ativa). Formato da data de nascimento confirmado AAAA-MM-DD (o portal valida antes de gravar no raw). Pendentes: Publish do #308; confirmar com a Fever se os consentimentos no CSV devem ser "sim"/"não" ou true/false.

- 13/10/2026: "me" passou a devolver `history` (extrato de pontos; soma = points; sem emails; anulações negativas). Deployado; frontend do portal ainda não o mostra.

- 13/10/2026 (D-ERP273): anulações de pontos ficam no histórico (linhas void com motivo, reaprovação = geração #N); botão "Anular pontos" no CRM. Função deployada; frontend por publicar.

- 14/10/2026 (D-ERP274): Crews (criar/entrar/sair, crew completa = 4 confirmados → 200 pts a cada um, máx 6, link ?crew=). Função deployada; CRM Clube → Crews por publicar; ecrã no portal por fazer.

- 14/10/2026 (D-ERP275): Google Wallet fase 1 — função e cron prontos. Issuer ID 3388000000023216419 (secret GOOGLE_WALLET_ISSUER_ID; GET /issuer devolve vazio para a conta de serviço, por isso vem do secret; diagnóstico wallet_issuer retirado). Classe 3388000000023216419.newgang_clube_2027 e objeto do membro de teste nº 3 (wallet-teste@newgangfestival.pt, confirmado, 100 pts, Gang) criados sem erro; save_url de teste gerado (HTTP 200). Por fazer: Apple Wallet, publicação na Google (sair de demo) e botão no portal.

## Onde ler mais
- 14/10/2026, 02:02 UTC (adenda D-ERP275): PNG originais em `test-artifacts/newgang/wallet/`, HTTP 200 e SHA-256 idênticos. URLs ativos, função deployada; PATCH classe existente com programLogo + UNDER_REVIEW (exigência da Google após 400 no primeiro envio), objeto nº 3 com hero Gang. GET Google confirma logo/hero/100 pontos/Gang/evento/QR; cor por objeto ignorada (limitação oficial). Sync continua a selecionar pontos OU nível; sem migração ou alteração de pontos. Novo save_url HTTP 200 (pedido 202017). 12/12 testes passaram, compilação automática OK; CI remoto não verificado. Não precisa de Publish do frontend; botão no projeto do portal continua por implementar/publicar e sair de demo exige aprovação Google. Visual na Wallet ainda por confirmar no dispositivo do Pedro.
- `docs/specs/portal-newgangfestival.md`
- `docs/handoffs/2026-10-13-newgang-portal.md`
