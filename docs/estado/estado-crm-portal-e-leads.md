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
