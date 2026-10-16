"""#326 — Compara md5(pg_get_functiondef) local (migrações do repo) com o snapshot Live."""
import json, sys
live = {k: v for k, v in json.load(open(sys.argv[1])).items() if not k.startswith("_")}
local = dict(l.split() for l in open(sys.argv[2]) if l.strip())
SCOPE = ["club_award", "club_award_fixed", "club_confirm_member", "club_crew_cfg", "club_crew_check",
         "club_crew_create", "club_crew_gen_code", "club_crew_join", "club_crew_leave", "club_crew_name_ok",
         "club_upsert_member", "club_gen_referral_code", "club_from_lead_capture", "club_record_terms"]
res = {}
for f in sorted(set(live) | set(local)):
    res[f] = {"live": live.get(f), "local": local.get(f), "equal": live.get(f) == local.get(f) and f in local,
              "in_scope": f in SCOPE}
json.dump(res, open(sys.argv[3], "w"), indent=1)
for f in SCOPE:
    r = res.get(f, {})
    print(f"hash {f}: {'IGUAL' if r.get('equal') else 'DIFERENTE'} local={r.get('local')} live={r.get('live')}")
diff = [f for f in SCOPE if not res.get(f, {}).get("equal")]
print("equivalencia_scope:", "OK" if not diff else "DIFERENCAS " + ",".join(diff))
print(f"in_scope_iguais: {len(SCOPE) - len(diff)}/{len(SCOPE)}")
if diff:
    sys.exit(3)
