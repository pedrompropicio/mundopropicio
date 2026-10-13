# Portal newgangfestival.pt — F1 (parte ERP)

Evento 407f43fc (Newgang 2027) · empresa MP 7c858982. Tudo em public.*; crm.* intocado. Nada se aplica sem o OK do Pedro; DML de sementeira mostrado antes.

## Estado verificado
- event_lineups: 0 linhas; policy `event_lineups_authenticated_all` = ALL true (+ RESTRICTIVE company_isolation).
- event_lineups_public expõe tudo com portal_visible + slug → corrigir primeiro.
- fever_buyers (#309) já carregada: 28.379 linhas → fonte do "Eu estive lá" 2026.
- portal-track, crm-google-click-ingest, geo-lookup têm ALLOWED_ORIGINS; portal-track tem ORIGIN_COMPANY.
- Ecrãs existentes: src/pages/crm-admin/clube-newgang/ (ClubeNewgang, LineupTab, EventTrackersCard).

## Ordem
1. Migração A (segurança line-up, urgente): reescrever event_lineups_public; trocar policy true por SELECT da empresa + escrita admin/manager.
2. Migração B: event_lineup_reveals + colunas em event_lineups + event_marketing.lineup_complete.
3. Migração C: festival_editions, portal_sites (+ vistas públicas).
4. Migração D: tabelas do Clube + funções de pontos + extensão do processamento de inscrições.
5. DML (mostrado antes): 5 edições, linha portal_sites, regras/níveis/prémios por omissão.
6. Edge newgang-portal + alterações de origens + deploy.
7. Ecrãs /crm/sites/newgang.
8. Testes, docs, memória. Sem Publish (aviso quando for preciso).

## 1. Line-up com revelações
- event_lineup_reveals: id, company_id, event_id, label, club_at, public_at, clues text[], status check (rascunho|agendada), created_by, created_at, updated_at; check public_at >= club_at.
- event_lineups: + reveal_id FK (ON DELETE SET NULL), category check (headliner|atracao|convidado), video_url, listen_url.
- lineup_complete boolean default false em event_marketing (já 1:1 com events e é onde vivem ticket_lots/conteúdo de marketing).
- event_lineups_public: JOIN reveal com status='agendada' AND public_at <= now(); sem reveal nunca sai. Sem colunas de contagem.
- RLS (ambas): SELECT authenticated da empresa; INSERT/UPDATE/DELETE só has_role admin/manager + row_belongs_to_current_company. Anon sem grant na tabela.

## 2. História
- festival_editions (campos pedidos, brand_key, sort, visible). Vista festival_editions_public (visible=true) com GRANT SELECT anon. Escrita admin/manager.
- Sementeira: 2023 Lisboa Campo Pequeno e 2023 Porto Super Bock Arena (data/line-up null, visible=false até confirmar), 2024, 2025, 2026 conforme pedido.

## 3. Configuração do site
- portal_sites (campos pedidos, UNIQUE domain). Vista portal_sites_public sem company_id/created_by. Linha newgangfestival.pt.

## 4. Clube
Tabelas: club_members (UNIQUE site+lower(email); member_no via função sequencial por site com lock; referral_code 6–8 chars sem ambíguos, UNIQUE), club_point_rules (site_id, rule_key, points, active), club_points (UNIQUE member_id, rule_key, ref_id), club_levels, club_rewards, club_guesses (UNIQUE member_id, reveal_id; trigger recusa após club_at), club_attendance_claims (UNIQUE member_id, year), club_member_sessions (token_hash sha256, expires_at, purpose access|buyer_confirm).
- Todas: RLS leitura da empresa autenticada, escrita admin/manager; sem anon. O portal só toca via edge (service_role).
- Vista/RPC club_member_balances (saldo + nível) e club_ranking (SECURITY DEFINER, filtra empresa).
- Criação de membro: estender process_lead_captures_batch (já faz upsert contacts) — quando source='clube_newgang', upsert club_members ligado ao contact, ler raw.referral_code; dedup por email e telefone do contact. Pontos via função award_club_points(member, rule, ref) com ON CONFLICT DO NOTHING: join_confirmed (ref=member_id) ao confirmar; friend_joined ao padrinho (ref=convidado) só quando o convidado confirma e não é o próprio nem email/telefone já existente. Assinatura e payload CAPI da RPC mantêm-se.
- Attendance: claim de ano com email em fever_buyers da edição → valido + pontos attended_year; senão pendente.
- Mérito, sem sorteio.

## 5. Edge newgang-portal
verify_jwt=false; CORS constante NEWGANG_ALLOWED_ORIGINS (2 domínios + PREVIEW_ORIGIN a preencher). Zod em todas as ações. Ações: site, lineup, history, ranking, request_access, session, me, guess, attendance_claim, confirm_buyer.
- lineup: estado expectativa/em_curso/completo; última revelação com is_new em todas as suas atrações; confirmados por categoria/ordem; próxima revelação (public_at; club_at se sessão); pistas. Com sessão o corte passa a club_at. Nunca devolve totais/contagens.
- request_access: gera token, guarda hash, enfileira email via enqueue (process-email-queue, remetente news.newgangfestival.pt); resposta idêntica exista ou não. Depende da chave RESEND_API_KEY_NEWGANG (ainda em falta) para envio real.
- Rate limit por IP (hash) nas escritas, reutilizando o padrão existente no portal-track (sem tabela nova se servir a existente; senão tabela pequena na migração D).

## 6. Origens e tracking
- portal-track: +2 domínios + preview → MP; raw guarda referral_code e ttclid.
- crm-google-click-ingest, geo-lookup: mesmas origens.
- Verificar event_trackers_public para 407f43fc (hoje excluído por portal_visible=false — confirmar comportamento e decidir com o Pedro quando ligar). Snap: platform 'snap' já cabe na unique de event_trackers; confirmar check constraint.

## 7. Ecrãs /crm/sites/newgang (menu MP CRM, guarda module.crm)
Separadores Geral, Line-up e revelações (estende LineupTab: revelações, atrações, ordenação, pré-visualização público/membro, botão Line-up completo), História (CRUD + upload em bucket público existente de portal), Clube (regras, níveis, prémios, membros/ranking reaproveitando ClubeNewgang, palpites com sugestão automática + decisão manual, claims pendentes), Bilhetes (events.ticketing_url, event_marketing.ticket_lots), Tracking (EventTrackersCard + GTM).

## 8. Testes (vitest)
Corte público/membro por datas; multi-atração marca todas novas e a anterior deixa de ser; varredura das respostas sem chaves total/count; pontos idempotentes, convite só com confirmação, email repetido não pontua. Mais tsgo/build.

## 9. Documentação
docs/specs/portal-newgangfestival.md, nova D-ERP (256) em DECISIONS.md, memória features/portal-newgangfestival.md, estado-crm-portal-e-leads.md com risco lead_capture_public_insert registado (não alterada).

## Questões para o OK
1. lineup_complete em event_marketing (recomendado) ou events.
2. Edições 2023 sem data ficam visible=false até confirmar (recomendado) ou visíveis com "por confirmar".
3. Duração do link pessoal: 30 dias (recomendado) / 7 dias.
4. Envio real de emails aguarda RESEND_API_KEY_NEWGANG.
