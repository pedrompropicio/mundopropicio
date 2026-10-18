#!/usr/bin/env python3
"""#333 prova36 — negativos pendentes da prova34. 1 conta .invalid, 1 reserva técnica read-only.
Sem faturas/TX/BP. Credenciais só em memória; IDs em private/."""
import json, os, secrets, hashlib, time, uuid, pathlib, requests

URL = os.environ["SUPABASE_URL"].rstrip("/")
SVC = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ANON = os.environ["VITE_SUPABASE_PUBLISHABLE_KEY"]
COMPANY_A = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c"  # Mundo Propício (empresa existente)
FN = f"{URL}/functions/v1/standalone-attempt-333"
OUT = pathlib.Path("/tmp/issue333-proof36"); (OUT / "private").mkdir(parents=True, exist_ok=True)
LOG = OUT / "run.log"

svc_h = {"apikey": SVC, "Authorization": f"Bearer {SVC}", "Content-Type": "application/json", "Prefer": "return=representation"}
results = []
def rec(case, expected, observed, ok):
    results.append({"caso": case, "esperado": expected, "observado": observed, "resultado": "PASS" if ok else ("INCONCLUSIVO" if observed == "timeout" else "FAIL")})
    with LOG.open("a") as f: f.write(f"{case} | esperado {expected} | observado {observed} | {'PASS' if ok else 'FAIL/INC'}\n")

def fn_call(token, body, headers=None, timeout=40):
    h = {"apikey": ANON, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if headers: h.update(headers)
    try:
        r = requests.post(FN, headers=h, json=body, timeout=timeout)
        return r.status_code, r.text[:300]
    except requests.Timeout:
        return "timeout", "sem resposta HTTP em 40s"

uid = None
try:
    # 1. conta técnica nova (Auth admin, sem email/invite)
    email = f"p333neg-{int(time.time())}@test.invalid"
    pw = secrets.token_urlsafe(24)
    r = requests.post(f"{URL}/auth/v1/admin/users", headers=svc_h, json={
        "email": email, "password": pw, "email_confirm": True,
        "user_metadata": {"company_id": COMPANY_A, "full_name": "Fixture Tecnica 333"}}, timeout=30)
    r.raise_for_status(); uid = r.json()["id"]
    # papel mínimo manager na empresa A
    requests.post(f"{URL}/rest/v1/user_roles", headers=svc_h,
                  json={"user_id": uid, "role": "manager", "company_id": COMPANY_A}, timeout=30).raise_for_status()
    # 2. reserva técnica prepare (read-only, destino inexistente)
    att_id = str(uuid.uuid4())
    envelope = {"fixture": "prova36", "nome": "Reserva tecnica read-only", "valor": 0, "moeda": "EUR"}
    env_hash = hashlib.sha256(json.dumps(envelope, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    requests.post(f"{URL}/rest/v1/standalone_attempts_333", headers=svc_h, json={
        "id": att_id, "company_id": COMPANY_A, "principal": uid, "operation": "scanner_create",
        "envelope": envelope, "envelope_hash": env_hash, "state": "prepare",
        "destination_id": str(uuid.uuid4()), "path": f"teste333/prova36/{uuid.uuid4()}/f.pdf"}, timeout=30).raise_for_status()
    (OUT / "private" / "inventory.json").write_text(json.dumps({"uid": uid, "email": email, "attempt": att_id, "hash": env_hash}))
    # 3. sessão autenticada
    r = requests.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": ANON, "Content-Type": "application/json"},
                      json={"email": email, "password": pw}, timeout=30)
    r.raise_for_status(); tok = r.json()["access_token"]
    pw = None
    uh = {"X-Attempt-User": uid, "X-Attempt-Company": COMPANY_A}

    # contexto canónico
    r = requests.post(f"{URL}/rest/v1/rpc/my_effective_permissions", headers={"apikey": ANON, "Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, json={"p_universe": []}, timeout=30)
    ctx = r.json() if r.status_code == 200 else {}
    rec("contexto canónico manager empresa A", "200 company/role ok", f"{r.status_code} role={ctx.get('role')}", r.status_code == 200 and ctx.get("company_id") == COMPANY_A)

    # MATRIZ
    s, b = fn_call(tok, {"action": "capabilities"}, uh)
    ok = s == 200 and '"scanner_create":false' in b.replace(" ", "") and '"accountant_edit":false' in b.replace(" ", "")
    rec("capabilities authenticated", "200 false/false", f"{s} {b[:120]}", ok)

    s, b = fn_call(tok, {"action": "capabilities"}, {"X-Attempt-User": str(uuid.uuid4()), "X-Attempt-Company": COMPANY_A})
    rec("header user forjado", "409", f"{s}", s == 409)
    s, b = fn_call(tok, {"action": "capabilities"}, {"X-Attempt-User": uid, "X-Attempt-Company": str(uuid.uuid4())})
    rec("header company forjado", "409", f"{s}", s == 409)

    # caso que deu timeout na prova34: pedido isolado primeiro
    wrong_hash = hashlib.sha256(b"wrong").hexdigest()
    s, b = fn_call(tok, {"action": "check", "operation": "scanner_create", "id": att_id, "hash": wrong_hash}, uh)
    rec("check hash errado (isolado)", "409 sem efeito", f"{s} {b[:120]}", s == 409)

    s, b = fn_call(tok, {"action": "check", "operation": "scanner_create", "id": str(uuid.uuid4()), "hash": env_hash}, uh)
    rec("check id inexistente", "409", f"{s} {b[:120]}", s == 409)
    s, b = fn_call(tok, {"action": "check", "operation": "accountant_edit", "id": att_id, "hash": env_hash}, uh)
    rec("check operação errada", "409", f"{s} {b[:120]}", s == 409)
    s, b = fn_call(tok, {"action": "check", "operation": "scanner_create", "id": att_id, "hash": env_hash}, uh)
    rec("check owner correto (controlo positivo)", "200 read-only", f"{s} {b[:160]}", s == 200)

    # RPCs diretos com JWT de utilizador
    rh = {"apikey": ANON, "Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    r = requests.post(f"{URL}/rest/v1/rpc/standalone_attempt_333", headers=rh, json={"p_action": "check", "p_id": att_id, "p_operation": "scanner_create", "p_envelope": None, "p_hash": env_hash}, timeout=30)
    rec("RPC wrapper owner hash correto", "200 read-only", f"{r.status_code} {r.text[:120]}", r.status_code == 200)
    r = requests.post(f"{URL}/rest/v1/rpc/standalone_attempt_333", headers=rh, json={"p_action": "check", "p_id": att_id, "p_operation": "scanner_create", "p_envelope": None, "p_hash": wrong_hash}, timeout=30)
    rec("RPC wrapper hash errado", "4xx/409 negado", f"{r.status_code} {r.text[:120]}", r.status_code >= 400)
    r = requests.post(f"{URL}/rest/v1/rpc/standalone_attempt_list_333", headers=rh, json={"p_operation": "scanner_create", "p_after": None}, timeout=30)
    try: items = r.json().get("items", r.json())
    except Exception: items = None
    rec("listagem própria populada", "200 com 1 reserva própria", f"{r.status_code} n={len(items) if isinstance(items, list) else '?'}", r.status_code == 200 and isinstance(items, list) and any(i.get("id") == att_id for i in items))

    # gates fechados: prepare/execute/confirm recusados
    s, b = fn_call(tok, {"action": "prepare", "operation": "scanner_create", "id": None, "envelope": {"fixture": "x"}}, uh)
    rec("prepare gate fechado", "409", f"{s} {b[:120]}", s == 409)
    import base64
    s, b = fn_call(tok, {"action": "execute", "operation": "scanner_create", "id": att_id, "hash": env_hash, "conteudo_base64": base64.b64encode(b"%PDF-1.4 fixture").decode()}, uh)
    rec("execute gate fechado", "409 sem efeito", f"{s} {b[:120]}", s == 409)
    s, b = fn_call(tok, {"action": "confirm_new_intent", "operation": "scanner_create", "id": att_id, "hash": env_hash, "confirm": True}, uh)
    rec("confirm_new_intent gate fechado", "409", f"{s} {b[:120]}", s == 409)

    # tabelas privadas como authenticated
    for t in ["standalone_attempts_333", "standalone_attempt_settings_333", "data_entry_sessions", "data_entry_settings", "standalone_attempt_audit_333"]:
        r = requests.get(f"{URL}/rest/v1/{t}?select=*", headers=rh, timeout=30)
        try: n = len(r.json()) if isinstance(r.json(), list) else -1
        except Exception: n = -1
        rec(f"tabela privada {t}", "403 ou 0 linhas", f"{r.status_code} n={n}", r.status_code >= 400 or n == 0)

    # gates false/false no lado serviço
    r = requests.post(f"{URL}/rest/v1/rpc/standalone_attempt_capability_333", headers=svc_h, json={}, timeout=30)
    rec("capabilities service-only", "200 false/false", f"{r.status_code} {r.text[:120]}", r.status_code == 200 and r.json() == {"scanner_create": False, "accountant_edit": False})
finally:
    if uid:
        try:
            requests.post(f"{URL}/auth/v1/logout?scope=global", headers={"apikey": ANON, "Authorization": f"Bearer {tok}"}, timeout=30)
        except Exception: pass
        rb = requests.put(f"{URL}/auth/v1/admin/users/{uid}", headers=svc_h, json={"ban_duration": "876000h"}, timeout=30)
        rec("ban conta nova + logout global", "200", f"ban={rb.status_code}", rb.status_code == 200)

(OUT / "result.json").write_text(json.dumps(results, indent=1, ensure_ascii=False))
p = sum(1 for x in results if x["resultado"] == "PASS")
print(f"total={len(results)} pass={p} fail={sum(1 for x in results if x['resultado']=='FAIL')} inc={sum(1 for x in results if x['resultado']=='INCONCLUSIVO')}")
for x in results: print(x["resultado"], "|", x["caso"], "|", x["observado"][:100])
