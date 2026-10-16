"""#328 — Depois do patch local: funções alteradas = as do SQL pendente (corpo verbatim);
as restantes do âmbito #326 continuam com hash igual ao snapshot Live (não atualizado)."""
import json, sys, re
live = {k: v for k, v in json.load(open(sys.argv[1])).items() if not k.startswith("_")}
local = dict(l.split(" ", 1) for l in open(sys.argv[2]).read().splitlines() if l.strip())
pending = open(sys.argv[3]).read()
bodies = json.load(open(sys.argv[4]))  # {nome: prosrc}
out = sys.argv[5]
CHANGED = {"club_upsert_member", "club_confirm_member", "club_crew_pending"}
SCOPE = ["club_award", "club_award_fixed", "club_confirm_member", "club_crew_cfg", "club_crew_check",
         "club_crew_create", "club_crew_gen_code", "club_crew_join", "club_crew_leave", "club_crew_name_ok",
         "club_upsert_member", "club_gen_referral_code", "club_from_lead_capture", "club_record_terms"]
declared = set(re.findall(r"CREATE OR REPLACE FUNCTION public\.(\w+)\(", pending))
bad = []
if declared != CHANGED: bad.append(f"declaradas no pendente {sorted(declared)} != {sorted(CHANGED)}")
res = {}
for f in sorted(set(SCOPE) | CHANGED):
    r = {"live": live.get(f), "after_local": local.get(f)}
    if f in CHANGED:
        r["kind"] = "alterada_pelo_pendente"
        r["body_verbatim_no_pendente"] = bool(bodies.get(f)) and ("$$" + bodies[f] + "$$") in pending
        r["differs_from_live"] = local.get(f) != live.get(f)
        if not (r["body_verbatim_no_pendente"] and r["differs_from_live"] and local.get(f)): bad.append(f)
    else:
        r["kind"] = "inalterada"; r["equal_live"] = local.get(f) == live.get(f)
        if not r["equal_live"]: bad.append(f)
    res[f] = r
json.dump({"ok": not bad, "problemas": bad, "funcoes": res}, open(out, "w"), indent=1)
for f, r in res.items(): print("patch", f, r["kind"], r.get("equal_live", r.get("body_verbatim_no_pendente")), r["after_local"])
print("patch_guard:", "OK" if not bad else "FALHA " + ",".join(bad))
if bad: sys.exit(3)
