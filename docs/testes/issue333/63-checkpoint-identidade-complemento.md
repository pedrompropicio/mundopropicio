# Prova63 — complemento único Cloud fase8, ETAPA 1 (preflight + identidade) — CHECKPOINT

Data: 2026-10-18 ~17:05 UTC. HEAD recebido 31c4c8abfd6980b3583f094c287ae1ed9fd6b3aa.
Fase8 continua PARCIAL. Reserva #333 mantida. Sem login, sessão, role, allowlist,
fatura, DDL, deploy ou Publish. Fixture59 intacta (banida/revogada).

## Preflight oficial (read_query, só SELECT) — antes da criação
- schema: incompatibilities = [] (68 colunas exigidas pelo driver presentes)
- marker=0, reference=0, empresa MP status=active
- allowlist total=2 (revogadas do piloto59), ATIVA=0
- core=0, attempt=0 (globais fechadas)
- 5 MD5 iguais aos esperados (current_company_id f857f027…, log_table_change 9509fe10…,
  set_company_id_on_insert 949120b4…, auth.uid cdef18c6…, data_entry_pilot8_gate 1e066a6d…)
- baseline: 15 relações (count+md5) + config data_entry* f142942c… guardados em /tmp 0600;
  transactions=1966, auth.users=64.

## Criação (uma única chamada AuthAdmin POST, sem retry)
- email `<marcador>@fixture.invalid`, email_confirm=true, sem envio de email.
- senha aleatória 24 bytes só em /tmp (0600); nunca impressa.
- metadados: fixture_marker, company_id, full_name, pilot_pdf_sha256/size/mime exatos.
- PDF verificado antes (1517 B, SHA256 8ae66f6a…, application/pdf).
- Não usado runFuturePilot (evita timeout 5 min + ban automático antes do controller).

## Checkpoint por SELECT independente (pós-criação)
- 1 utilizador com o marcador; email confirmado; last_sign_in_at NULL; banned_until NULL
- profile: company MP, active_company_id NULL, full_name exato
- user_roles: exatamente 1 linha, role=user, empresa MP
- auth.sessions=0, refresh_tokens=0
- allowlist do owner=0, ATIVA global=0; core=0, attempt=0
- data_entry_sessions=0, results=0, faturas (owner ou referência)=0, transactions=1966 (igual)
- auth.users 64→65 (só a conta criada)

IDs reais (owner_id/role_id) entregues apenas ao controlador na conversa; não publicados aqui.

## Estado privado para retomar
/tmp/issue333-63/state.json (phase=created_checkpoint, no_login), secret 0600, baseline.
Se o sandbox perder /tmp antes da retoma: a conta NÃO pode ser usada (sem senha) —
controlador deve banir e não criar outra sem nova autorização.

## Próximo (aguarda mensagem do controller)
Controller: SELECT independente + activation.INERTE.sql renderizado. Depois: login único,
par execute mesma prévia, revogação, check, finally logout/ban/sessions0.
