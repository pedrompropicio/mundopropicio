# INTEGRATIONS.md — Serviços Externos, APIs e Edge Functions

> Inventário completo de integrações, secrets, edge functions, crons e APIs externas.

---

## 1. Plataforma Base

### 1.1 Lovable Cloud (Supabase)
- **Project ref**: `sfohvvlqccmmebvjgibx`
- Auth (email/password, OAuth Google opcional, MFA TOTP)
- PostgreSQL com RLS
- Storage (8 buckets privados)
- Edge Functions Deno
- Realtime (canal `payment_lists` para badge PWA)
- Cron jobs (`pg_cron`)

### 1.2 Lovable AI Gateway
- **Secret**: `LOVABLE_API_KEY` (auto-provisionada)
- Modelos usados:
  - `google/gemini-2.5-flash` — OCR camarim, extract invoice, match categories, audit categories
  - `google/gemini-2.5-pro` — análise mais complexa quando necessário
  - `google/gemini-2.5-flash-lite` — help search
- Sem necessidade de API key externa.

---

## 2. Edge Functions (Supabase)

38 funções deployadas automaticamente. Localizadas em `supabase/functions/`.

### 2.1 Auth & Users
| Função | Descrição |
|---|---|
| `accept-invitation` | Público — cria conta a partir de token de convite |
| `invite-company-admin` | Super-admin only — cria convite (token, expira 7d) |
| `create-company` | Super-admin only — cria nova empresa-cliente |
| `create-user` | Admin — cria utilizador + envia email |
| `delete-user` | Admin — soft delete + revoga sessões |
| `request-password-reset` | Pede reset, envia email |
| `resend-reset-email` | Reenvia email de reset |
| `check-login-rate` | Rate limiting login (`login_attempts`) |

### 2.2 Email
| Função | Descrição |
|---|---|
| `auth-email-hook` | Webhook do Supabase Auth para emails customizados (React Email + branding por empresa) |
| `send-transactional-email` | Envia email transacional via Lovable Email |
| `preview-transactional-email` | Preview de templates |
| `process-email-queue` | Worker da fila de emails |
| `handle-email-suppression` | Webhook de bounce/complaint |
| `handle-email-unsubscribe` | Cancelar emails (token) |

### 2.3 Database/Backups
| Função | Descrição |
|---|---|
| `database-backup` | Cron diário 03:00 UTC — JSON por empresa + global → bucket `backups` |
| `database-restore` | Restauro completo legacy |
| `database-restore-v2` | Restauro completo hardened (handle child tables) |
| `selective-restore` | Restauro seletivo por tabela ou evento |
| `surgical-restore` | Restauro cirúrgico de linhas específicas |
| `restore-debug` | Debug do restore |

### 2.4 Transações
| Função | Descrição |
|---|---|
| `update-transaction` | Edição segura de transação (validações server-side; role privilegiada; allowedFields) |
| `approve-transaction` | Aprovar transação com validações cascade |
| `generate-historical-transactions` | Geração em lote de transações históricas via XLSX matching |

### 2.5 OCR / IA
| Função | Modelo | Descrição |
|---|---|---|
| `extract-camarim-receipt` | Gemini 2.5 Flash | OCR de recibos do Camarim |
| `extract-invoice-total` | Gemini 2.5 Flash | Extrai total da fatura + sinais (evento, artista, data) |
| `extract-ticket-pdf` | Gemini | Parser de PDFs Ticketline |
| `audit-categories` | Gemini | Auditoria IA de categorias do BP+TX |
| `match-categories` | Gemini | Matching automático de categorias |
| `help-search` | Gemini Flash | Pesquisa no Manual de Orientação |

### 2.6 Camarim
| Função | Descrição |
|---|---|
| `close-camarim-session` | Fecha sessão: snap IVA {0,6,13,23}, cria transações, marca integrated |

### 2.7 Câmbio
| Função | Descrição |
|---|---|
| `fetch-fx-rate` | Câmbio EUR↔BRL/USD via APIs públicas (frankfurter.app + exchangerate.host). Sem API key. |

### 2.8 Notificações
| Função | Descrição |
|---|---|
| `send-push-notification` | Web Push via VAPID (`web-push`). Lê `push_subscriptions` |
| `send-system-reminders` | Cron diário 08:00 UTC Lisbon — envia WhatsApp via Twilio |

### 2.9 Sistema
| Função | Descrição |
|---|---|
| `resolve-attachment-url` | Gera Signed URL 1h para anexos privados |
| `run-rls-legacy-audit` | Cron diário 02:30 UTC — audita policies RLS legacy → `rls_legacy_audit_reports` |
| `test-multi-tenant-isolation` | Suite de testes de isolamento multi-tenant |
| `tests` | Endpoints de testes internos |

---

## 3. Cron Jobs (pg_cron / scheduled)

| Job | Schedule | Função |
|---|---|---|
| Daily backup | 03:00 UTC | `database-backup` |
| Cleanup old backups (30d) | diário | trigger SQL |
| Monthly backup test | mensal | `database-restore-v2` em sandbox |
| RLS legacy audit | 02:30 UTC | `run-rls-legacy-audit` |
| System reminders | 08:00 UTC Lisbon | `send-system-reminders` |
| Trash cleanup (>30d) | diário | trigger SQL |
| Recurring transactions | diário | gera próximas pendentes |
| Email queue worker | 1min | `process-email-queue` |

---

## 4. Secrets (Edge Function env)

| Secret | Uso | Provisão |
|---|---|---|
| `SUPABASE_URL` | URL do projeto | Auto |
| `SUPABASE_ANON_KEY` | Anon | Auto |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role | Auto |
| `LOVABLE_API_KEY` | Lovable AI Gateway | Auto |
| `LOVABLE_SEND_URL` | Lovable Email send endpoint | Auto |
| `TWILIO_API_KEY` | Twilio (WhatsApp/SMS) | Manual (user setup) |
| `VAPID_PUBLIC_KEY` | Web Push public | Manual |
| `VAPID_PRIVATE_KEY` | Web Push private | Manual |

> Todas as variáveis Supabase auto-providenciadas. Secrets manuais geridos via Lovable Cloud → Settings → Secrets.

---

## 5. APIs Externas

### 5.1 Twilio (WhatsApp Business / SMS)
- **Onde**: `send-system-reminders`
- **Endpoint**: Twilio Messaging API
- **Auth**: `TWILIO_API_KEY`
- **Conteúdo**: lembretes do `system_reminders` (Markdown convertido para texto WhatsApp)
- **From padrão**: `+14155238886` (sandbox)

### 5.2 Lovable Email (Resend-like)
- **Onde**: `send-transactional-email`, `auth-email-hook`, `process-email-queue`
- **Pacote**: `npm:@lovable.dev/email-js`
- **Templates**: React Email compilados em runtime
- **Branding**: por empresa via `companies.logo_url` + `display_name` + `primary_color`
- **Suppression**: webhook → `suppressed_emails`
- **Unsubscribe**: token assinado em `email_unsubscribe_tokens`

### 5.3 Web Push (VAPID)
- **Onde**: `send-push-notification`
- **Pacote**: `web-push` (Deno port)
- **Auth**: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`
- **Subscriptions**: `push_subscriptions`
- **PWA**: `public/sw-push.js` + `public/manifest.webmanifest`

### 5.4 Câmbio (Frankfurter / Exchangerate.host)
- **Onde**: `fetch-fx-rate`
- **Endpoints públicos**:
  - `https://api.frankfurter.app/latest?from=BRL&to=EUR` (primário)
  - `https://api.exchangerate.host/convert?from=BRL&to=EUR` (fallback)
- **Sem auth, sem rate limit relevante**.

### 5.5 Lovable AI Gateway (Gemini)
- **Endpoint**: provisionado pela plataforma
- **Auth**: `LOVABLE_API_KEY`
- **Pricing**: per-token, gerido via Cloud usage

### 5.6 Importadores Bilheteira
| Fonte | Formato | Parser TS |
|---|---|---|
| Ticketline (PT) — import manual | PDF + XLSX | `parse-ticketline-xlsx.ts`, `parse-ticketline-zone-xlsx.ts`, edge `extract-ticket-pdf` |
| **Ticketline (PT) — sync diária** | XLSX via Devise login | edge `fetch-ticketline-reports`, parser `_shared/ticketline-operations-parser.ts`, doc `docs/integrations/ticketline.md` |
| Fever — sync diária | 2 XLSX via API | edge `fetch-fever-reports` |
| Fever — import manual | 2 XLSX | `parse-fever-xlsx.ts` (`FeverImportModal`) |
| Coala (BR) | XLSX V2 | `event-simulator-coala.ts` (DuckDB queries client-side) |
| Patrocínios | XLSX | `parse-sponsors-xlsx.ts` |

> Sync Ticketline/Fever fazem login programático e correm via `pg_cron` 1×/dia.


---

## 6. Bibliotecas Frontend Notáveis

| Lib | Uso |
|---|---|
| `@tanstack/react-query` | Cache + mutations |
| `react-hook-form` + `zod` | Forms |
| `recharts` | Gráficos |
| `framer-motion` | Animações |
| `xlsx` | Parse XLSX |
| `pdf-lib` / `pdfjs-dist` | PDFs (preview, parsing) |
| `jspdf` + `jspdf-autotable` | Geração de PDFs (relatórios, exports) |
| `duckdb-wasm` | Queries SQL no browser (Coala) |
| `web-push` | (deno só) |
| `@react-email/components` | Templates email |
| `dompurify` | Sanitização |
| `date-fns` | Datas (sempre local TZ) |
| `cmdk` | Command palette (GlobalSearch) |
| `sonner` + `toaster` | Notificações |

---

## 7. PWA

- `public/manifest.webmanifest` — ícones, theme, name fixo "MP Gestão Eventos"
- `public/sw-push.js` — service worker para push
- `src/lib/pwa.ts` — registo
- `src/lib/app-badge.ts` — badge nativo PWA (count de payment_lists pendentes)
- `src/lib/push-notifications.ts` — subscribe/unsubscribe

---

## 8. CI/CD & Deploy

- **Deploy**: automático via Lovable platform (push → preview → publish)
- **Edge functions**: auto-deploy ao salvar
- **DB migrations Test**: via tool `supabase--migration` (auto-approval)
- **DB migrations Live**: scripts `.txt` em `scripts/` aplicados manualmente no Supabase Dashboard
- **Domains**:
  - Preview: `id-preview--ab7cf7e3-…lovable.app`
  - Published: `mundopropicio.lovable.app`
  - Custom: `mpgestaoeventos.com`, `www.mpgestaoeventos.com`

---

## 9. Observabilidade

- `system_audit_log` — todas mutações sensíveis
- `transaction_audit_log` / `forecast_audit_log` — campo a campo
- `user_activity_log` — páginas visitadas
- `email_send_log` — todos emails enviados
- `ticket_import_logs` — imports de bilheteira (com `report_url`)
- `rls_legacy_audit_reports` — auditoria diária de RLS
- Edge function logs: `supabase--edge_function_logs`

---

## 10. Webhooks recebidos

| Webhook | Edge fn | Origem |
|---|---|---|
| Lovable Auth email | `auth-email-hook` | Supabase Auth GoTrue |
| Email suppression | `handle-email-suppression` | Lovable Email (Resend) |
| Email unsubscribe link | `handle-email-unsubscribe` | clique do utilizador |

Todos com verificação HMAC via `@lovable.dev/webhooks-js`.

---

## 11. Rate Limiting

- Login: `check-login-rate` (5 tentativas / 15min por email+IP).
- Email queue: `email_send_state.batch_size` + `send_delay_ms`.
- Sem rate limit em APIs públicas externas (frankfurter/exchangerate são livres).

---

## 12. Pontos de Extensão Futuros

- **Pagamentos** (Stripe/Paddle): não integrado, disponível via tools.
- **Shopify**: não integrado.
- **SAML SSO**: disponível via `supabase--configure_saml_sso`.
- **Multi-país (Fase 8)**: em **quarentena** até 2026-05-29 — ver `.lovable/memory/features/multi-country-roadmap.md`.

---

## 13. Variáveis de Ambiente Frontend

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
```

Auto-providenciadas. **Nunca editar `.env` manualmente**.
