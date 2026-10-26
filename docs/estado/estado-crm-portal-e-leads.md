# ESTADO — MP CRM, Portal & Leads

Atualizado: 2026-10-24 · Issues: #251, #252, #321 (validada e publicada 16/10; Issue fechada pelo ChatGPT), #320 (P1 validado; fecho documental autorizado; Pedro fecha a Issue) · Fechadas: #253 (24/09), #254 (10/10) · Bloqueio: #62

## Em que pé está
Dois portais distintos, dois projetos Lovable, a mesma base Supabase:
- `mundopropicio.com` — projeto `26b95793-17b6-478c-a6e8-745c0cfb7ed9`.
- `coalafestival.pt` — projeto **Coala Portal** `bef9c59c-c2a4-453d-9aec-dae7d16c9171`.

A Early Bird 2027 do Coala está a captar em contínuo (`lead_capture`, origens `coala_hero_email` e `coala_early_bird`). Os emails do Coala saem pela API do Resend nos dois domínios verificados, `notify.coalafestival.pt` e `news.coalafestival.pt`, com chave única no segredo `RESEND_API_KEY_COALA`.

A 24/09/2026 foi resolvido o incidente que punha o ecrã "Algo correu mal" a 100% do tráfego pago da Meta (#253, fechada). A geolocalização do Coala passou a funcionar e o registo de erros de front está em produção.

## A trabalhar agora
**Ingestão de contactos #321 (D-ERP282)** — em Live desde 16/10: `crm_ingest_lead_captures` + cron 2398 (5 min), sem CAPI nem rede; leads `blocked_no_consent`. MP (portal) e Coala, e desde 16/10 00:38 também `clube_newgang` (MP) em contínuo (migrações 0168/0169): marcar processada dispara o fluxo normal do Clube (membro + email de confirmação uma vez). 2 casos Clube anteriores feitos por ID (0167). Fora de âmbito já não bloqueia o lote. Provas: `docs/testes/issue321/01-…`, `04-…`, `06-clube-continuo.md`. Email `sent` = aceite pelo envio, entrega não comprovada. Desde 16/10 ~00:55 o welcome tem reserva atómica por membro antes do envio (0170/0171; `08-welcome-reserva-live.md`) — fecha o risco de duplicado em concorrência. Validada e publicada em 16/10 (CI run 38831811638, SHA 2130204b…; `09-fecho-documental.md`). Consentimento P2/P3 e retoma CAPI NÃO concluídos — proposta em `docs/features/proposta-p2-p3-consentimento.md` (não aprovada).

**CAPI P1 no ERP (#320, D-ERP281)** — aplicado em Live e validado independentemente; fecho documental autorizado pelo Pedro a 15/10/2026, 23:49 UTC. CI confirmada independentemente pelo Claude e ChatGPT via conector GitHub: https://github.com/pedrompropicio/mundopropicio/actions/runs/38824514063, job `quality` `116728694956`, conclusion `success`, SHA `7b151756ad8060019de571b9295a6a978e0fbb1e` (confirmado no checkout do log). Prova consolidada: `docs/testes/issue320/07-fecho-documental-ci.md`. Diagnóstico sensível removido confirmado por leitura; 11 corpos SQL repo × Live iguais, grants anon/authenticated false e service_role true; sent_n 29550 e hash `b1738fd8ecdd96d7c54466ad7c81e112` preservados. Isto fecha apenas P1, não o projeto CAPI.

**CAPI continua suspenso:** `capi_dispatch_control.suspended=true`, crons 33/34/44/45 ausentes, ticks SQL desactivados, sem retoma automática. A ingestão `lead_capture` → contacts/leads foi retomada pela #321 (fora da CAPI, incluindo o Clube); `redirect_log` continua suspenso. #320 e #321 estão fechadas. **#322 (em curso):** etapa ERP aplicada em Live a 16/10/2026 01:20 UTC — ledger de consentimento por interação, `portal-track kind=consent`, vínculo em lead_capture/redirect_log/leads e `capi_consent_proof` com validação dupla (ver `docs/features/consentimento-marketing-322.md`). Correção após verificação independente aplicada a 16/10 01:44 UTC (0175: revisão do servidor, recibo por decisão, política vigente, sanitização por parâmetro, guarda sob lock). Portais MP/Coala/Newgang ainda NÃO integrados, por isso nenhum registo novo tem prova. Retoma CAPI depende de autorização própria. Detalhe em `docs/features/capi-p1-erp.md`.

**Portal newgangfestival.pt e Clube Newgang (#306, #308, envios à lista)** — passaram para o chat `newgang-portal` (estado em `docs/estado/estado-newgang-portal.md`).

**Risco registado:** a policy `lead_capture_public_insert` (anon insert em `lead_capture`) mantém-se; não foi alterada neste pedido.

## Próximo passo concreto
1. **Pedro no ERP** — artes do evento + `portal_visible = true`: activa a página do evento, a vista de trackers e dispensa o fallback do pixel no Clube.
2. **Audience — Google** — evento derivado `ng27_clube_inscricao` no GA4 e importação no Google Ads.

## Bloqueios
- **CAPI após P1** — suspenso. #322 ERP corrigido (aguarda revisão); faltam os 3 portais e guardas específicas Lead/InitiateCheckout antes de qualquer retoma.
- **#62** (frente Google) — os leads do CRM não alimentam o Google Ads.

## Factos que não se reinvestigam
- **Armadilha de nomenclatura:** o schema `crm.*` na BD pertence ao **MP Audience**, não ao módulo MP CRM.
- **`coalafestival.pt` é servido pelo projeto `bef9c59c-…`, não pelo `26b95793-…`.** A empresa servida vem de `VITE_PORTAL_COMPANY_ID`; Coala = `7d831e59-6e82-427b-95a0-64904aae5dd2`.
- **Os anúncios da Meta mandam `utm_campaign`/`utm_content`/`utm_term` como NÚMEROS puros** (IDs de campanha, conjunto e anúncio). O TanStack Router converte-os em `number` ao interpretar a query string. Qualquer `validateSearch` que exija `z.string()` rebenta com 100% do tráfego pago. Ver D-ERP142.
- **O ecrã "Algo correu mal" é o `errorComponent` da raiz do portal** (`src/routes/__root.tsx`), nunca uma página do Instagram. Se aparece, a nossa aplicação carregou e rebentou depois.
- **A raiz `/` não redirecciona no servidor:** devolve 200 e a ida para `/pt` é navegação do cliente. Desde 23/09 o idioma é decidido localmente, sem ida à rede — mas o salto continua a custar uma navegação. Por isso o tráfego pago aponta directamente a `/pt`.
- **Erros de front ficam em `public.portal_error_log`** — `anon` com INSERT e sem SELECT, mesmo molde do `lead_capture`. Foi esta tabela que deu a causa do #253 à primeira consulta.
- **Um Publish pode não assentar:** a 24/09 o primeiro Publish do Coala serviu HTML novo com os ficheiros JS a devolverem **503** (CSS a 200). O segundo resolveu. Confirmar sempre um Publish por dois sinais — o comportamento em produção e o registo — nunca por ter carregado no botão.
- A `geo-lookup` tem allowlist de Origin. Até 24/09 só aceitava `mundopropicio.com`: o Coala levou 403 em silêncio e perdeu geolocalização em 920 captações de setembro, que não se recuperam.
- O `SITE_URL` do Coala Portal ainda aponta para `coalafestival.lovable.app`: `canonical` e `og:url` errados (#251).
- Atribuição cross-domain portal→bilheteira: `_fbc`/`_fbp`/`fbclid` só podem ser criados ou guardados **depois** de consentimento marketing confirmado pelo servidor (#322). A regra antiga ("criar `_fbc` antes do consentimento") fica anulada.
- **Magic link cross-project não funciona** — o Lovable Auth sobrescreve `redirect_to` para o Published URL do projeto dono.
- DNS de `mundopropicio.com` na Cloudflare (plano free); nameservers `bayan`/`ollie.ns.cloudflare.com`.

## Onde ler mais
- `docs/handoffs/` — analise-critica-portal-2026-08-12, plano-conversao-portal-2026-08-12



## 13/10/2026 — D-ERP268
Menu MP CRM: Clube/Site Newgang gated por company_features. Filtro de listas dos Contactos passa a incluir origens. Sementeira das chaves na MP pendente de OK.

**Rasto do incidente #320.** O diagnóstico sensível foi removido na etapa anterior, com deploy da função sem Publish. Os `.txt` citados eram ignorados pelo Git e não serviam de prova versionada; foram substituídos pelas provas Markdown `06-tsgo.md`, `06-vitest.md` e `06-build.md`, verificadas no commit validado. A pendência de CI foi resolvida pela confirmação independente acima. Neste fecho só mudou documentação, sem testes repetidos, deploy, Publish, envios ou alterações a SQL, dados, fila, consentimento, crons ou configurações.

## 18/10/2026 — CRM Newgang lista/WhatsApp
0196/0197 oficiais aplicadas sem Publish; uma linha por email normalizado, submissions/member_no/confirmed_at, agregados primeira captura. WhatsApp perfil→CRM última decisão, origem/guard/eligibilidade/exportações e audiências CRM. Prova docs/testes/newgang-crm-whatsapp/entrega.md;17SQL/1435VitestPASS/buildOK/Chromium real. Live344pessoas/411capturas/0duplicados. Backfill NÃO executado: preview66contactos/62ativações/65ajustes; aguarda Sim específico e preview atualizada. Reserva libertada no fecho. CI final/sincronização não observadas; Meta/portal/inscrição/pontos/crons/envios intocados.

### Continuação autorizada 18/10/2026 14:05 UTC
Pendência anterior superada: backfill consentimento executado byte-exato após preview67/62ativações/0revogações/65ajustes.67perfiltrue/0revogadostrue.0198oficial:projeção telefone no ledger e UPDATEphone membro; fingerprints/ACL preservados.62telefonescopiados,3iguais,2já pertencem a outros contactos preservados;65elegíveis/2inelegíveis(membros56,283).26legadosNewgang/hash iguais antes/depois do telefone; não comprovamos29legados históricos intactos pois a contagem atual é26. Prova docs/testes/newgang-crm-whatsapp/telefone-backfill-entrega.md.1444testesPASS/buildOK. SemPublish/deploy/crons/envios/Meta/portal/pontos. Reserva libertada; sincronização/CI final não observadas.

## 23/10/2026 — CRM Newgang: cidade estimada no resumo "Por cidade"
- `clube_newgang_summary` (migração 0236, CREATE OR REPLACE com guarda md5 f5d46cba…): declarada manda; sem declarada entra a estimada por IP (PT/BR, DB-IP "Lisbon" → Lisboa). Itens de by_city com k, n, n_declarada, n_estimada. Ecrã: toque/rato mostra "X declaradas · Y estimadas (IP)"; rodapé com atribuição DB-IP. Sem DML, sem Publish.
- Inalterados: clube_newgang_list (md5 7d2e640e… antes = depois), CSV, filtros, audiências, anúncios (D-ERP300).
- Prova Live por SELECT (11:05 → 11:07 UTC; MP; 8 811 pessoas): "(sem cidade)" 6 964 → 537; Lisboa declarada 692, estimada 803 (contagem por texto, sem a normalização de municípios, que o leitor não pode executar). md5 resumo depois 542420d6….

## 24/10/2026 — Lembrete de confirmação Clube Newgang: feito

Origem: medições do 0·Cowork por query em Live, comunicadas pelo Pedro a 24/10/2026, 18:19 UTC. Este fecho R0 transcreve essas medições; não repetiu queries nem envios.

Migração 0239 e `newgang-portal` já implantadas, incluindo o rodapé com Mundo Propício e Newgang Produções. Pedro confirmou receção do teste e que o botão abriu a página de confirmação. Dry_run e teste executados pelo 0·Cowork via `net.http_post` com a chave do cofre, sem exposição da chave.

### Disparo e resultado
- Canário às 16:45 UTC: 300 enviados, 0 falhas, 0 supressões novas; 28 confirmações em cerca de 1 h.
- Tentativa de 500 às 17:42 UTC: falha ANTES de reservar/enviar (502, erro http2), causada pelos 500 IDs na URL da busca em `club_members`. Nenhuma reserva nem e-mail desse lote.
- Lotes às 17:50, 17:56, 18:02, 18:09 e 18:15 UTC: até 300 por lote; último com 174 candidatos; todos com 0 falhas.
- Total real: **1.674 reservas** (`test=false`), todas `enqueued`, mais **1 reserva de teste**. `email_send_log`: **0 failed/dlq** do envio real; **0 supressões novas**.
- Consulta às **18:19 UTC**: **64 confirmações desde as 16:44 UTC**; **1.910 ainda por confirmar**. Não atribuir todas as confirmações ao lembrete nem inferir taxa de queixas a partir de supressões.

### Exclusões deliberadas
- 5 suprimidos.
- 234 com menos de 48 h na altura: podem tornar-se elegíveis com o tempo; reavaliação posterior apenas por decisão do Pedro, sem envio automático.
- 15 com boas-vindas encravada (`welcome_not_sent`).
- 2 sem registo de boas-vindas (`welcome_none`). Os IDs completos da resposta original do dry_run não estão disponíveis neste fecho; não reproduzimos o prefixo/identificador incerto indicado na mensagem. Recuperar os IDs exclusivamente dessa resposta, sem inventar nem executar nova ação de lembrete.

### Lições e pendências
- `process-email-queue` descarta sem enviar uma mensagem cujo `message_id` já tenha uma linha `sent` em `email_send_log`. No reteste do membro 9528, o 0·Cowork renomeou a linha `sent` antiga para `...-teste1` e apagou a `pending` órfã. Rasto em `docs/testes/newgang-lembrete/passo4a-teste-20261024.md`; não é procedimento automático para repetir lembretes.
- A Resend devolve `409 invalid_idempotent_request` durante 24 h ao reutilizar a chave de idempotência com corpo diferente. O reteste exigiu mudar a chave da mensagem na fila para `...-t2`. Não se aplica ao envio em massa descrito: uma chave por membro, corpo sem mudança.
- Limite operacional provado: **300** enquanto os IDs forem na URL. O código ainda permite 500; **Issue [#356](https://github.com/pedrompropicio/mundopropicio/issues/356), P2 · MP-CRM · R1**, para partir a busca em blocos ou limitar `limit`. Nenhuma correção de código neste fecho.
- Decisão do Pedro: um único lembrete por membro, `message_id` canónico `ng-reminder-<member_id>`; excluídos por menos de 48 h são reavaliados depois por decisão do Pedro (D-ERP306).
- Demanda de envio concluída; reserva removida do QUADRO. Pendências separadas: #356, reavaliação dos recentes por decisão do Pedro e recuperação dos dois IDs completos da resposta original do dry_run.

Fecho apenas em `docs/` e abertura da Issue: sem deploy, DDL, DML, crons, Publish, envios ou chamadas às ações do lembrete.

## 26/10/2026 — Clube Newgang: apagamento a pedido (R2 passo 4, #368): feito
- Migração `0263_newgang_erasure_on_request.sql` (cópia em `supabase/manual/`). RPC `club_member_erase(member_id, reason='erasure_request', dry_run=true, run_id)` — só service_role, SECURITY DEFINER, idempotente por `club_members.erased_at`.
- Apaga nome, email (passa a `erased+<id>@invalid`), telemóvel, redes sociais, sessões, passes Wallet, tokens de descadastro, perfil demográfico, provas de missões; elimina o contacto ligado (se não partilhado). Pontos e missões ficam anónimos. `email_send_log.recipient_email` passa a `sha256:<hex>`.
- Revoga email, WhatsApp e anúncios nos históricos append-only (#332). Supressão só por hash: `suppressed_emails.email='sha256:<hex>'`, reason `erasure_request` (+ marcador). Remove a supressão em claro.
- Prova em `club_retention_log` (run_id, old_member_id, email_sha256, reason, tables_affected com contagens), sem dados pessoais, fechada a anon/authenticated.
- Integração: (a) cancelamento pelo membro — `newgang-portal` ação `erase_account` com sessão; real só com `dry_run:false` e `confirm:"APAGAR"` (botão no portal Newgang por fazer, no projeto do portal); (b) pedido manual da equipa — chamada service_role à RPC (sem ecrã CRM).
- `process-email-queue` e `send-transactional-email` passam a respeitar também a supressão por hash.
- Rotina 30/36 meses, reconfirmação e cron: adiadas para 2028 (decisão do Pedro 26/10).
- Em aberto: `leads`/`lead_capture` com o mesmo email não são apagados; ficheiros de prova no storage e o objeto Google Wallet não são removidos; reinscrição futura do mesmo email fica suprimida pelo hash.

## 26/10/2026 — Clube Newgang: rodapé legal e cancelamento (#367, R1): pronto para Publish
- Novo `supabase/functions/newgang-portal/legal-footer.ts` (pt-PT): «Responsável pelo tratamento: Mundo Propício Unipessoal, Lda · NIPC 515274291», «Rua Prista Monteiro 13B, 1600-792 Lisboa, Portugal · geral@mundopropicio.com», «Política de Privacidade» (`https://mundopropicio.com/pt/privacidade`, static_pages `privacidade` publicada, HTTP 200; `/privacidade` dá 404) e «Cancelar a subscrição».
- Razão social/NIPC conferidos na BD (`companies.legal_name` «Mundo Propício Unipessoal, Lda», `tax_id` 515274291). BD sem morada; `contact_email` na BD é adm@ — usado geral@ por indicação do Pedro.
- Lembrete e boas-vindas: aviso + logos mantidos, bloco legal acrescentado, cancelar mantido; List-Unsubscribe/One-Click já eram enviados pela fila (`unsubscribe_http_url` → `handle-email-unsubscribe?token=`), não duplicados.
- Acesso (link de login, transacional): sem cancelar e sem `unsubscribe_http_url`; só identificação + política.
- Testes: `src/test/newgang-legal-footer-367.test.ts` 5/5; Deno newgang-portal 36/36 (impressão digital das boas-vindas atualizada); tsgo limpo. Sem deploy (R2 pendente: `newgang-portal`), DDL/DML, envios ou Publish. Fila e consentimento intocados.

## 26/10/2026 12:15 UTC — Clube Newgang: deploy R2 `newgang-portal` (#367 + #368)
- HEAD `528045832bf4859f16a018e7b636028856e48159` limpo; vitest Newgang 138/138, Deno newgang-portal 36/36.
- Deploy só de `newgang-portal`; source_sha256 `0befaa8734eee708b8fe44bad8f6da87998f0443ee6260141c14c0a4ded92d5b`. Sem Publish, crons, DDL/DML ou envios.
- Pós-checks: POST `erase_account` sem sessão → 401 `no_session`; lembrete renderizado localmente (destinatário fictício) traz o bloco legal novo + cancelar; `process-email-queue` mantém `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- Decisões do Pedro: manter geral@; boas-vindas = email do Clube. Morada em `companies`: SQL em `supabase/manual/dml_367_companies_morada.sql`, por aprovar.

## 26/10/2026 12:25 UTC — #368 fase 2 (plano aprovado): preparado, 0264 NÃO aplicada
- `supabase/manual/0264_newgang_erasure_leads_resubscribe.sql` + rollback: leads de todos os módulos (lead_capture, contacts por email, leads por contact_id, coala_invites, coala_list_consents, fever_buyers, meta_audience_upload_members, vip_coupon_email_log) anonimizadas; reinscrição com email-v3/granted/signup limpa só `sha256:` reason erasure_request; log `resubscribe_clear` sem PII.
- `newgang-portal`: `erase-extras.ts` remove provas do membro no storage e expira o objeto Google Wallet (PATCH state=EXPIRED, credenciais já existentes); falhas não bloqueiam o apagamento.
- Testes: PGlite 0264 6/6 + 0263 8/8; Deno newgang-portal 39/39; tsgo limpo. Morada: `dml_367_companies_morada.sql` corrigido para jsonb (por aprovar).

## 26/10/2026 12:35 UTC — #368 fase 2: 0264 aplicada em Live
- Âmbito (Pedro 26/10): só tabelas MP da empresa do membro: lead_capture, leads (contact_id), contacts, meta_audience_upload_members e vip_coupon_email_log (154/154 linhas com event_id de eventos MP, filtrado por events.company_id). Fora: coala_invites, coala_list_consents, fever_buyers.
- Live: club_member_erase md5 609468632a78ad279cf7948471cc0fc6 → 6ddc2309343bc293a0a1a24c4994ffd3; _club368_resubscribe_clear md5 12c089f1993141addeff4761f1a21030; ambas SECURITY DEFINER, search_path public,pg_temp; EXECUTE só postgres/service_role/papel sandbox da plataforma (sem PUBLIC/anon/authenticated); trigger club368_resubscribe_clear ativo; CHECK do log com resubscribe_clear.
- Teste Live (transação desfeita, dados @exemplo.invalid): dry_run → erased → already_erased; lead_capture com email/nome/telefone NULL e raw só {utm}; contacto anonimizado (consent_whatsapp false, sem fonte), lead mantida sem user_agent; supressão hash 1; reinscrição sem consentimento novo 1, com signup 0; log 2 linhas; filas email +0, pg_net +0 (trigger WhatsApp não enfileirou nada).
- Contagens antes/depois: club_members 10542/10543, lead_capture 15689/15690, contacts 35693/35694 (+1 inscrição real «formulario»/«clube_newgang» no intervalo; 0 linhas de teste), suppressed_emails 31/31, club_retention_log 0/0.
- newgang-portal (storage+Wallet): sem deploy deliberado; último deploy 12:15 (sha256 0befaa87…d92d5b) é anterior ao código novo; não é possível ler o código publicado para confirmar se houve auto-deploy. Deploy aguarda «Sim».
- 26/10 12:41 UTC — deploy deliberado («Sim» do Pedro) só de newgang-portal, source_sha256 `128314d18acdcd767898011ebe6c0c637eb81c7d4c4c610ba27f969284cc7575`: ativa storage+Wallet no apagamento real. Verificado: erase_account sem sessão 401 no_session; dry_run Live desfeito (membro fictício) status dry_run, storage +0, pg_net +0, log +0 (o gate real=dry_run:false+confirm:APAGAR impede storage/Wallet). Contrato: sucesso 200 {status:"erased",dry_run:false}; já apagado 200 {status:"already_erased",dry_run:false}; simulação 200 {status:"dry_run",dry_run:true}; sem sessão 401 {error:"no_session"}; origem 403 {error:"origin"}; RPC falha 500 {error:"internal"}. Falha de storage/Wallet NÃO muda a resposta (200 erased, só no log da função) — lacuna em aberto.
- Morada e credenciais: não aplicadas (Pedro trata à parte).
