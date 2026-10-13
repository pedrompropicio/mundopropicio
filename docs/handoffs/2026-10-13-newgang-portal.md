# HANDOFF — Portal newgangfestival.pt → chat `newgang-portal`

Data: 13/10/2026, ~06:15 UTC · Autor: Cowork (sessão de construção do portal, 12–13/10) · Para: chat novo `newgang-portal`
Números consultados na BD Live a 13/10 ~06:00 UTC, salvo indicação.

---

## 1. Porque existe este chat

O portal do Newgang Festival 2027 é um **projeto Lovable separado** (como o Portal Coala) e vai ter vida própria até ao festival (25/03/2027). Inclui revelações semanais do line-up, o Clube com pontos e convites, campanhas pagas a apontar para `/clube`, emails e bilhetes Fever. Antes, este tema estava espalhado por `crm-portal-e-leads`, `audience-meta` e `audience-google`. Este chat passa a ser o dono, à imagem do `coala-portal`.

**Pertence aqui:**
- o site newgangfestival.pt (código, páginas, /teste);
- a API `newgang-portal` e o ecrã `/crm/sites/newgang`;
- o Clube Newgang (membros, pontos, níveis, prémios, palpites, "eu estive lá");
- line-up e revelações;
- a história das edições;
- os emails do Clube;
- o tracking do site (consentimento, pixels, GTM).

**Não pertence aqui:**
- Regras gerais de leads/contactos/portal MP → `crm-portal-e-leads`
- Campanhas Meta (criativos, públicos, orçamentos) → `audience-meta`
- Google Ads, enqueue e upload de conversões (#62) → `audience-google`
- BP e verbas do Newgang 2027 → `bp-newgang-2027` (se existir) / `bp-verbas-e-rateio`
- Bilheteira Fever e sync de vendas → `ticketing-e-receita`
- Email (Resend, domínio, plano), DNS, permissões → `plataforma-e-infra`

**Regra:** um bug ou regra nova fora do âmbito vira Issue na frente respetiva.

---

## 2. Identificadores

| O quê | Valor |
|---|---|
| Site (Lovable) | projeto `1a915f50-55ca-4bb6-9abe-8f241c54647a` "Newgang Fest Portal", workspace `yea5nsHAWxcTKcEaOfV1` |
| URLs | https://newgangfestival.pt (www redireciona) · https://newgang-fest-portal.lovable.app · preview https://id-preview--1a915f50-55ca-4bb6-9abe-8f241c54647a.lovable.app |
| ERP (Lovable) | `ab7cf7e3-a5fc-4737-9cc1-2ba7cf43887f` — repo `pedrompropicio/mundopropicio` |
| Base | Supabase Live `sfohvvlqccmmebvjgibx` (o site usa só a chave **anon**; não tem base própria) |
| Empresa | Mundo Propício `7c858982-6ccd-47ca-bd65-e0dd3eebf01c` |
| Evento | Newgang Festival 2027 `407f43fc-790f-4ea7-8b2a-4162805dfb16` — 25/03/2027, MEO Arena |
| Mockup aprovado | Artifact https://claude.ai/artifact/28mFE33oewXBpseEeVGBp5 (v5) |
| Domínio de email | `news.newgangfestival.pt` (verificado no Resend) |

---

## 3. Arquitetura (decisão D-ERP257)

- **O site não tem regras de negócio.**
  - Lê a edge function `newgang-portal` (verify_jwt=false) e grava inscrições pela `portal-track`.
  - Tudo o que muda configura-se no MP CRM → **Site Newgang** (`/crm/sites/newgang`), com os separadores Geral · Line-up e revelações · História · Clube · Bilhetes · Tracking.
- **Stack do site:** TanStack Start SSR + Tailwind. Ficheiros-chave:
  - `src/lib/portal.ts`: adaptador tipado da API;
  - `src/lib/portal-source.tsx` (`useSource()`): real vs demo;
  - `src/lib/portal-session.tsx`: token do membro no browser;
  - `src/components/pages/*`: corpo das páginas;
  - `src/components/portal-*.tsx`: line-up, media, membro, shell, inscrição;
  - `src/lib/tracking/*` + `src/components/tracking/*`: consentimento, pixels, GTM, atribuição, clique Google;
  - `src/lib/clubSignup.ts` + `PhoneField.tsx`: formulário copiado do Portal MP;
  - `src/demo/*` + `src/routes/teste.*`: ambiente demo;
  - regras do agente em `AGENTS.md`; contrato da API em `API-CONTRACT.md`; `roadmap.md`.
- **Rotas:**
  - `/`, `/atracoes`, `/historia`, `/clube`, `/meu-clube`, `/bilhetes`;
  - `/clube/entrar?t=` (link pessoal), `/confirmar?t=` (compradores 2026, 1 clique), `/descadastrar?token=`;
  - `/teste/*`: demo para os sócios, com dados fictícios, sem rede/tracking, noindex. **A remover antes do lançamento** (rotas `teste.*` + `src/demo`).
- **ERP (edge function `newgang-portal`):**
  - ações `site`, `lineup` (inclui `next_reveal.id`), `history`, `ranking`, `request_access`, `session`, `me`, `guess`, `attendance_claim`, `confirm_buyer`, `notify_pending`, `notify_member`;
  - `assertNoTotals` em todas as respostas;
  - rate limit de 20 pedidos / 10 min por IP+ação nas escritas;
  - CORS: newgangfestival.pt, www, o preview (sufixo `--1a915f50-…lovable.app`) e newgang-fest-portal.lovable.app. As mesmas origens estão aceites em `portal-track`, `geo-lookup` e `crm-google-click-ingest`.
- **Tabelas (migrações 0119, 0120, 0129):**
  - line-up: `event_lineup_reveals`, `event_lineups` (+reveal_id, category, video_url, listen_url), `event_marketing.lineup_complete`;
  - história: `festival_editions` (+`festival_editions_public`);
  - site: `portal_sites` (+`portal_sites_public`);
  - Clube: `club_members`, `club_point_rules`, `club_points` (UNIQUE member+rule+ref), `club_levels`, `club_rewards`, `club_guesses`, `club_attendance_claims`, `club_member_sessions` (hash sha256, 30 dias), `portal_rate_limits`.
- **Criação do membro:** trigger `trg_club_from_lead_capture` quando um `lead_capture` com source `clube_newgang` passa a processado. Depois faz `net.http_post` → `notify_member`, e o email de boas-vindas sai cerca de 1 min após a inscrição. O processamento das inscrições corre a cada minuto. O cron `newgang-club-welcome-5m` fica como rede de segurança.
- **Pontos:**
  - +100 ao confirmar (clique no link do email);
  - +150 ao padrinho quando o convidado confirma;
  - o membro nasce por confirmar.
  - Idempotente.

---

## 4. Regras de produto fechadas (não reabrir)

1. **Line-up que acumula, no centro da home.** Cada revelação traz 1 ou várias atrações, todas marcadas NOVO; a revelação anterior deixa de ser nova.
2. **Nunca mostrar contagens de atrações** ("4 de 8", "faltam X"). O total nunca é conhecido.
3. **Os membros veem a revelação em `club_at`; o público vê em `public_at`.** Atração sem revelação agendada nunca é pública.
4. **História por ordem ascendente** (2023 → 2027; o 2027 fica depois do 2026). As edições de 2023 são Porto (Super Bock Arena) e Lisboa (Campo Pequeno) e mostram só cidade/local. A ordem segue a API.
5. **Media:**
   - fotos em WebP, no máximo 20 por edição;
   - vídeos só por link (YouTube/Instagram/Vimeo), vários por edição, com foto de capa.
6. **Sem sorteio, em lado nenhum.** É um concurso por mérito, porque um sorteio precisa de autorização prévia.
7. **Acesso do membro por link pessoal no email**, sem palavra-passe.
8. **Email:**
   - envio imediato;
   - `portal_vip_welcome` desligado para o clube_newgang;
   - descadastro em https://newgangfestival.pt/descadastrar?token=…, com List-Unsubscribe de um clique a manter `handle-email-unsubscribe`.
9. **Tráfego pago em todas as plataformas.** O `/clube` é a página de entrada dos anúncios.
10. **IDs de pixel nunca no código.** Vêm todos da ação `site` (`event_trackers` + `portal_sites`).

---

## 5. Tracking — configurado e testado ponta a ponta (13/10, inscrição real depois apagada)

| Plataforma | Configuração | Prova |
|---|---|---|
| Consentimento | Banner + Consent Mode v2 (tudo "denied" até decidir), cookie `ng_consent`, `consent_log` com empresa MP | Banner ativo; os pixels só disparam depois de aceitar |
| Meta | Pixel `1158654246468410` (dataset "NewGang Festival", BM 661222725105902), `fbq init` em todas as páginas + PageView por rota, ViewContent em /clube /atracoes /bilhetes, **Lead + CompleteRegistration com eventID = client_event_id** (deduplicado pela CAPI), InitiateCheckout no clique Fever. `_fbc` com domínio `.newgangfestival.pt` | Lead + CompleteRegistration com o mesmo eid. Allowlist de tráfego do pixel: feverup.com, newgangfestival.pt, mundopropicio.com. Domínio **Verified** (meta tag em `portal_sites.facebook_domain_verification`, renderizada em SSR) |
| TikTok | Pixel `DB5VO83C77U5NP31S1P0` (advertiser 7684063259020017665): PageView, ViewContent, CompleteRegistration (event_id = client_event_id), ClickButton/InitiateCheckout. `ttclid` guardado | Pedidos `pixel/act` enviados |
| Google | **GTM próprio**: conta "Newgang Festival" 6382191207, contentor **GTM-KBWT46HF** (id 266948582), **versão 2 publicada**. Tags: Google tag G-RH8KFX6R1C (Initialization), evento GA4 `ng27_clube_inscricao` (CE sign_up), `begin_checkout`, Conversion Linker. GA4 = propriedade "Mundo Propicio" 541703088, stream "Site MP". **Google Ads** 220-004-3144 (MCC 974-322-1780): conversão **7838816133 "NG27 - Inscrição Clube"** importada do GA4 | GA4 recolheu page_view, scroll e ng27_clube_inscricao |
| Snap | Previsto (carrega se houver tracker "snap") | Sem pixel |
| Atribuição | utm_*, gclid/gbraid/wbraid, fbc/fbp, ttclid, `?ref=` → localStorage `ng_ref` (60 dias) → `referral_code` no payload | Lead de teste com gclid, utm e fbp em `lead_capture` |

**Atenção — contagem a dobrar no Google Ads.** Uma inscrição vinda de um anúncio Google conta pelo GA4 ("NG27 - Inscrição Clube") e pelo upload do servidor ("offline (upload)" 7648181457, primária, cadeia #62). **Nas campanhas Newgang, a meta de campanha deve contar só "NG27 - Inscrição Clube".** Configurar quando a campanha for criada.

**#62 (frente `audience-google`).** A 13/10 encontrou-se e corrigiu-se uma regressão: o enqueue só via os 5.000 cliques mais antigos e nada era enviado desde 10/10. A correção é a D-ERP260 (commit e85ddcd). Foram enviadas 16 conversões, verificadas `sent` com `sent_at`. A #62 continua aberta pelo valor por lead e pelo Customer Match.

---

## 6. Estado dos dados (BD Live, 13/10 ~06:00 UTC)

- **Site:** `portal_sites`: 1 linha (newgangfestival.pt), active, `gtm_container_id` GTM-KBWT46HF, verificação Meta preenchida, verificação Google vazia, **`content` vazio** (o site usa os textos por omissão), **sem og_image**.
- **Evento 407f43fc:** `portal_visible = false`, **`ticketing_url` vazio** (o botão Fever não tem destino).
- **Line-up:** **0 revelações, 0 atrações** (o site está no estado "expectativa").
- **História:** `festival_editions`: 5 edições, **0 com fotos/vídeos**.
- **Clube:** `club_members`: **2** (backfill, `importacao`, por confirmar). Os testes ngf2 e ngf3 foram apagados (`email_send_log` mantido como prova).
- **Regras e prémios:** 6 regras de pontos (100/150/300/500/50/100), 3 níveis (Fã 0 / Gang 500 / Lenda 1.500), 4 faixas de prémios com texto "—".
- **Compradores:** a base de compradores Fever 2026 está em `fever_buyers` (edition_label `newgang-2026`, 7.155 compradores segundo o spec do ERP). Serve o "Eu estive lá" automático e o `confirm_buyer`.

---

## 7. Por fazer (por ordem sugerida)

**Antes de lançar tráfego**
1. **Link Fever** (`events.ticketing_url`) e lotes em CRM → Bilhetes.
2. **Textos** no CRM → Geral (hero, Clube, benefícios, bilhetes) e **og:image**. Falta também o *mapeamento das chaves de texto* no site (roadmap: "CRM text-key mapping — content is currently empty").
3. **Prémios e benefícios dos níveis** (o Pedro escreve).
4. **Fotos e aftermovies reais** das edições (a pedir à Newgang Produções).
5. **Primeira revelação** (data Clube / data pública / pistas) e decisão da **home até ao lançamento** (site real vs "Em breve").
6. **Remover `/teste`** depois da apresentação aos sócios.
7. **Meta de campanha Newgang no Google Ads** (só NG27).

**F3**
8. Redireção 301 de `mundopropicio.com/pt/newgang-festival-2027/clube` → `newgangfestival.pt/clube`, com a query string.
9. Email `confirm_buyer` aos compradores 2026 (tokens `buyer_confirm`).
10. Importações Fever para pontos (`friend_bought`, `promo_lot_purchase`).
11. Eventos TikTok server-side.
12. **Plano Resend antes de 03/11** (volume acima de 50k/mês) → `plataforma-e-infra`.
13. Verificação Google Search Console (`google_site_verification`).

**Riscos registados**
- `lead_capture_public_insert` deixa anon inserir direto, contornando a `portal-track`.
- Evento `64e46598`, com slug/título/local errados, continua público em mundopropicio.com.

---

## 8. Armadilhas aprendidas (não repetir)

- **Lovable `send_message`:**
  - dá timeout com frequência, mas a mensagem chega. Verificar com `get_message`/`list_messages`; um reenvio devolve `deduplicated:true`.
  - O agente ERP é **partilhado** por vários chats, por isso confirmar `agentFinished` antes de enviar.
  - O agente pode avançar para lá do "só plano" (aconteceu na #62). Verificar sempre na BD o que diz ter feito.
- **Edge functions do ERP:** o agente faz deploy direto (entram logo em produção). O **frontend** precisa de Publish (Pedro).
- **GTM:**
  - "Entrada inválida / dados desatualizados" ao gravar → recarregar com `?reload=1` e recriar a tag.
  - O `gtm.js` fica em cache no browser ~15 min depois de publicar uma versão nova.
- **Pixel Meta:** sem o domínio na *traffic permission allowlist* do pixel, os eventos são bloqueados em silêncio.
- **Domínio:** a ligação no Lovable/Cloudflare é do Pedro (OAuth/DNS). O Claude não mexe.
- **O contentor não chega ao GCS nem a newgangfestival.pt.** Uploads e verificações fazem-se pelo Chrome do Pedro. Para ficheiros públicos de referência: URL assinado do Storage via `net.http_post` + PUT (bucket `test-artifacts/newgang/f2/`).
- **Cron de upload Google:** o enqueue (`*/15`) só envia leads com clique **com consentimento**. Um lead de teste com gclid falso tem de ser apagado antes da ronda seguinte (aconteceu a 13/10 e correu bem).
- **Testes de inscrição:** usar `teste+ngfN@mundopropicio.com` e pedir depois ao ERP a limpeza: `crm.google_click`/`google_conversion` primeiro, depois membro, sessões, lead_capture, lead, contacto e token de descadastro. Manter `email_send_log`.

---

## 9. Documentos de referência

- **Projeto Claude:**
  - `claude/spec-portal-newgangfestival-2026-10-13.md`
  - `claude/prompt-f1-erp-portal-newgang-2026-10-13.md`
  - `claude/portal-newgangfestival-estado-2026-10-13.md`
  - `claude/newgang-historico-edicoes-e-portal-newgangfestival-2026-10-12.md`
  - `claude/dominio-newgangfestival-pt-registado-2026-10-12.md`
  - `claude/clube-newgang-306-fases-1-3-publicadas-2026-10-11.md`, `claude/clube-newgang-308-ecra-crm-construido-2026-10-12.md` (o Clube antigo em mundopropicio.com)
- **Repo ERP:**
  - `docs/specs/portal-newgangfestival.md`
  - `docs/DECISIONS.md` (D-ERP257, D-ERP260)
  - `supabase/functions/newgang-portal/` (index.ts, lineup.ts, email.ts)
  - `supabase/manual/20261013_newgang_portal_seed.sql`
- **Repo do site:** `AGENTS.md`, `API-CONTRACT.md`, `roadmap.md`, `.lovable/plan/revisão-final-do-portal-2026-10-13.md`.
