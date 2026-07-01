import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Target, RefreshCw, Plus, Trash2, Link2, Eye, FileText, AlertTriangle, CheckCircle2, XCircle, Clock, Upload } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

interface DashboardAudience {
  id: string;
  name: string;
  description: string | null;
  audience_id_meta: string | null;
  enabled: boolean;
  connection_id: string;
  ad_account_id: string;
  ad_account_label: string;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  total_records_local: number | null;
  total_records_meta: number | null;
  created_at: string;
  last_sync: { id: string; started_at: string; status: string; records_processed: number; error_message: string | null } | null;
}
interface DashboardData {
  stats: { total_audiences: number; enabled_audiences: number; error_audiences: number; records_synced_30d: number; stale_audiences: number };
  audiences: DashboardAudience[];
}
interface AdLink { id: string; ad_account_id: string; display_label: string; is_primary: boolean }

function statusBadge(status: string | null) {
  if (!status) return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />nunca</Badge>;
  if (status === "ok") return <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 border-emerald-500/30"><CheckCircle2 className="h-3 w-3" />ok</Badge>;
  if (status === "partial") return <Badge className="gap-1 bg-amber-500/15 text-amber-600 border-amber-500/30"><AlertTriangle className="h-3 w-3" />parcial</Badge>;
  if (status === "syncing") return <Badge className="gap-1"><RefreshCw className="h-3 w-3 animate-spin" />sync...</Badge>;
  return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />erro</Badge>;
}

export default function MetaAudiencesList() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [logsAudience, setLogsAudience] = useState<DashboardAudience | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["meta-audiences-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("crm_meta_audiences_dashboard");
      if (error) throw error;
      return data as unknown as DashboardData;
    },
  });

  const syncMut = useMutation({
    mutationFn: async ({ id, dry }: { id: string; dry?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("crm-meta-audience-sync", { body: { audience_id: id, dry_run: dry } });
      if (error) throw error;
      return data;
    },
    onSuccess: (res, vars) => {
      if (vars.dry) {
        toast.success(`Preview: ${res.total_records_local} leads. Amostra: ${(res.sample ?? []).join(", ")}`);
      } else {
        toast.success(`Sync ${res.status}: ${res.records_processed} registos enviados`);
        qc.invalidateQueries({ queryKey: ["meta-audiences-dashboard"] });
      }
    },
    onError: (e: any) => toast.error(`Sync falhou: ${e.message}`),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meta_custom_audiences" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Audience eliminada");
      qc.invalidateQueries({ queryKey: ["meta-audiences-dashboard"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleEnabled = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("meta_custom_audiences" as any).update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meta-audiences-dashboard"] }),
  });

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;

  const stats = data?.stats;
  const audiences = data?.audiences ?? [];

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Target className="h-6 w-6 text-emerald-600" />Meta Custom Audiences</h1>
          <p className="text-sm text-muted-foreground mt-1">Audiências de leads sincronizadas para Meta Marketing API (retargeting + lookalikes).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild className="gap-2"><Link to="/crm-admin/meta-audiences/upload"><Upload className="h-4 w-4" />Carregar lista</Link></Button>
          <Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus className="h-4 w-4" />Nova audience</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.total_audiences ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Activas</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-600">{stats?.enabled_audiences ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Leads sync 30d</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.records_synced_30d?.toLocaleString() ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Em erro / stale</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{(stats?.error_audiences ?? 0)} / {(stats?.stale_audiences ?? 0)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Audiências ({audiences.length})</CardTitle></CardHeader>
        <CardContent>
          {audiences.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma audience. Clica "Nova audience" para começar.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Ad Account</TableHead>
                  <TableHead>Meta ID</TableHead>
                  <TableHead className="text-right">Local / Meta</TableHead>
                  <TableHead>Sync</TableHead>
                  <TableHead>Última</TableHead>
                  <TableHead>Activa</TableHead>
                  <TableHead className="text-right">Acções</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audiences.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.name}</div>
                      {a.description && <div className="text-xs text-muted-foreground line-clamp-1 max-w-xs">{a.description}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{a.ad_account_label}<div className="text-muted-foreground">{a.ad_account_id}</div></TableCell>
                    <TableCell className="text-xs font-mono">{a.audience_id_meta ? a.audience_id_meta.slice(0, 12) + "…" : <Badge variant="outline">não criada</Badge>}</TableCell>
                    <TableCell className="text-right text-sm">{(a.total_records_local ?? 0).toLocaleString()} / {a.total_records_meta?.toLocaleString() ?? "—"}</TableCell>
                    <TableCell>{statusBadge(a.last_sync_status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.last_synced_at ? formatDistanceToNow(new Date(a.last_synced_at), { addSuffix: true, locale: pt }) : "—"}</TableCell>
                    <TableCell><Switch checked={a.enabled} onCheckedChange={(v) => toggleEnabled.mutate({ id: a.id, enabled: v })} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" title="Preview" onClick={() => syncMut.mutate({ id: a.id, dry: true })}><Eye className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" title="Sync agora" disabled={!a.audience_id_meta || syncMut.isPending} onClick={() => syncMut.mutate({ id: a.id })}><RefreshCw className={`h-4 w-4 ${syncMut.isPending ? "animate-spin" : ""}`} /></Button>
                        <Button size="sm" variant="ghost" title="Logs" onClick={() => setLogsAudience(a)}><FileText className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" title="Eliminar" onClick={() => { if (confirm(`Eliminar "${a.name}"?`)) delMut.mutate(a.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateAudienceDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["meta-audiences-dashboard"] })} />
      <LogsDialog audience={logsAudience} onClose={() => setLogsAudience(null)} />
    </div>
  );
}

function CreateAudienceDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (b: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [connectionLinkId, setConnectionLinkId] = useState<string>("");
  const [eventSlugs, setEventSlugs] = useState<string>("");
  const [sources, setSources] = useState<string>("");
  const [sinceDays, setSinceDays] = useState<string>("90");
  const [consent, setConsent] = useState<string>("email");
  const [createOnMeta, setCreateOnMeta] = useState(true);
  const [busy, setBusy] = useState(false);

  const { data: links } = useQuery({
    queryKey: ["ad-platform-links-for-audience"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).schema("crm").from("ad_platform_account_links").select("id, ad_account_id, display_label, is_primary").eq("enabled", true).order("is_primary", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdLink[];
    },
  });

  const handleSubmit = async () => {
    if (!name.trim() || !connectionLinkId) {
      toast.error("Nome e ad account são obrigatórios");
      return;
    }
    setBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from("profiles").select("active_company_id, company_id").eq("id", userRes.user!.id).maybeSingle();
      const companyId = (prof as any)?.active_company_id ?? (prof as any)?.company_id;
      if (!companyId) throw new Error("Sem empresa activa");

      const filters: any = { consent_required: consent || null };
      if (eventSlugs.trim()) filters.event_slugs = eventSlugs.split(",").map((s) => s.trim()).filter(Boolean);
      if (sources.trim()) filters.sources = sources.split(",").map((s) => s.trim()).filter(Boolean);
      if (sinceDays) filters.since_days = parseInt(sinceDays, 10);

      const { data: ins, error: insErr } = await supabase.from("meta_custom_audiences" as any).insert({
        company_id: companyId, connection_id: connectionLinkId, name: name.trim(), description: description.trim() || null,
        filters, created_by: userRes.user!.id,
      }).select("id").single();
      if (insErr) throw insErr;

      if (createOnMeta) {
        const { data: cr, error: crErr } = await supabase.functions.invoke("crm-meta-audience-create", { body: { audience_id: (ins as any).id } });
        if (crErr || cr?.error) throw new Error(cr?.error ?? crErr?.message ?? "create failed");
        toast.success(`Audience criada no Meta: ${cr.audience_id_meta}`);
      } else {
        toast.success("Audience criada (só local; usa Sync depois de linkar no Meta)");
      }
      onCreated();
      onOpenChange(false);
      setName(""); setDescription(""); setEventSlugs(""); setSources("");
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Custom Audience</DialogTitle>
          <DialogDescription>Define filtros sobre os leads e (opcionalmente) cria a audience no Meta agora.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          <div><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Leads Ivete 90d" /></div>
          <div><Label>Descrição</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div>
            <Label>Ad Account *</Label>
            <Select value={connectionLinkId} onValueChange={setConnectionLinkId}>
              <SelectTrigger><SelectValue placeholder="Escolhe a ad account" /></SelectTrigger>
              <SelectContent>
                {(links ?? []).map((l) => (<SelectItem key={l.id} value={l.id}>{l.display_label} ({l.ad_account_id}){l.is_primary ? " ★" : ""}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Slugs de eventos (vírgulas — vazio = todos)</Label><Input value={eventSlugs} onChange={(e) => setEventSlugs(e.target.value)} placeholder="ivete-clareou-2026" /></div>
          <div><Label>Sources (vírgulas)</Label><Input value={sources} onChange={(e) => setSources(e.target.value)} placeholder="portal, notify_me" /></div>
          <div>
            <Label>Período</Label>
            <Select value={sinceDays} onValueChange={setSinceDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
                <SelectItem value="180">180 dias</SelectItem>
                <SelectItem value="">Sem limite</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Consentimento</Label>
            <Select value={consent} onValueChange={setConsent}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="any">Qualquer</SelectItem>
                <SelectItem value="">Nenhum (não recomendado)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <Switch checked={createOnMeta} onCheckedChange={setCreateOnMeta} id="create-meta" />
            <Label htmlFor="create-meta" className="cursor-pointer flex items-center gap-1"><Link2 className="h-3.5 w-3.5" />Criar automaticamente no Meta agora</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={busy}>{busy ? "A criar..." : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogsDialog({ audience, onClose }: { audience: DashboardAudience | null; onClose: () => void }) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["audience-logs", audience?.id],
    enabled: !!audience,
    queryFn: async () => {
      const { data, error } = await supabase.from("meta_audience_sync_log" as any).select("*").eq("audience_id", audience!.id).order("started_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data as any[];
    },
  });
  return (
    <Dialog open={!!audience} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Logs — {audience?.name}</DialogTitle></DialogHeader>
        {isLoading ? <Skeleton className="h-40" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Início</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Registos</TableHead><TableHead>Erro</TableHead></TableRow></TableHeader>
            <TableBody>
              {(logs ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{new Date(l.started_at).toLocaleString("pt-PT")}</TableCell>
                  <TableCell>{statusBadge(l.status)}</TableCell>
                  <TableCell className="text-right">{l.records_processed?.toLocaleString() ?? 0}</TableCell>
                  <TableCell className="text-xs text-destructive max-w-md truncate">{l.error_message ?? ""}</TableCell>
                </TableRow>
              ))}
              {(logs ?? []).length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Sem logs.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
