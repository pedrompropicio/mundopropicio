---
name: Auth rate-limit hardening (2026-05-09)
description: check-login-rate exige token HMAC bound to (email, ip); lockout decisivo passa a ser por IP; alertas dedupe por IP+hora — fecha vetor de account-lockout DoS
type: feature
---

## Vetor que estava aberto

`record_failure` aceitava qualquer `email` no body. Atacante anon spammava 10× → vítima trancada 15 min. Vetor secundário: floodava admins com 1 alerta por email spoofado.

## Mitigação aplicada (Opção D do plano)

### D.1 — Token HMAC bound to (email, ip)
- `check` devolve `token = "<ts>.<sig>"` (HMAC-SHA256 sobre `ts.email.ip`, TTL 60s)
- `record_failure` valida o token; se inválido devolve 200 silencioso e NÃO escreve
- Secret: `LOGIN_RATE_HMAC_SECRET` (Vault). Se ausente, log warn + fallback ao comportamento antigo (não regride disponibilidade)

### D.2 — Lockout decisivo por IP, não por email
- `MAX_ATTEMPTS_PER_IP = 20` na janela de 15 min → bloqueio duro
- `WARN_THRESHOLD_PER_EMAIL = 10` → só `softWarn: true` (UI mostra "Verifique a sua senha"), nunca tranca a conta
- Resultado: vítima nunca é trancada por culpa de outro IP

### D.3 — Alertas admin por IP+hora
- `ALERT_THRESHOLD = 8` agora conta falhas verificadas do mesmo IP (qualquer email)
- `idempotencyKey = security-alert-<ip>-<hora>` → 1 alerta/IP/hora máx

## Schema

```sql
ALTER TABLE public.login_attempts ADD COLUMN verified boolean NOT NULL DEFAULT false;
CREATE INDEX idx_login_attempts_ip_time ON public.login_attempts (ip_address, attempted_at DESC);
CREATE INDEX idx_login_attempts_email_time ON public.login_attempts (email, attempted_at DESC);
```

`verified=true` ⇔ veio com token HMAC válido. Contagem soft (email) usa só `verified=true`. Contagem hard (IP) usa todas — IP é observável pelo edge runtime.

## Como verificar

```sql
-- Coluna existe e default
SELECT column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='login_attempts' AND column_name='verified';

-- Atacante spoofa: linhas verified=false NÃO devem aparecer
SELECT verified, count(*) FROM public.login_attempts
WHERE attempted_at > now() - interval '1 hour' GROUP BY verified;
```

Smoke manual:
1. Login OK → linha `success=true, verified=true`
2. Erro de senha → linha `success=false, verified=true` (com token válido)
3. `curl -X POST .../check-login-rate -d '{"email":"x@y.z","action":"record_failure"}'` (sem token) 20× → 0 linhas inseridas
4. Atacante chama `check`+`record_failure` 25× do mesmo IP → IP bloqueado, `softWarn` no email mas conta da vítima continua logável de outro IP

## Live

Migration replicada via `scripts/auth-hardening/01-rate-limit-schema.txt`. Edge fn deploy automático ao publicar.

Pendência fechada na nota `mem://security/security-hardening-2026-05` (item "check-login-rate sem throttle").
