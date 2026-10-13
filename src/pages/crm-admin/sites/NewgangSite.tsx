import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentCompanyId } from "@/hooks/useCompany";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineupTab } from "@/pages/crm-admin/eventos/LineupTab";
import { EventTrackersCard } from "@/pages/crm-admin/eventos/EventTrackersCard";
import { buildLineup } from "../../../../supabase/functions/newgang-portal/lineup";
import {
  detectVideoProvider,
  EditionVideo,
  MAX_EDITION_PHOTOS,
  toWebp,
  uploadEditionPhotos,
  EDITION_BUCKET,
} from "@/lib/newgang-media";
import { ClubTermsSection } from "./ClubTermsSection";
import { NEWGANG_CONTENT_GROUPS, cleanNewgangContent } from "@/lib/newgang-content";

const SITE_DOMAIN = "newgangfestival.pt";
const db = supabase as any;
const err = (e: any) => toast.error(`Falha: ${e?.message ?? e}`);

type Site = {
  id: string;
  company_id: string;
  domain: string;
  event_id: string | null;
  brand_key: string;
  gtm_container_id: string | null;
  site_pixel_id: string | null;
  og_image_url: string | null;
  favicon_url: string | null;
  google_site_verification: string | null;
  facebook_domain_verification: string | null;
  content: Record<string, string>;
  active: boolean;
};

export default function NewgangSite() {
  const site = useQuery({
    queryKey: ["portal-site", SITE_DOMAIN],
    queryFn: async (): Promise<Site | null> => {
      const { data, error } = await db.from("portal_sites").select("*").eq("domain", SITE_DOMAIN).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (site.isLoading)
    return (
      <div className="flex items-center p-8 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> A carregar…
      </div>
    );
  if (!site.data)
    return (
      <div className="p-6">
        <Card className="p-6 text-sm text-muted-foreground">
          O site {SITE_DOMAIN} ainda não está configurado nesta empresa.
        </Card>
      </div>
    );
  const s = site.data;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Site Newgang</h1>
        <p className="text-sm text-muted-foreground">{s.domain}</p>
      </div>
      <Tabs defaultValue="geral">
        <TabsList className="flex-wrap">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="lineup">Line-up e revelações</TabsTrigger>
          <TabsTrigger value="historia">História</TabsTrigger>
          <TabsTrigger value="clube">Clube</TabsTrigger>
          <TabsTrigger value="bilhetes">Bilhetes</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
        </TabsList>
        <TabsContent value="geral"><GeneralTab site={s} /></TabsContent>
        <TabsContent value="lineup">
          {s.event_id ? <LineupSection site={s} /> : <NoEvent />}
        </TabsContent>
        <TabsContent value="historia"><HistoryTab site={s} /></TabsContent>
        <TabsContent value="clube"><ClubTab site={s} /></TabsContent>
        <TabsContent value="bilhetes">{s.event_id ? <TicketsTab eventId={s.event_id} /> : <NoEvent />}</TabsContent>
        <TabsContent value="tracking">
          <div className="space-y-4">
            {s.event_id ? <EventTrackersCard eventId={s.event_id} disabled={false} /> : <NoEvent />}
            <p className="text-xs text-muted-foreground">
              O portal recebe sempre os trackers do evento deste site, mesmo que o evento não esteja visível no portal MP. GTM e pixel do site editam-se em Geral.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const NoEvent = () => <Card className="p-4 text-sm text-muted-foreground">Este site não tem evento associado.</Card>;

function Field({ label, value, onChange, area }: { label: string; value: string; onChange: (v: string) => void; area?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {area ? (
        <Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

export function NewgangContentFields({ content, onChange }: { content: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-5">
      {NEWGANG_CONTENT_GROUPS.map((g) => (
        <section key={g.title} className="space-y-3">
          <h3 className="text-sm font-semibold">{g.title}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {g.fields.map((f) => (
              <div key={f.key} className={f.multiline ? "space-y-1.5 md:col-span-2" : "space-y-1.5"}>
                <Label htmlFor={`ng-c-${f.key}`} className="text-sm">{f.label}</Label>
                {f.multiline ? (
                  <Textarea id={`ng-c-${f.key}`} name={f.key} rows={4} placeholder={f.placeholder} value={content[f.key] ?? ""} onChange={(e) => onChange(f.key, e.target.value)} />
                ) : (
                  <Input id={`ng-c-${f.key}`} name={f.key} placeholder={f.placeholder} value={content[f.key] ?? ""} onChange={(e) => onChange(f.key, e.target.value)} />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">Campo vazio = o site mostra o texto por omissão (o que aparece a cinzento).</p>
    </div>
  );
}
const SITE_FIELDS: Array<[keyof Site, string]> = [
  ["gtm_container_id", "GTM container"],
  ["site_pixel_id", "Pixel do site"],
  ["og_image_url", "Imagem de partilha (URL)"],
  ["favicon_url", "Favicon (URL)"],
  ["google_site_verification", "Google site verification"],
  ["facebook_domain_verification", "Facebook domain verification"],
];

function GeneralTab({ site }: { site: Site }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Site>(site);
  useEffect(() => setD(site), [site]);
  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { content: cleanNewgangContent(d.content), updated_at: new Date().toISOString() };
      for (const [k] of SITE_FIELDS) payload[k] = (d[k] as string)?.trim() || null;
      const { error } = await db.from("portal_sites").update(payload).eq("id", site.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Site guardado.");
      qc.invalidateQueries({ queryKey: ["portal-site"] });
    },
    onError: err,
  });
  const setC = (k: string, v: string) => setD({ ...d, content: { ...(d.content ?? {}), [k]: v } });
  return (
    <Card className="space-y-4 p-4">
      <p className="text-sm">Domínio: <strong>{d.domain}</strong> · Evento: <code className="text-xs">{d.event_id ?? "—"}</code></p>
      <div className="grid gap-3 md:grid-cols-2">
        {SITE_FIELDS.map(([k, l]) => (
          <Field key={k} label={l} value={(d[k] as string) ?? ""} onChange={(v) => setD({ ...d, [k]: v })} />
        ))}
      </div>
      <NewgangContentFields content={d.content ?? {}} onChange={setC} />
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
        </Button>
      </div>
    </Card>
  );
}

type Reveal = { id: string; label: string; club_at: string; public_at: string; clues: string[]; status: string };
const toLocal = (iso: string) => (iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Lisbon" }).slice(0, 16).replace(" ", "T") : "");
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : "");

function LineupSection({ site }: { site: Site }) {
  const eventId = site.event_id!;
  const qc = useQueryClient();
  const reveals = useQuery({
    queryKey: ["crm-event-lineup-reveals", eventId, "full"],
    queryFn: async (): Promise<Reveal[]> => {
      const { data, error } = await db.from("event_lineup_reveals").select("*").eq("event_id", eventId).order("public_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const acts = useQuery({
    queryKey: ["crm-event-lineup", eventId],
    queryFn: async () => {
      const { data, error } = await db.from("event_lineups").select("*").eq("event_id", eventId).order("display_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const em = useQuery({
    queryKey: ["event-marketing-lineup-complete", eventId],
    queryFn: async () => {
      const { data } = await db.from("event_marketing").select("id, lineup_complete").eq("event_id", eventId).maybeSingle();
      return data as { id: string; lineup_complete: boolean } | null;
    },
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["crm-event-lineup-reveals", eventId] });
    qc.invalidateQueries({ queryKey: ["crm-event-lineup", eventId] });
  };

  const [nd, setNd] = useState({ label: "", club_at: "", public_at: "", clues: "", status: "rascunho" });
  const create = useMutation({
    mutationFn: async () => {
      if (!nd.label.trim() || !nd.club_at || !nd.public_at) throw new Error("Nome, data Clube e data pública são obrigatórios.");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db.from("event_lineup_reveals").insert({
        company_id: site.company_id, event_id: eventId, label: nd.label.trim(),
        club_at: fromLocal(nd.club_at), public_at: fromLocal(nd.public_at),
        clues: nd.clues.split("\n").map((x) => x.trim()).filter(Boolean), status: nd.status, created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Revelação criada.");
      setNd({ label: "", club_at: "", public_at: "", clues: "", status: "rascunho" });
      invalidate();
    },
    onError: err,
  });
  const update = useMutation({
    mutationFn: async (r: Partial<Reveal> & { id: string }) => {
      const { id, ...rest } = r;
      const { error } = await db.from("event_lineup_reveals").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: err,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("event_lineup_reveals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: err,
  });
  const toggleComplete = useMutation({
    mutationFn: async (v: boolean) => {
      if (!em.data) throw new Error("O evento não tem registo de marketing.");
      const { error } = await db.from("event_marketing").update({ lineup_complete: v }).eq("id", em.data.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event-marketing-lineup-complete", eventId] }),
    onError: err,
  });

  const [previewMember, setPreviewMember] = useState(false);
  const preview = useMemo(
    () =>
      buildLineup({
        reveals: reveals.data ?? [],
        acts: acts.data ?? [],
        now: new Date(),
        isMember: previewMember,
        lineupComplete: !!em.data?.lineup_complete,
      }),
    [reveals.data, acts.data, previewMember, em.data],
  );

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Revelações</h3>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!em.data?.lineup_complete} onCheckedChange={(v) => toggleComplete.mutate(v)} />
            Line-up completo
          </label>
        </div>
        {(reveals.data ?? []).map((r) => (
          <div key={r.id} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-6">
            <Input defaultValue={r.label} onBlur={(e) => e.target.value !== r.label && update.mutate({ id: r.id, label: e.target.value })} />
            <Input type="datetime-local" defaultValue={toLocal(r.club_at)} onBlur={(e) => update.mutate({ id: r.id, club_at: fromLocal(e.target.value) })} />
            <Input type="datetime-local" defaultValue={toLocal(r.public_at)} onBlur={(e) => update.mutate({ id: r.id, public_at: fromLocal(e.target.value) })} />
            <Textarea rows={2} defaultValue={(r.clues ?? []).join("\n")} placeholder="Pistas (uma por linha)"
              onBlur={(e) => update.mutate({ id: r.id, clues: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
            <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={r.status}
              onChange={(e) => update.mutate({ id: r.id, status: e.target.value })}>
              <option value="rascunho">Rascunho</option>
              <option value="agendada">Agendada</option>
            </select>
            <Button variant="ghost" size="icon" aria-label="Remover revelação"
              onClick={() => confirm(`Remover ${r.label}? As atrações ficam sem revelação (não públicas).`) && remove.mutate(r.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        <div className="grid gap-2 rounded-md border border-dashed border-border p-3 md:grid-cols-6">
          <Input placeholder="Nome interno" value={nd.label} onChange={(e) => setNd({ ...nd, label: e.target.value })} />
          <Input type="datetime-local" aria-label="Data Clube" value={nd.club_at} onChange={(e) => setNd({ ...nd, club_at: e.target.value })} />
          <Input type="datetime-local" aria-label="Data pública" value={nd.public_at} onChange={(e) => setNd({ ...nd, public_at: e.target.value })} />
          <Textarea rows={2} placeholder="Pistas (uma por linha)" value={nd.clues} onChange={(e) => setNd({ ...nd, clues: e.target.value })} />
          <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={nd.status} onChange={(e) => setNd({ ...nd, status: e.target.value })}>
            <option value="rascunho">Rascunho</option>
            <option value="agendada">Agendada</option>
          </select>
          <Button onClick={() => create.mutate()} disabled={create.isPending}><Plus className="h-4 w-4" /> Criar</Button>
        </div>
        <p className="text-xs text-muted-foreground">Colunas: nome · data Clube · data pública (hora de Lisboa) · pistas · estado.</p>
      </Card>

      <LineupTab eventId={eventId} companyId={site.company_id} disabled={false} />

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Pré-visualização</h3>
          <div className="flex gap-1">
            <Button size="sm" variant={previewMember ? "ghost" : "default"} onClick={() => setPreviewMember(false)}>Como o público vê agora</Button>
            <Button size="sm" variant={previewMember ? "default" : "ghost"} onClick={() => setPreviewMember(true)}>Como o membro vê agora</Button>
          </div>
        </div>
        <p className="text-sm">Estado: <Badge variant="secondary">{preview.state}</Badge></p>
        <div className="flex flex-wrap gap-2">
          {preview.confirmed.map((a) => (
            <Badge key={a.id} variant={a.is_new ? "default" : "outline"}>{a.name}{a.is_new ? " · novo" : ""}</Badge>
          ))}
          {preview.confirmed.length === 0 && <span className="text-sm text-muted-foreground">Nenhuma atração visível.</span>}
        </div>
        {preview.next_reveal && (
          <p className="text-xs text-muted-foreground">
            Próxima revelação: {new Date(preview.next_reveal.public_at).toLocaleString("pt-PT")}
            {preview.next_reveal.club_at && ` (Clube: ${new Date(preview.next_reveal.club_at).toLocaleString("pt-PT")})`}
            {preview.next_reveal.clues.length > 0 && ` · Pistas: ${preview.next_reveal.clues.join(" / ")}`}
          </p>
        )}
      </Card>
    </div>
  );
}

type Edition = {
  id: string; year: number; city: string | null; venue: string | null; edition_date: string | null;
  lineup: string[] | null; videos: EditionVideo[]; gallery_urls: string[]; cover_url: string | null; sort: number; visible: boolean;
};

function HistoryTab({ site }: { site: Site }) {
  const qc = useQueryClient();
  const key = ["festival-editions", site.brand_key];
  const q = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Edition[]> => {
      const { data, error } = await db.from("festival_editions").select("*").eq("brand_key", site.brand_key).order("year", { ascending: false }).order("sort");
      if (error) throw error;
      return data ?? [];
    },
  });
  const upd = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Edition> }) => {
      const { error } = await db.from("festival_editions").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: err,
  });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("festival_editions").insert({ company_id: site.company_id, brand_key: site.brand_key, year: new Date().getFullYear(), visible: false });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: err,
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("festival_editions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: err,
  });
  return (
    <div className="space-y-3">
      {(q.data ?? []).map((e) => (
        <EditionCard key={e.id} e={e} site={site} onPatch={(patch) => upd.mutate({ id: e.id, patch })} onDelete={() => confirm(`Remover edição ${e.year}?`) && del.mutate(e.id)} />
      ))}
      <Button variant="outline" onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Nova edição</Button>
    </div>
  );
}

function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const n = [...arr];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

function EditionCard({ e, site, onPatch, onDelete }: { e: Edition; site: Site; onPatch: (p: Partial<Edition>) => void; onDelete: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const photos = e.gallery_urls ?? [];
  const videos = e.videos ?? [];

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files); // ordem recebida
    setBusy(true);
    try {
      const saved = await uploadEditionPhotos(list, { brandKey: site.brand_key, year: e.year, gallery: photos, coverUrl: e.cover_url }, {
        companyId: getCurrentCompanyId,
        convert: toWebp,
        upload: (path, blob) => supabase.storage.from(EDITION_BUCKET).upload(path, blob, { contentType: "image/webp", upsert: false }),
        publicUrl: (path) => supabase.storage.from(EDITION_BUCKET).getPublicUrl(path).data.publicUrl,
        save: async (patch) => {
          const { data, error } = await db.from("festival_editions")
            .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", e.id).select("id");
          if (error) return { error };
          if (!data?.length) return { error: { message: "nenhuma linha gravada (sem permissão ou edição inexistente)" } };
          return { error: null };
        },
        newId: () => crypto.randomUUID(),
        toast,
      });
      if (saved.length) await qc.invalidateQueries({ queryKey: ["festival-editions", site.brand_key] });
    } finally {
      setBusy(false);
    }
  };
  const addVideo = () => {
    const provider = detectVideoProvider(videoUrl);
    if (!provider) return toast.error("URL inválido: só YouTube, Instagram ou Vimeo.");
    onPatch({ videos: [...videos, { url: videoUrl.trim(), provider, title: videoTitle.trim() || null }] });
    setVideoUrl("");
    setVideoTitle("");
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="grid gap-2 md:grid-cols-5">
        <Input type="number" defaultValue={e.year} aria-label="Ano" onBlur={(x) => onPatch({ year: Number(x.target.value) })} />
        <Input defaultValue={e.city ?? ""} placeholder="Cidade" onBlur={(x) => onPatch({ city: x.target.value.trim() || null })} />
        <Input defaultValue={e.venue ?? ""} placeholder="Local" onBlur={(x) => onPatch({ venue: x.target.value.trim() || null })} />
        <Input type="date" defaultValue={e.edition_date ?? ""} onBlur={(x) => onPatch({ edition_date: x.target.value || null })} />
        <div className="flex items-center justify-end gap-2">
          <label className="flex items-center gap-2 text-sm"><Switch checked={e.visible} onCheckedChange={(v) => onPatch({ visible: v })} /> Visível</label>
          <Button variant="ghost" size="icon" aria-label="Remover edição" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>
      <Textarea rows={2} defaultValue={(e.lineup ?? []).join(", ")} placeholder="Line-up (separado por vírgulas)"
        onBlur={(x) => {
          const v = x.target.value.split(",").map((s) => s.trim()).filter(Boolean);
          onPatch({ lineup: v.length ? v : null });
        }} />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Fotos ({photos.length}/{MAX_EDITION_PHOTOS}) — convertidas para WebP, lado maior 1600 px</Label>
          <Input type="file" accept="image/*" multiple className="max-w-[260px]" disabled={busy || photos.length >= MAX_EDITION_PHOTOS}
            onChange={(x) => { upload(x.target.files); x.target.value = ""; }} />
        </div>
        <div className="flex flex-wrap gap-2">
          {photos.map((u, i) => {
            const isCover = (e.cover_url ?? photos[0]) === u;
            return (
              <div key={u} className="relative w-28 space-y-1">
                <img src={u} alt="" className={`h-20 w-28 rounded object-cover ${isCover ? "ring-2 ring-primary" : ""}`} />
                <div className="flex justify-between">
                  <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Subir" onClick={() => onPatch({ gallery_urls: move(photos, i, -1) })}><ArrowUp className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Capa" onClick={() => onPatch({ cover_url: u })}><Star className={`h-3 w-3 ${isCover ? "fill-primary text-primary" : ""}`} /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Descer" onClick={() => onPatch({ gallery_urls: move(photos, i, 1) })}><ArrowDown className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Remover foto"
                    onClick={() => onPatch({ gallery_urls: photos.filter((x) => x !== u), ...(e.cover_url === u ? { cover_url: null } : {}) })}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Vídeos (o 1.º é o aftermovie principal)</Label>
        {videos.map((v, i) => (
          <div key={`${v.url}-${i}`} className="flex items-center gap-2 text-sm">
            <Badge variant="outline">{v.provider}</Badge>
            <a href={v.url} target="_blank" rel="noreferrer" className="flex-1 truncate underline">{v.title || v.url}</a>
            <Button size="icon" variant="ghost" aria-label="Subir" onClick={() => onPatch({ videos: move(videos, i, -1) })}><ArrowUp className="h-3 w-3" /></Button>
            <Button size="icon" variant="ghost" aria-label="Descer" onClick={() => onPatch({ videos: move(videos, i, 1) })}><ArrowDown className="h-3 w-3" /></Button>
            <Button size="icon" variant="ghost" aria-label="Remover vídeo" onClick={() => onPatch({ videos: videos.filter((_, k) => k !== i) })}><Trash2 className="h-3 w-3 text-destructive" /></Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input placeholder="URL YouTube, Instagram ou Vimeo" value={videoUrl} onChange={(x) => setVideoUrl(x.target.value)} />
          <Input placeholder="Título (opcional)" value={videoTitle} onChange={(x) => setVideoTitle(x.target.value)} className="max-w-[220px]" />
          <Button variant="outline" onClick={addVideo}><Plus className="h-4 w-4" /></Button>
        </div>
      </div>
    </Card>
  );
}

function SimpleTable({ table, siteId, companyId, cols, order }: {
  table: string; siteId: string; companyId: string; order: string;
  cols: Array<{ k: string; l: string; num?: boolean; ro?: boolean }>;
}) {
  const qc = useQueryClient();
  const key = ["club-table", table, siteId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await db.from(table).select("*").eq("site_id", siteId).order(order);
      if (error) throw error;
      return (data ?? []) as Record<string, any>[];
    },
  });
  const save = useMutation({
    mutationFn: async ({ id, patch }: { id?: string; patch: Record<string, unknown> }) => {
      const { error } = id
        ? await db.from(table).update(patch).eq("id", id)
        : await db.from(table).insert({ ...patch, site_id: siteId, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: err,
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: err,
  });
  const [nd, setNd] = useState<Record<string, string>>({});
  const conv = (c: { num?: boolean }, v: string) => (c.num ? (v === "" ? null : Number(v)) : v.trim() || null);
  return (
    <div className="space-y-2">
      {(q.data ?? []).map((r) => (
        <div key={r.id} className="flex gap-2">
          {cols.map((c) => (
            <Input key={c.k} type={c.num ? "number" : "text"} defaultValue={r[c.k] ?? ""} disabled={c.ro} aria-label={c.l}
              onBlur={(e) => String(r[c.k] ?? "") !== e.target.value && save.mutate({ id: r.id, patch: { [c.k]: conv(c, e.target.value) } })} />
          ))}
          <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => confirm("Remover?") && del.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      ))}
      <div className="flex gap-2">
        {cols.map((c) => (
          <Input key={c.k} type={c.num ? "number" : "text"} placeholder={c.l} value={nd[c.k] ?? ""} onChange={(e) => setNd({ ...nd, [c.k]: e.target.value })} />
        ))}
        <Button variant="outline" size="icon" aria-label="Adicionar"
          onClick={() => {
            const patch: Record<string, unknown> = {};
            cols.forEach((c) => (patch[c.k] = conv(c, nd[c.k] ?? "")));
            save.mutate({ patch }, { onSuccess: () => setNd({}) });
          }}><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function ClubTab({ site }: { site: Site }) {
  const qc = useQueryClient();
  const ranking = useQuery({
    queryKey: ["club-ranking", site.id],
    queryFn: async () => {
      const { data, error } = await db.rpc("club_ranking", { p_site: site.id, p_limit: 20 });
      if (error) throw error;
      return (data ?? []) as Array<{ member_id: string; first_name: string | null; email: string; points: number; level_name: string | null; rank_pos: number }>;
    },
  });
  const guesses = useQuery({
    queryKey: ["club-guesses", site.id],
    queryFn: async () => {
      const { data, error } = await db.from("club_guesses")
        .select("id, guess, status, reveal_id, member_id, club_members!inner(email, first_name, site_id), event_lineup_reveals(label)")
        .eq("club_members.site_id", site.id).eq("status", "pendente").order("created_at").limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const acts = useQuery({
    queryKey: ["crm-event-lineup", site.event_id],
    enabled: !!site.event_id,
    queryFn: async () => {
      const { data } = await db.from("event_lineups").select("reveal_id, artist_name").eq("event_id", site.event_id);
      return (data ?? []) as Array<{ reveal_id: string | null; artist_name: string }>;
    },
  });
  const claims = useQuery({
    queryKey: ["club-claims", site.id],
    queryFn: async () => {
      const { data, error } = await db.from("club_attendance_claims")
        .select("id, year, status, club_members!inner(email, first_name, site_id)")
        .eq("club_members.site_id", site.id).eq("status", "pendente").order("created_at").limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const decideGuess = useMutation({
    mutationFn: async ({ id, ok }: { id: string; ok: boolean }) => {
      const { error } = await db.rpc("club_decide_guess", { p_guess: id, p_correct: ok });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["club-guesses", site.id] }); qc.invalidateQueries({ queryKey: ["club-ranking", site.id] }); },
    onError: err,
  });
  const decideClaim = useMutation({
    mutationFn: async ({ id, ok }: { id: string; ok: boolean }) => {
      const { error } = await db.rpc("club_decide_attendance", { p_claim: id, p_valid: ok });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["club-claims", site.id] }); qc.invalidateQueries({ queryKey: ["club-ranking", site.id] }); },
    onError: err,
  });
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const suggest = (g: any) =>
    (acts.data ?? []).some((a) => a.reveal_id === g.reveal_id && norm(a.artist_name) === norm(g.guess));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ClubTermsSection siteId={site.id} companyId={site.company_id} />
      <Card className="space-y-2 p-4">
        <h3 className="text-sm font-semibold">Regras de pontos</h3>
        <SimpleTable table="club_point_rules" siteId={site.id} companyId={site.company_id} order="rule_key"
          cols={[{ k: "rule_key", l: "Chave" }, { k: "label", l: "Descrição" }, { k: "points", l: "Pontos", num: true }]} />
      </Card>
      <Card className="space-y-2 p-4">
        <h3 className="text-sm font-semibold">Níveis</h3>
        <SimpleTable table="club_levels" siteId={site.id} companyId={site.company_id} order="min_points"
          cols={[{ k: "name", l: "Nome" }, { k: "min_points", l: "Mínimo", num: true }, { k: "benefit", l: "Benefício" }]} />
      </Card>
      <Card className="space-y-2 p-4 lg:col-span-2">
        <h3 className="text-sm font-semibold">Prémios por faixa do ranking</h3>
        <SimpleTable table="club_rewards" siteId={site.id} companyId={site.company_id} order="sort"
          cols={[{ k: "tier_label", l: "Faixa" }, { k: "rank_from", l: "De", num: true }, { k: "rank_to", l: "Até", num: true }, { k: "level_name", l: "Nível" }, { k: "reward", l: "Prémio" }, { k: "sort", l: "Ordem", num: true }]} />
      </Card>
      <Card className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Ranking (top 20)</h3>
          <Link to="/crm/clube-newgang" className="text-xs underline">Inscrições do Clube</Link>
        </div>
        {(ranking.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Sem membros confirmados.</p>}
        {(ranking.data ?? []).map((r) => (
          <div key={r.member_id} className="flex justify-between text-sm">
            <span>{r.rank_pos}. {r.first_name ?? r.email}</span>
            <span className="text-muted-foreground">{r.points} pts · {r.level_name ?? "—"}</span>
          </div>
        ))}
      </Card>
      <Card className="space-y-2 p-4">
        <h3 className="text-sm font-semibold">Palpites a validar</h3>
        {(guesses.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum palpite pendente.</p>}
        {(guesses.data ?? []).map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex-1 truncate">{g.club_members?.email} · {g.event_lineup_reveals?.label}: <strong>{g.guess}</strong>
              {suggest(g) && <Badge className="ml-2">sugestão: certo</Badge>}</span>
            <Button size="sm" variant="outline" onClick={() => decideGuess.mutate({ id: g.id, ok: true })}>Certo</Button>
            <Button size="sm" variant="ghost" onClick={() => decideGuess.mutate({ id: g.id, ok: false })}>Errado</Button>
          </div>
        ))}
      </Card>
      <Card className="space-y-2 p-4 lg:col-span-2">
        <h3 className="text-sm font-semibold">"Eu estive lá" pendentes</h3>
        {(claims.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido pendente.</p>}
        {(claims.data ?? []).map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex-1">{c.club_members?.email} · {c.year}</span>
            <Button size="sm" variant="outline" onClick={() => decideClaim.mutate({ id: c.id, ok: true })}>Validar</Button>
            <Button size="sm" variant="ghost" onClick={() => decideClaim.mutate({ id: c.id, ok: false })}>Recusar</Button>
          </div>
        ))}
      </Card>
    </div>
  );
}

function TicketsTab({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["newgang-tickets", eventId],
    queryFn: async () => {
      const [{ data: ev }, { data: em }] = await Promise.all([
        db.from("events").select("ticketing_url").eq("id", eventId).maybeSingle(),
        db.from("event_marketing").select("id, ticket_lots").eq("event_id", eventId).maybeSingle(),
      ]);
      return { url: ev?.ticketing_url ?? "", lots: em?.ticket_lots ?? null, emId: em?.id ?? null };
    },
  });
  const [url, setUrl] = useState("");
  const [lots, setLots] = useState("");
  useEffect(() => {
    if (q.data) {
      setUrl(q.data.url);
      setLots(q.data.lots ? JSON.stringify(q.data.lots, null, 2) : "");
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("events").update({ ticketing_url: url.trim() || null }).eq("id", eventId);
      if (error) throw error;
      if (q.data?.emId) {
        const parsed = lots.trim() ? JSON.parse(lots) : null;
        const { error: e2 } = await db.from("event_marketing").update({ ticket_lots: parsed }).eq("id", q.data.emId);
        if (e2) throw e2;
      }
    },
    onSuccess: () => { toast.success("Bilhetes guardados."); qc.invalidateQueries({ queryKey: ["newgang-tickets", eventId] }); },
    onError: err,
  });
  return (
    <Card className="space-y-3 p-4">
      <Field label="Link Fever" value={url} onChange={setUrl} />
      <div className="space-y-1.5">
        <Label className="text-sm">Lotes (JSON de event_marketing; a sincronização de bilheteira pode actualizá-los)</Label>
        <Textarea rows={10} className="font-mono text-xs" value={lots} onChange={(e) => setLots(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="h-4 w-4" /> Guardar</Button>
      </div>
    </Card>
  );
}
