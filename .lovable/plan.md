# Plano — Hardening do rate-limit de login (`check-login-rate`)

## 1. Estado atual confirmado

**Edge function** (`supabase/functions/check-login-rate/index.ts`) — inalterada desde a nota de Maio:
- 3 ações: `check`, `record_failure`, `record_success`
- IP lido de `x-forwarded-for` / `cf-connecting-ip` (sem validação de match)
- `record_failure` aceita qualquer `email` no body sem provar que houve tentativa real
- `verify_jwt` não está em `config.toml` para esta função → assume default Lovable (`false`) → **chamável por anon**

**Callers** (apenas frontend):
- `src/pages/Auth.tsx:64` → `action: "check"` antes do `signInWithPassword`
- `src/pages/Auth.tsx:88` → `action: "record_failure"` após erro de signin **disparado pelo client** ⚠️
- `src/pages/Auth.tsx:134` → `action: "record_success"` após signin OK

**Schema `public.login_attempts`**: `id, email, ip_address, attempted_at, success`. Sem coluna que distinga tentativa "verificada" vs "auto-reportada pelo client".

**CAPTCHA**: não existe nada no projeto (`rg captcha|turnstile|hcaptcha` → 0 hits). Supabase Auth também não tem CAPTCHA configurado neste projeto.

**Vulnerabilidade confirmada**: atacante anon faz `POST /functions/v1/check-login-rate` com `{email: vítima, action: "record_failure"}` 10× → vítima fica trancada 15 min no client (e o `check` server-side devolve `blocked: true` no próximo login real).

**Vetor secundário descoberto durante análise**: a função emite `security_alert_sent` por email aos admins quando atinge `ALERT_THRESHOLD = 8`. Como `record_failure` é spoofable, **um atacante pode floodar a inbox dos admins** com alertas falsos → escala de DoS para spam/desconfiança operacional.

## 2. Opções avaliadas

| Opção | Fricção utilizador | Esforço | Dependências | Compatível com MFA |
|---|---|---|---|---|
| **A. CAPTCHA (Turnstile)** após N falhas | Médio (widget visível) | Alto: chave Cloudflare + widget React + verify server + retry UX | Conta Cloudflare, secret novo | Sim (independente) |
| **B. IP-match estável** | Zero | Baixo | — | Sim |
| **C. Auth Hook nativo Supabase** | Zero | Muito alto: refactor arquitetural, hook deploy separado, perde controlo do schema atual | — | Requer revalidar fluxo MFA |
| **D. Híbrido B + lockout só por IP + token assinado** | Zero (legítimo) | Médio | — | Sim |

**Volume real**: ~14 visitantes/dia. Não justifica CAPTCHA (UX cost > benefício). Auth Hook é overkill e arrisca regredir MFA + trusted devices que já estão estáveis.

## 3. Recomendação: Opção D (variante minimalista)

Três mudanças cumulativas, sem dependências externas, sem fricção para utilizadores legítimos:

### D.1 — `record_failure` exige **token de prova** emitido pelo `check`
- `action: "check"` devolve, além de `blocked/remaining`, um **token HMAC** de curta duração (60s) que liga `email + ip + timestamp`
- `record_failure` só conta se receber esse token válido **e o IP de quem chama bater com o IP que emitiu o token**
- Atacante que tenta spoofar `record_failure` directamente é ignorado (não tem token); atacante que faz `check` primeiro fica preso ao IP dele
- Secret novo: `LOGIN_RATE_HMAC_SECRET` (gerado uma vez, guardado no Vault)

### D.2 — Lockout decisivo passa a ser por IP, não por email
- `MAX_ATTEMPTS_PER_EMAIL` deixa de bloquear, vira sinal soft (mostra CAPTCHA-less aviso "muitas tentativas, verifique a senha")
- `MAX_ATTEMPTS_PER_IP` mantém-se como bloqueio duro (atacante distribuído com 20 IPs diferentes precisa de 200 tentativas)
- Resultado: vítima nunca é trancada por culpa de outro IP. Admin/conta pode sempre logar do seu IP estável.

### D.3 — Alerta admin condicionado a `success=false reais` + dedupe por IP
- `security_alert_sent` só dispara quando >= 8 falhas vêm do **mesmo IP** (não do mesmo email)
- Idempotency key passa a incluir IP → cada IP malicioso gera 1 alerta/hora, não 1 por email

## 4. Plano de implementação

### Schema (migration nova)
```sql
ALTER TABLE public.login_attempts
  ADD COLUMN verified boolean NOT NULL DEFAULT false;
CREATE INDEX idx_login_attempts_ip_time ON public.login_attempts (ip_address, attempted_at DESC);
CREATE INDEX idx_login_attempts_email_time ON public.login_attempts (email, attempted_at DESC);
```
- `verified=true` → veio com token HMAC válido
- Contagem do `MAX_ATTEMPTS_PER_IP` usa todas; `MAX_ATTEMPTS_PER_EMAIL` (sinal soft) usa só `verified=true`

### Secret novo
- `LOGIN_RATE_HMAC_SECRET` (32 bytes random hex) via tool `add_secret` antes de aplicar

### Edge function refactor (`supabase/functions/check-login-rate/index.ts`)
- Helpers `signToken(email, ip) → "ts.sig"` e `verifyToken(token, email, ip)` (HMAC-SHA256, TTL 60s)
- `action: "check"` retorna `{ blocked, remaining, token }`
- `action: "record_failure"` valida token → se inválido devolve 200 silencioso (não revela ao atacante) e **não escreve nada**
- Bloqueio decisivo passa a `(ipAttempts || 0) >= MAX_ATTEMPTS_PER_IP`
- `MAX_ATTEMPTS_PER_EMAIL` vira limiar de aviso (`softWarn: true`)
- `sendSecurityAlert` agrupa por IP, idempotency `security-alert-${ip}-${hour}`
- Não toca CORS, não toca `record_success`

### Frontend (`src/pages/Auth.tsx`)
- Captura `token` de `check` em estado local e envia em `record_failure`
- Reage a `softWarn` mostrando aviso amigável ("Verifique a sua senha — muitas tentativas") sem trancar
- Lockout client-side passa a respeitar só `blocked: true` do server (que agora é por IP)
- `MAX_ATTEMPTS` client-side baixa para 5 mas só impede flood local, não é a defesa real
- `useAuth` não muda

### Config
- Nada em `supabase/config.toml` (mantém default `verify_jwt=false` — função tem de ser anon-callable)
- Secret `LOGIN_RATE_HMAC_SECRET` adicionado via Vault

### Rollout
- 100% direto, sem feature flag — fluxo é simples e o fallback degrada para o comportamento atual:
  - Se token vier inválido por bug, edge function devolve 200 silencioso → frontend continua a mostrar erro de credenciais (cenário pior = não regista a falha, e ela é registada na próxima)
- Migration aplicada em **Test primeiro**, smoke 30 min, depois Live

### Smoke tests obrigatórios
1. **Legit**: login OK 1ª vez → sem lockout, sem warn
2. **Legit erra senha 1×, 2×, 3×** → mostra "tentativas restantes", recupera no 4º
3. **Atacante anon** chama `record_failure` 20× sem `check` → 0 linhas em `login_attempts` com aquele email
4. **Atacante** chama `check` + `record_failure` 10× para email vítima de IP A → conta da vítima permanece logável de IP B (verificação manual: dois browsers)
5. **Atacante** chama 25× de IP A → IP A bloqueado por 15 min (independente do email usado)
6. **MFA**: login OK + TOTP continua a funcionar; trusted device 30d intacto; recovery code intacto
7. **Alerta admin**: 8 falhas verificadas do mesmo IP → 1 email; 8 falhas de IPs diferentes → 0 emails

### Critério de rollback
- Se erro 500 em `check-login-rate` > 5% durante 10 min após deploy → revert da edge function (manter migration, é aditiva)
- Comando rollback: redeploy da versão anterior via `supabase--deploy_edge_functions`

### Coexistência MFA
- MFA acontece **depois** de `signInWithPassword` ter sucesso → este fluxo termina antes do MFA, não há interacção
- `mfa_trusted_devices`, `consume_recovery_code` e `MfaRequiredGate` ficam intocados

## 5. Estrutura de ficheiros (a criar quando implementar)

- `supabase/migrations/<ts>_login_attempts_verified.sql` — coluna + 2 índices
- `supabase/functions/check-login-rate/index.ts` — refactor (mesma file)
- `src/pages/Auth.tsx` — captura/envio de token + tratamento `softWarn`
- `scripts/auth-hardening/01-rate-limit-hmac.APPLIED.txt` — espelho SQL para Live
- `.lovable/memory/security/auth-rate-limit-hardening.md` — nota descrevendo D.1+D.2+D.3 e como verificar
- Update de `mem://security/security-hardening-2026-05` para remover este item das pendências

## 6. Achados extra (fora de scope, sinalizar)

- **Vetor de spam de alertas admin** (descrito na §1) — fica resolvido pelo D.3, mas vale registar como CVE interna no log
- `record_success` continua spoofable mas é benigno (só insere linha `success=true`); não vale a pena hardening agora
- `cleanup` de attempts >24h corre dentro de `record_failure` — manter; alternativa cron seria over-engineering para o volume actual
