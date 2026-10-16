import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useClubActiveConfig } from "@/hooks/useClubActiveConfig";
import { crewRuleWrite, ruleSource } from "@/lib/club-config-source";

const db = supabase as any;
const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }) : "—");

type Crew = {
  id: string; name: string; code: string; created_at: string; completed_at: string | null;
  owner: { first_name: string | null; email: string } | null;
  club_crew_members: Array<{ member_id: string; joined_at: string; club_members: { first_name: string | null; email: string; confirmed_at: string | null } | null }>;
};

export function CrewsSection({ siteId, companyId, eventId = null }: { siteId: string; companyId: string; eventId?: string | null }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Crew | null>(null);
  const crews = useQuery({
    queryKey: ["club-crews", siteId],
    queryFn: async () => {
      const { data, error } = await db.from("club_crews")
        .select("id, name, code, created_at, completed_at, owner:club_members!club_crews_owner_member_id_fkey(first_name, email), club_crew_members(member_id, joined_at, club_members(first_name, email, confirmed_at))")
        .eq("site_id", siteId).order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as Crew[];
    },
  });
  const rule = useQuery({
    queryKey: ["club-crew-rule", siteId],
    queryFn: async () => {
      const { data, error } = await db.from("club_point_rules").select("id, points, min_members, max_members, active").eq("site_id", siteId).eq("rule_key", "crew_complete").maybeSingle();
      if (error) throw error;
      return data as { id: string; points: number; min_members: number | null; max_members: number | null; active: boolean } | null;
    },
  });
  const activeCfg = useClubActiveConfig(siteId);
  const source = ruleSource(activeCfg.data ?? null, { rule_key: "crew_complete", points: rule.data?.points ?? 200 }, eventId);
  const ready = activeCfg.ready && rule.isSuccess && !rule.isFetching && !rule.isError;
  const [cfg, setCfg] = useState({ points: 200, min: 4, max: 6, active: true });
  useEffect(() => {
    setCfg({ points: rule.data?.points ?? 200, min: rule.data?.min_members ?? 4, max: rule.data?.max_members ?? 6, active: rule.data?.active ?? true });
  }, [siteId, rule.data]);
  const save = useMutation({
    mutationFn: async () => {
      if (cfg.min < 2 || cfg.max < cfg.min || cfg.points < 0) throw new Error("Limites inválidos (mín ≥ 2, máx ≥ mín)");
      if (!ready) throw new Error("Configuração do Clube não verificada");
      const latest = await activeCfg.refetch();
      if (latest.isError || latest.data === undefined) throw new Error("Configuração do Clube não verificada");
      if (latest.data && !rule.data) throw new Error("Regra Crew ausente: configuração inconsistente");
      if (latest.data && latest.data.event_id !== eventId) throw new Error("Edição sem configuração ativa");
      const row = crewRuleWrite(latest.data, cfg);
      const { error } = rule.data
        ? await db.from("club_point_rules").update(row).eq("id", rule.data.id).eq("site_id", siteId)
        : await db.from("club_point_rules").insert({ ...row, company_id: companyId, site_id: siteId, rule_key: "crew_complete", label: "Crew completa" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Configuração guardada"); qc.invalidateQueries({ queryKey: ["club-crew-rule", siteId] }); qc.invalidateQueries({ queryKey: ["club-table", "club_point_rules", siteId] }); },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? e}`),
  });
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (crews.data ?? []).filter((c) => !t || c.name.toLowerCase().includes(t) || c.code.toLowerCase().includes(t)
      || c.club_crew_members.some((m) => (m.club_members?.email ?? "").toLowerCase().includes(t) || (m.club_members?.first_name ?? "").toLowerCase().includes(t)));
  }, [crews.data, q]);

  return (
    <Card className="space-y-3 p-4">
      <h3 className="text-sm font-semibold">Crews</h3>
      {!ready && <p role="status" className="text-sm text-muted-foreground">{activeCfg.isError || rule.isError ? "Não foi possível verificar a configuração do Clube." : "A verificar configuração do Clube…"}</p>}
      {ready && source.version && <p className="text-xs text-muted-foreground">{source.version} · {source.scope} · uma vez por membro. {source.available ? "" : "Edição sem configuração."}</p>}
      <fieldset disabled={!ready || save.isPending || (!!activeCfg.data && !source.available)} className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:items-end">
        <div><Label className="text-xs">Pontos por membro</Label><Input aria-label="Pontos por membro" type="number" value={ready ? (source.editable ? cfg.points : source.points) : ""} disabled={!ready || !source.editable} readOnly={!source.editable} onChange={(e) => setCfg({ ...cfg, points: +e.target.value })} /></div>
        <div><Label className="text-xs">Mínimo confirmados</Label><Input type="number" value={cfg.min} onChange={(e) => setCfg({ ...cfg, min: +e.target.value })} /></div>
        <div><Label className="text-xs">Máximo membros</Label><Input type="number" value={cfg.max} onChange={(e) => setCfg({ ...cfg, max: +e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.active} onChange={(e) => setCfg({ ...cfg, active: e.target.checked })} /> Ativa</label>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button>
      </fieldset>
      <Input placeholder="Pesquisar nome, código ou membro" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 ? <p className="text-sm text-muted-foreground">Sem crews.</p> : (
        <table className="w-full text-xs">
          <thead className="text-muted-foreground"><tr><th className="text-left">Crew</th><th className="text-left">Dono</th><th className="text-left">Confirmados / total</th><th className="text-left">Completa</th><th className="text-left">Criada</th></tr></thead>
          <tbody>
            {list.map((c) => {
              const conf = c.club_crew_members.filter((m) => m.club_members?.confirmed_at).length;
              return (
                <tr key={c.id} className="cursor-pointer border-t border-border/50 hover:bg-muted/40" onClick={() => setOpen(c)}>
                  <td className="py-1.5">{c.name} <span className="text-muted-foreground">· {c.code}</span></td>
                  <td>{c.owner?.first_name || c.owner?.email}</td>
                  <td>{conf} / {c.club_crew_members.length}</td>
                  <td>{c.completed_at ? <Badge variant="secondary">sim</Badge> : <Badge variant="outline">não</Badge>}</td>
                  <td>{fmt(c.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{open?.name} · {open?.code}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Criada {fmt(open?.created_at ?? null)} · completa {fmt(open?.completed_at ?? null)}</p>
          <div className="space-y-1 text-sm">
            {open?.club_crew_members.map((m) => (
              <div key={m.member_id} className="flex justify-between border-b border-border/40 py-1">
                <span>{m.club_members?.first_name || "—"} <span className="text-muted-foreground">{m.club_members?.email}</span></span>
                <span className="text-muted-foreground">{m.club_members?.confirmed_at ? "confirmado" : "por confirmar"} · {fmt(m.joined_at)}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
