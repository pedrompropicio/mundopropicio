"""#327 — guard de proveniência. Modo base: hashes locais (migrações+0176) == snapshot Live pós-0176 para todas
as funções carregadas; as não carregadas têm de estar na lista explícita NOT_LOADED. Modo patch: só as funções
declaradas no pendente mudam/aparecem; corpo verbatim no pendente; as restantes continuam = Live."""
import json, sys, re
mode, livef, localf, out = sys.argv[1:5]
live = {k: v for k, v in json.load(open(livef)).items() if k not in ("_source", "_acl_live", "_acl_live_map")}
local = dict(l.split(" ", 1) for l in open(localf).read().splitlines() if l.strip())
NOT_LOADED = {"club_welcome_mark", "club_welcome_reserve"}  # vêm de 0170/0171 (#321, emails) — fora do âmbito, não carregadas
bad, res = [], {}
if mode == "base":
    for f in sorted(set(live) | set(local)):
        if f in NOT_LOADED and f not in local: res[f] = "nao_carregada_explicito"; continue
        ok = live.get(f) == local.get(f)
        res[f] = "igual" if ok else f"DIFERENTE local={local.get(f)} live={live.get(f)}"
        if not ok: bad.append(f)
else:
    pending = open(sys.argv[5]).read(); bodies = json.load(open(sys.argv[6]))
    declared = set(re.findall(r"CREATE OR REPLACE FUNCTION public\.(\w+)\(", pending))
    for f in sorted(set(live) | set(local) | declared):
        if f in NOT_LOADED and f not in local: res[f] = "nao_carregada_explicito"; continue
        if f in declared:
            verb = bool(bodies.get(f)) and ("$$" + bodies[f] + "$$") in pending
            res[f] = {"kind": "nova" if f not in live else "alterada", "verbatim": verb, "hash": local.get(f), "live": live.get(f)}
            if not verb or not local.get(f) or local.get(f) == live.get(f): bad.append(f)
        else:
            ok = live.get(f) == local.get(f); res[f] = "inalterada_igual_live" if ok else "DIFERENTE"
            if not ok: bad.append(f)
json.dump({"mode": mode, "ok": not bad, "problemas": bad, "funcoes": res}, open(out, "w"), indent=1, sort_keys=True)
print(f"guard327 {mode}:", "OK" if not bad else "FALHA " + ",".join(bad), f"({len(res)} funções)")
if bad: sys.exit(3)
