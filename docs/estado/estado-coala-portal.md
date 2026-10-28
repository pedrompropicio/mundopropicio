# Estado — coala-portal

> Ficheiro de estado do chat `coala-portal` (portal público coalafestival.pt). Reescrito por cima no fecho de cada demanda autorizada. Criado a 15/10/2026 a partir do arquivo `claude/coala-emails-resend-2026-08-18.md` (Projeto Claude, actualizado 22/09/2026) e de `claude/coala-eb27-convite-pronto-e-ab-horario-2026-10-14.md`; reescrito a 28/10/2026 no fecho do ponto 4 do #359. Os números abaixo têm a data da sua origem e **devem ser reconsultados** antes de se usarem.

## A trabalhar agora

- Nada em execução no portal. Projeto Lovable do portal Coala: bef9c59c-c2a4-453d-9aec-dae7d16c9171 (confirmado a 28/10/2026; HEAD publicado 3d802ff2aff01ddc6bb4f482de0790455d1942e1).
- #359 ponto 4 («Gerir as minhas autorizações»): **concluído, publicado e testado em Live a 28/10/2026**. O que falta do #359 está em "Pendentes".

## Onde estamos

- Projeto Lovable separado do ERP, sem base própria: lê a base Live `sfohvvlqccmmebvjgibx` pela chave anon. Empresa Coala `7d831e59-6e82-427b-95a0-64904aae5dd2`. Evento Coala Festival Portugal 2027 `49cb03de-331d-415c-97cc-b8b0695b015e` (29–30/05/2027, Hipódromo Manuel Possolo, Cascais). Coala 2026 `5a1da5fb-3115-4ae3-af50-15ce1f869a5c` está selado — não se mexe.
- Calendário 2027 (origem: arquivo 22/09): Early Bird lote único 03/11/2026 (no site, vinda da BD); vendas gerais 01/12/2026 — **interna, não divulgar, sem chave em `portal_settings`**.
- Definições do portal em `portal_settings` (categoria `early_bird`: `state`, `fever_url`, `price_label`, `open_date`); desde 21/09/2026 `companies.public_portal = true` na Coala, pelo que as definições têm efeito imediato no site. `early_bird.fever_url` e `price_label` por preencher no dia 03/11.
- Emails: domínio `notify.coalafestival.pt` verificado no Resend; `RESEND_API_KEY_COALA`; funções `tg_coala_lead_confirm` (confirmação PT/EN), `coala_send_early_bird_batch(p_limit, p_dry_run)` (dry run por defeito; recusa sem `fever_url`), unsubscribe one-click. Lista única `coala_list_members` com consentimento de marketing separado (feature `coala-eb-invite`). Convite Early Bird 2027 preparado (14/10, arquivo).
- Referência histórica (22/09/2026): plano Resend free, 100 emails/dia; **desatualizado:** o número de 745 linhas de `lead_capture` de 22/09 não representa a contagem atual. Plano e capacidade de envio devem ser reconsultados antes de se usarem.
- Referência histórica (22/09/2026): sentinela + alerta no `process-email-queue` para falhas `no_matching_sender`, sem confirmação atual; tema da frente 2. A política foi entretanto substituída, conforme abaixo.
- Banner v2 (D-ERP312/313), R1, publicado pelo Pedro a 27/10/2026: o marketing passa a ser só Meta; análise e funcionais saem do banner; MC_BANNER_VERSION = "banner-2026-10-coala-v2"; quem aceitou marketing numa versão anterior do banner é perguntado de novo (readCookie invalida o cookie quando a versão gravada difere); fontes e bandeiras servidas pelo próprio domínio (sem Google Fonts). Documento da feature: docs/features/consentimento-marketing-322-portal-coala.md (secção "Banner v2").
- Política de privacidade PT/EN do Coala (tabela static_pages, lida em tempo de execução) substituída em Live a 27/10/2026 (R2): só a Meta é nomeada, conservação e frases de telemóvel/WhatsApp à letra do jurídico. Cópia dos textos anteriores: documento do projeto Claude claude/plano-r2-politica-coala-pt-en-2026-10-27.md §8. A frase do prestador de alojamento mantém-se enquanto o "Visitor analytics" do Lovable estiver ligado.
- Público Meta P_EB27_LISTA: eliminado a 27/10/2026 (nunca foi usado por nenhuma campanha). Cron coala-eb27-audience-sync removido e meta_custom_audiences correspondente com enabled=false. O resto da lógica de públicos fica no estado do chat MP Audience.
- WhatsApp legado do Coala: contactos com origem form_legacy_sem_prova perderam o consentimento de WhatsApp (DML com cópia em tabela bkp_359_whatsapp_legado_coala). A função crm_whatsapp_eligible devolve falso para essa origem no Coala (migração 0276) e, desde a 0279, lê também o ledger `coala_person_consents` no ramo Coala (com o comportamento da 0276 como alternativa quando não há linha). Enquanto o formulário do Coala não gravar decisão de WhatsApp com prova (P6), quem marcar a caixa no formulário fica inelegível por esse caminho.
- Correspondência avançada da Meta no dataset do Coala: MANTER (decisão do Pedro); assunto encerrado.
- **Ponto 4 do #359 — «Gerir as minhas autorizações» (28/10/2026).**
  - Servidor (ERP, R2, aplicado em Live): ledger `public.coala_person_consents` (append-only, guarda `_coala_person_consent_guard`, RLS, grants só service_role; migração 0277); RPCs `coala_autorizacoes_estado(p_token)` e `coala_autorizacoes_gravar(...)` (SECURITY DEFINER, EXECUTE só anon/authenticated; migração 0278); `crm_whatsapp_eligible` com ramo Coala (0279); migração 0291 (parecer do jurídico de 27/10): o descadastro de email é independente — só um pedido de apagamento (`suppressed_emails.reason='erasure_request'`) bloqueia novas concessões; retirar nunca é bloqueado; `email_unsubscribe_atomic` não substitui `erasure_request` por `unsubscribe`. Textos em `consent_text_versions`: `coala-anuncios-2026-10-v1` e `coala-whatsapp-2026-10-v1`, PT e EN, à letra do jurídico (EN aprovado a 27/10/2026).
  - Portal (R1, HEAD 3d802ff2, publicado a 28/10/2026 com o «Sim» do Pedro): rota `/autorizacoes?token=…&lang=pt|en` (duas caixas desmarcadas por defeito, ligação à política junto a cada caixa, telemóvel só se faltar e o WhatsApp estiver marcado, `noindex,nofollow`, `referrer no-referrer`); `/unsubscribe` mostra, depois do descadastro, «Quer também retirar a autorização de WhatsApp ou de anúncios?» com retirada de um clique por canal e a ligação «Gerir as minhas autorizações»; `SiteLayout` com opção `tracking={false}` (sem pixel, GTM, atribuição nem geo, para o token do URL não sair). Documento da feature no repo do portal: docs/features/autorizacoes-359-portal-coala.md.
  - Prova em Live (28/10/2026, endereço interno do Pedro, token de teste já apagado, supressão de teste apagada): conceder → ledger com `ads` e `whatsapp` concedidos com a versão certa e o telemóvel; retirar → linhas `revoked`; descadastro real → ecrã de retirada, cada botão grava só o seu canal e mantém o outro. O ledger conserva as linhas do teste (é append-only). Token inválido → «Este link é inválido ou expirou.»; sem pixel, `fbq` nem `dataLayer`; o token não fica em localStorage nem cookies.
  - Limitações conhecidas: o código global do portal ainda escreve `mc_seq` (sem token) e estado de navegação; o repo do portal **não tem CI externo** nem scripts de teste/tsc no `package.json` (só `lint`), os gates foram os locais do agente (vitest 122/122, tsc e build OK, lint dos ficheiros alterados 0 erros; lint global 488 erros e 15 avisos declarados pré-existentes); os testes novos usam a config `src/routes/-autorizacoes.vitest.config.ts`.

## Pendentes

- Email de abertura do Early Bird: a ligação já está aplicada (0292). Falta o teste de envio com endereço interno dado pelo Pedro e o dry run no dia 03/11/2026 antes de qualquer envio (R2). Se não ficar pronto, o email sai sem testes adicionais (decisão do Pedro).
- "Visitor analytics" do alojamento: decisão do Pedro (desligar → retirar a frase do alojamento da política, R2).
- P6: formulário do Coala a enviar a versão coala-form-2026-10-v1 e consent_locale e a gravar a decisão de WhatsApp; P5 robustez do portal-track (R1). **Por confirmar** contra o código antes de abrir demanda.
- Issue #372 (9 · CRM): marcar as inscrições do formulário do topo sem caixa feitas até 15/10/2026 para a regra dos 30 dias; prazo antes do fim da edição de 2027.
- Depois, com autorização própria: adaptar a vista do CRM e os envios de WhatsApp ao ledger `coala_person_consents`.

## Relação com outras frentes

- Filas CAPI, consentimento no ERP, atribuição → 9. Email (Resend, DNS, plano) → 2. Bilheteira Fever → 3. BP/fecho → `bp-coala-2027` / `fecho-coala-2026`.

## Issues

#359 (consentimento e prova do Coala; ponto 4 concluído a 28/10/2026) · #53 payloads e triggers duplicados · #54 emails da Coala · #79 páginas estáticas do portal (estado a confirmar na lista de issues abertas) · #372 regra dos 30 dias.
