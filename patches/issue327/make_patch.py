"""#327 — gera patches/issue327/newgang-portal.patch a partir do HEAD (worktree temporária), de forma reprodutível.
Não toca no código deployável. Uso: python3 patches/issue327/make_patch.py"""
import os, subprocess, tempfile, shutil
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FN = "supabase/functions/newgang-portal"
src = subprocess.check_output(["git", "-C", ROOT, "show", f"{os.environ.get('BASE','HEAD')}:{FN}/index.ts"]).decode()
s = src
def rep(old, new):
    global s
    assert s.count(old) == 1, ("âncora não única/ausente", old[:80])
    s = s.replace(old, new)
# #327 aplicação: as tabelas novas (ex.: club_legacy_consumption com site_id+event_id na PK) criam uma 2.ª relação
# portal_sites↔events para o PostgREST; o embed tem de nomear a FK canónica.
rep("    `events(${[", "    `events!portal_sites_event_id_fkey(${[")
rep('import { PreSendError, sendWelcomeOnce } from "./welcome.ts";\n',
    'import { PreSendError, sendWelcomeOnce } from "./welcome.ts";\n'
    '// #327: leituras canónicas (nível com piso, conquistas, montra de regras) — mesma fonte para site, me, ranking e Wallet.\n'
    'import { levelFromPoints, memberLevel, referralProgress, rulesPublic, type MemberLevel, type RulesView } from "./club-canon.ts";\n'
    'const rpc = (fn: string, a: Record<string, unknown>) => sb.rpc(fn, a) as any;\n'
    '// Fórmula antiga (soma + club_levels) — só usada se club_member_level estiver ausente (reversão SQL #327 já aplicada).\n'
    'async function legacyLevel(memberId: string, siteId: string): Promise<MemberLevel> {\n'
    '  const { data: rows, error: e1 } = await sb.from("club_points").select("points").eq("member_id", memberId).limit(10000);\n'
    '  if (e1) throw new Error("legacy points: " + e1.message);\n'
    '  const pts = ((rows ?? []) as any[]).reduce((s, r) => s + r.points, 0);\n'
    '  const { data: lv, error: e2 } = await sb.from("club_levels").select("name, min_points").eq("site_id", siteId);\n'
    '  if (e2) throw new Error("legacy levels: " + e2.message);\n'
    '  return levelFromPoints(pts, (lv ?? []) as any);\n'
    '}\n'
    'const legacyRules = (rl: unknown): RulesView => ({ rules: ((rl ?? []) as any[]).filter((r) => r.active)\n'
    '  .map((r) => ({ rule_key: r.rule_key, label: r.label, points: Number(r.points), cap: null, scope: null })), unavailable: [], edition: null, version: null });\n')
rep('''    const { data: rows } = await sb.from("club_points").select("points").eq("member_id", memberId).limit(10000);
    points = ((rows ?? []) as any[]).reduce((s, r) => s + r.points, 0);
    const { data: lv } = await sb.from("club_levels").select("name").eq("site_id", siteId).lte("min_points", points).order("min_points", { ascending: false }).limit(1);
    level = (lv as any)?.[0]?.name ?? null;
''', '''    // #327: nível canónico (pontos + piso do cutover); erro de RPC propaga (walletSave falha, walletSync grava last_error).
    // Compatível com a reversão SQL: só se a RPC deixar de existir (PGRST202/42883) usa a fórmula antiga.
    const lv = await memberLevel(rpc, memberId, { legacy: () => legacyLevel(memberId, siteId) });
    points = lv.points; level = lv.level;
''')
rep('''  return { site: data, trackers, ticketing, club: { levels: lv ?? [], rules: rl ?? [], terms: termsMeta(tm) } };''',
    '''  // #327: a montra usa club_rules_public (valores pagos agora + disponibilidade); club_point_rules cru só se a RPC estiver ausente (reversão).
  const rv = await rulesPublic(rpc, site.id, async () => legacyRules(rl));
  return { site: data, trackers, ticketing, club: { levels: lv ?? [], rules: rv.rules, rules_unavailable: rv.unavailable, terms: termsMeta(tm) } };''')
rep('''  if (!row) return null;
  return assemblePublic(want, row, pubRows, eds);''', '''  if (!row) return null;
  const out = assemblePublic(want, row, pubRows, eds);
  if (want.site && out.site) {
    const club = (out.site as any).club;
    const rv = await rulesPublic(rpc, row.id, async () => legacyRules(club.rules)); // #327: mesma montra canónica do payload "site"
    club.rules = rv.rules; club.rules_unavailable = rv.unavailable;
  }
  return out;''')
rep('''        const { data: lv } = await sb.from("club_levels").select("name, min_points, benefit").eq("site_id", site.id).order("min_points");
        return json({
          first_name: member.first_name, member_no: member.member_no,
          points: me?.points ?? 0, level: me?.level_name ?? null, rank: me?.rank_pos ?? null,''',
'''        const { data: lv } = await sb.from("club_levels").select("name, min_points, benefit").eq("site_id", site.id).order("min_points");
        const cl: MemberLevel = await memberLevel(rpc, member.id, { legacy: () => legacyLevel(member.id, site.id) }); // #327: nível/piso/próximo nível canónicos
        return json({
          first_name: member.first_name, member_no: member.member_no,
          points: cl.points, level: cl.level, rank: me?.rank_pos ?? null,
          level_protected: cl.protected, next_level: cl.next_level, next_level_min: cl.next_level_min,
          referrals: await referralProgress(rpc, member.id),''')
tmp = tempfile.mkdtemp()
a = os.path.join(tmp, "a", FN); b = os.path.join(tmp, "b", FN)
os.makedirs(a); os.makedirs(b)
open(os.path.join(a, "index.ts"), "w").write(src); open(os.path.join(b, "index.ts"), "w").write(s)
shutil.copy(os.path.join(ROOT, "patches/issue327/club-canon.ts"), os.path.join(b, "club-canon.ts"))
d = subprocess.run(["diff", "-ruN", "a", "b"], cwd=tmp, capture_output=True, text=True).stdout
open(os.path.join(ROOT, "patches/issue327/newgang-portal.patch"), "w").write(d)
shutil.rmtree(tmp)
print("patch gerado:", len(d.splitlines()), "linhas")
