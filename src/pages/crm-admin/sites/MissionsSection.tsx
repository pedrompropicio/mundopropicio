import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Image as ImageIcon, Loader2, Pencil, Plus, Trash2, Trophy, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const db = supabase as any;
const ASSET_BUCKET = "club-mission-assets";
const PROOF_BUCKET = "club-proofs";
const IMG_MAX = 15 * 1024 * 1024;
const VID_MAX = 100 * 1024 * 1024;
export const REJECT_REASONS = [
  "Link não abre ou não é público",
  "Publicação não usa o criativo",
  "Falta a menção ou a hashtag",
  "Rede social errada",
  "Prova repetida ou de outra pessoa",
];
const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

type Asset = { path: string; type: "imagem" | "video"; name: string };
type Mission = {
  id?: string; kind: "postar" | "desafio"; title: string; description: string | null; network: string; points: number;
  proof_type: string; approval: string; mention: string | null; hashtag: string | null; caption_suggestion: string | null;
  assets: Asset[]; starts_at: string | null; ends_at: string | null; status: string; sort: number;
  finalist_points: number | null; winner_points: number | null; judging_until: string | null;
};
const EMPTY: Mission = {
  kind: "postar", title: "", description: "", network: "instagram", points: 50, proof_type: "link", approval: "automatica",
  mention: "@newgangfestival", hashtag: "", caption_suggestion: "", assets: [], starts_at: null, ends_at: null,
  status: "rascunho", sort: 0, finalist_points: null, winner_points: null, judging_until: null,
};
const toLocal = (v: string | null) => (v ? new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const pubUrl = (p: string) => supabase.storage.from(ASSET_BUCKET).getPublicUrl(p).data.publicUrl;
const err = (e: any) => toast.error(`Falha: ${e?.message ?? e}`);

export function MissionsSection({ siteId, companyId }: { siteId: string; companyId: string }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Mission | null>(null);
  const missions = useQuery({
    queryKey: ["club-missions", siteId],
    queryFn: async () => {
      const { data, error } = await db.from("club_missions").select("*").eq("site_id", siteId).order("sort").order("created_at");
      if (error) throw error;
      return (data ?? []) as Mission[];
    },
  });
  const counts = useQuery({
    queryKey: ["club-mission-counts", siteId],
    queryFn: async () => {
      const ids = (missions.data ?? []).map((m) => m.id);
      if (!ids.length) return {} as Record<string, Record<string, number>>;
      const { data } = await db.from("club_mission_submissions").select("mission_id, status").in("mission_id", ids);
      const out: Record<string, Record<string, number>> = {};
      for (const r of data ?? []) { out[r.mission_id] ??= {}; out[r.mission_id][r.status] = (out[r.mission_id][r.status] ?? 0) + 1; }
      return out;
    },
    enabled: !!missions.data,
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db.from("club_missions").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["club-missions", siteId] }),
    onError: err,
  });

  return (
    <div className="space-y-4 lg:col-span-2">
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Missões</h3>
          <Button size="sm" onClick={() => setEdit({ ...EMPTY, sort: (missions.data?.length ?? 0) + 1 })}><Plus className="mr-1 h-4 w-4" /> Nova missão</Button>
        </div>
        {missions.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (missions.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Ainda não há missões.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr>
              <th className="text-left">Missão</th><th className="text-left">Tipo</th><th className="text-left">Rede</th><th className="text-right">Pontos</th>
              <th className="text-left">Aprovação</th><th className="text-left">Prazo</th><th className="text-left">Estado</th><th className="text-right">Submissões</th><th />
            </tr></thead>
            <tbody>
              {(missions.data ?? []).map((m) => {
                const c = counts.data?.[m.id!] ?? {};
                const n = Object.values(c).reduce((a, b) => a + b, 0);
                return (
                  <tr key={m.id} className="border-t border-border/50 align-top">
                    <td className="py-1.5">{m.title}<div className="text-muted-foreground">{m.assets.length} criativo(s)</div></td>
                    <td>{m.kind === "desafio" ? "Desafio" : "Postar"}</td>
                    <td>{m.network}</td>
                    <td className="text-right font-mono">{m.points}{m.kind === "desafio" && <div className="text-muted-foreground">F {m.finalist_points ?? 0} · V {m.winner_points ?? 0}</div>}</td>
                    <td>{m.approval === "automatica" ? "Automática" : "Manual"}</td>
                    <td>{m.ends_at ? new Date(m.ends_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }) : "—"}</td>
                    <td><Badge variant={m.status === "ativa" ? "default" : "outline"}>{m.status}</Badge></td>
                    <td className="text-right font-mono">{n}{c.pendente ? <div className="text-warning">{c.pendente} pendente(s)</div> : null}</td>
                    <td className="space-x-1 whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEdit({ ...m })}><Pencil className="h-3.5 w-3.5" /></Button>
                      {m.status !== "ativa"
                        ? <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: m.id!, status: "ativa" })}>Ativar</Button>
                        : <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: m.id!, status: "encerrada" })}>Encerrar</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <ModerationQueue siteId={siteId} missions={missions.data ?? []} />
      {edit && <MissionEditor mission={edit} siteId={siteId} companyId={companyId} onClose={() => setEdit(null)} />}
    </div>
  );
}

function MissionEditor({ mission, siteId, companyId, onClose }: { mission: Mission; siteId: string; companyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [m, setM] = useState<Mission>(mission);
  const [busy, setBusy] = useState(false);
  const id = useMemo(() => mission.id ?? crypto.randomUUID(), [mission.id]);
  const set = (k: keyof Mission, v: any) => setM((x) => {
    const n = { ...x, [k]: v } as Mission;
    if (n.kind === "desafio") n.approval = "manual";
    return n;
  });

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const added: Asset[] = [];
    try {
      for (const f of Array.from(files)) {
        const isVid = f.type.startsWith("video/");
        if (!isVid && !f.type.startsWith("image/")) { toast.error(`"${f.name}": só imagens ou vídeos.`); continue; }
        if (f.size > (isVid ? VID_MAX : IMG_MAX)) { toast.error(`"${f.name}": máximo ${isVid ? "100" : "15"} MB.`); continue; }
        const ext = (f.name.split(".").pop() || (isVid ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${companyId}/${id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, f, { contentType: f.type, upsert: false });
        if (error) { toast.error(`Falha no upload de "${f.name}": ${error.message}`); continue; }
        added.push({ path, type: isVid ? "video" : "imagem", name: f.name });
      }
      if (added.length) setM((x) => ({ ...x, assets: [...x.assets, ...added] }));
    } finally { setBusy(false); }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!m.title.trim()) throw new Error("Falta o título");
      const row: any = {
        id, company_id: companyId, site_id: siteId, kind: m.kind, title: m.title.trim(), description: m.description || null,
        network: m.network, points: Number(m.points) || 0, proof_type: m.proof_type,
        approval: m.kind === "desafio" ? "manual" : m.approval, mention: m.mention || null, hashtag: m.hashtag || null,
        caption_suggestion: m.caption_suggestion || null, assets: m.assets, starts_at: m.starts_at, ends_at: m.ends_at,
        status: m.status, sort: Number(m.sort) || 0, updated_at: new Date().toISOString(),
        finalist_points: m.kind === "desafio" ? Number(m.finalist_points) || 0 : null,
        winner_points: m.kind === "desafio" ? Number(m.winner_points) || 0 : null,
        judging_until: m.kind === "desafio" ? m.judging_until : null,
      };
      const { error } = await db.from("club_missions").upsert(row);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Missão guardada"); qc.invalidateQueries({ queryKey: ["club-missions", siteId] }); onClose(); },
    onError: err,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{mission.id ? "Editar missão" : "Nova missão"}</DialogTitle></DialogHeader>
        <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label>Título</Label><Input value={m.title} onChange={(e) => set("title", e.target.value)} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Descrição</Label><Textarea value={m.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
          <div className="space-y-1"><Label>Tipo</Label>
            <select className={sel} value={m.kind} onChange={(e) => set("kind", e.target.value)}><option value="postar">Postar</option><option value="desafio">Desafio (júri)</option></select></div>
          <div className="space-y-1"><Label>Rede</Label>
            <select className={sel} value={m.network} onChange={(e) => set("network", e.target.value)}><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="qualquer">Qualquer</option></select></div>
          <div className="space-y-1"><Label>Pontos</Label><Input type="number" min={0} value={m.points} onChange={(e) => set("points", e.target.value)} /></div>
          <div className="space-y-1"><Label>Prova</Label>
            <select className={sel} value={m.proof_type} onChange={(e) => set("proof_type", e.target.value)}><option value="link">Link</option><option value="imagem">Imagem</option><option value="link_ou_imagem">Link ou imagem</option></select></div>
          <div className="space-y-1"><Label>Aprovação</Label>
            <select className={sel} value={m.approval} disabled={m.kind === "desafio"} onChange={(e) => set("approval", e.target.value)}><option value="automatica">Automática</option><option value="manual">Manual</option></select>
            {m.kind === "desafio" && <p className="text-[11px] text-muted-foreground">Desafios são sempre manuais.</p>}</div>
          <div className="space-y-1"><Label>Ordem</Label><Input type="number" value={m.sort} onChange={(e) => set("sort", e.target.value)} /></div>
          <div className="space-y-1"><Label>Menção</Label><Input value={m.mention ?? ""} onChange={(e) => set("mention", e.target.value)} placeholder="@newgangfestival" /></div>
          <div className="space-y-1"><Label>Hashtag</Label><Input value={m.hashtag ?? ""} onChange={(e) => set("hashtag", e.target.value)} placeholder="#newgang2027" /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Legenda sugerida</Label><Textarea value={m.caption_suggestion ?? ""} onChange={(e) => set("caption_suggestion", e.target.value)} /></div>
          <div className="space-y-1"><Label>Início</Label><Input type="datetime-local" value={toLocal(m.starts_at)} onChange={(e) => set("starts_at", fromLocal(e.target.value))} /></div>
          <div className="space-y-1"><Label>Fim</Label><Input type="datetime-local" value={toLocal(m.ends_at)} onChange={(e) => set("ends_at", fromLocal(e.target.value))} /></div>
          {m.kind === "desafio" && <>
            <div className="space-y-1"><Label>Pontos de finalista</Label><Input type="number" min={0} value={m.finalist_points ?? 0} onChange={(e) => set("finalist_points", e.target.value)} /></div>
            <div className="space-y-1"><Label>Pontos de vencedor</Label><Input type="number" min={0} value={m.winner_points ?? 0} onChange={(e) => set("winner_points", e.target.value)} /></div>
            <div className="space-y-1"><Label>Júri decide até</Label><Input type="datetime-local" value={toLocal(m.judging_until)} onChange={(e) => set("judging_until", fromLocal(e.target.value))} /></div>
          </>}
          <div className="space-y-1"><Label>Estado</Label>
            <select className={sel} value={m.status} onChange={(e) => set("status", e.target.value)}><option value="rascunho">Rascunho</option><option value="ativa">Ativa</option><option value="encerrada">Encerrada</option></select></div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Criativos (imagem até 15 MB, vídeo até 100 MB)</Label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {m.assets.map((a) => (
                <div key={a.path} className="relative overflow-hidden rounded-md border border-border">
                  {a.type === "video" ? <video src={pubUrl(a.path)} className="aspect-square w-full object-cover" muted controls /> : <img src={pubUrl(a.path)} alt={a.name} className="aspect-square w-full object-cover" />}
                  <button type="button" aria-label="Remover criativo" className="absolute right-1 top-1 rounded bg-background/80 p-1"
                    onClick={() => setM((x) => ({ ...x, assets: x.assets.filter((y) => y.path !== a.path) }))}><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted-foreground">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Carregar
                <input type="file" multiple accept="image/*,video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || busy}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModerationQueue({ siteId, missions }: { siteId: string; missions: Mission[] }) {
  const qc = useQueryClient();
  const [mission, setMission] = useState("");
  const [status, setStatusF] = useState("pendente");
  const [network, setNetwork] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reject, setReject] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const byId = useMemo(() => Object.fromEntries(missions.map((m) => [m.id, m])), [missions]);

  const q = useQuery({
    queryKey: ["club-mission-queue", siteId, mission, status, network],
    queryFn: async () => {
      let x = db.from("club_mission_submissions")
        .select("id, mission_id, status, auto_approved, proof_url, proof_image_path, reject_reason, created_at, club_missions!inner(site_id, network, kind, title), club_members(email, first_name, instagram_handle, tiktok_handle)")
        .eq("club_missions.site_id", siteId).order("created_at", { ascending: true }).limit(300);
      if (mission) x = x.eq("mission_id", mission);
      if (network) x = x.eq("club_missions.network", network);
      if (status === "auto") x = x.eq("status", "aprovada").eq("auto_approved", true);
      else if (status) x = x.eq("status", status);
      const { data, error } = await x;
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return rows.sort((a, b) => Number(b.status === "pendente") - Number(a.status === "pendente"));
    },
  });
  const review = useMutation({
    mutationFn: async ({ ids, st, why }: { ids: string[]; st: string; why?: string }) => {
      const { error } = await db.rpc("club_mission_review", { p_subs: ids, p_status: st, p_reason: why ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      setPicked(new Set()); setReject(null); setReason("");
      qc.invalidateQueries({ queryKey: ["club-mission-queue", siteId] });
      qc.invalidateQueries({ queryKey: ["club-mission-counts", siteId] });
      qc.invalidateQueries({ queryKey: ["club-ranking", siteId] });
    },
    onError: err,
  });
  const openProof = async (path: string) => {
    const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, 3600);
    if (error || !data) return err(error);
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const rows = q.data ?? [];
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Fila de moderação</h3>
        <select aria-label="Missão" className={sel} value={mission} onChange={(e) => setMission(e.target.value)}>
          <option value="">Todas as missões</option>{missions.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
        <select aria-label="Estado" className={sel} value={status} onChange={(e) => setStatusF(e.target.value)}>
          <option value="">Todos os estados</option><option value="pendente">Pendentes</option><option value="auto">Aprovadas automaticamente</option>
          <option value="aprovada">Aprovadas</option><option value="rejeitada">Rejeitadas</option><option value="finalista">Finalistas</option><option value="vencedora">Vencedoras</option>
        </select>
        <select aria-label="Rede" className={sel} value={network} onChange={(e) => setNetwork(e.target.value)}>
          <option value="">Todas as redes</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="qualquer">Qualquer</option>
        </select>
        <Button size="sm" disabled={!picked.size || review.isPending} onClick={() => review.mutate({ ids: [...picked], st: "aprovada" })}>
          <Check className="mr-1 h-4 w-4" /> Aprovar {picked.size || ""}
        </Button>
        <Button size="sm" variant="outline" disabled={!picked.size} onClick={() => setReject([...picked])}><X className="mr-1 h-4 w-4" /> Rejeitar</Button>
      </div>
      {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : rows.length === 0 ? <p className="text-xs text-muted-foreground">Nada nesta fila.</p> : (
        <table className="w-full text-xs">
          <thead className="text-muted-foreground"><tr><th /><th className="text-left">Membro</th><th className="text-left">Missão</th><th className="text-left">Prova</th><th className="text-left">Estado</th><th className="text-left">Enviada</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const mb = r.club_members ?? {};
              const isChallenge = (byId[r.mission_id]?.kind ?? r.club_missions?.kind) === "desafio";
              return (
                <tr key={r.id} className="border-t border-border/50 align-top">
                  <td className="py-1.5"><Checkbox checked={picked.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label="Selecionar" /></td>
                  <td>{mb.first_name || mb.email}<div className="text-muted-foreground">{[mb.instagram_handle && `IG @${mb.instagram_handle}`, mb.tiktok_handle && `TT @${mb.tiktok_handle}`].filter(Boolean).join(" · ") || "sem @"}</div></td>
                  <td>{r.club_missions?.title}<div className="text-muted-foreground">{r.club_missions?.network}</div></td>
                  <td className="space-y-1">
                    {r.proof_url && <a href={r.proof_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline"><ExternalLink className="h-3 w-3" /> Abrir link</a>}
                    {r.proof_image_path && <button type="button" className="flex items-center gap-1 text-primary hover:underline" onClick={() => openProof(r.proof_image_path)}><ImageIcon className="h-3 w-3" /> Ver imagem</button>}
                  </td>
                  <td><Badge variant={r.status === "pendente" ? "outline" : "secondary"}>{r.status}</Badge>{r.auto_approved && <div className="text-muted-foreground">automática</div>}{r.reject_reason && <div className="text-muted-foreground">{r.reject_reason}</div>}</td>
                  <td>{new Date(r.created_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}</td>
                  <td className="space-x-1 whitespace-nowrap text-right">
                    {r.status !== "aprovada" && <Button size="sm" variant="ghost" onClick={() => review.mutate({ ids: [r.id], st: "aprovada" })}>Aprovar</Button>}
                    {r.status !== "rejeitada" && <Button size="sm" variant="ghost" onClick={() => setReject([r.id])}>Rejeitar</Button>}
                    {isChallenge && r.status !== "finalista" && r.status !== "rejeitada" && <Button size="sm" variant="ghost" onClick={() => review.mutate({ ids: [r.id], st: "finalista" })}>Finalista</Button>}
                    {isChallenge && r.status !== "vencedora" && r.status !== "rejeitada" && <Button size="sm" variant="ghost" onClick={() => review.mutate({ ids: [r.id], st: "vencedora" })}><Trophy className="mr-1 h-3 w-3" />Vencedora</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <Dialog open={!!reject} onOpenChange={(o) => !o && setReject(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rejeitar {reject?.length ?? 0} submissão(ões)</DialogTitle></DialogHeader>
          <div className="flex flex-wrap gap-1">
            {REJECT_REASONS.map((r) => <Button key={r} size="sm" variant={reason === r ? "default" : "outline"} onClick={() => setReason(r)}>{r}</Button>)}
          </div>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (visível para o membro)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReject(null)}>Cancelar</Button>
            <Button disabled={!reason.trim() || review.isPending} onClick={() => reject && review.mutate({ ids: reject, st: "rejeitada", why: reason })}>Rejeitar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
