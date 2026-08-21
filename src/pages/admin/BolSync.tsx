import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, RefreshCw, AlertTriangle, CheckCircle2, KeyRound, Plus, Plug } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { extractFnError } from "@/lib/edge-fn-error";
import { HelpTooltip } from "@/components/HelpTooltip";

const SHARED_SECRET = "bol_master";

type Cfg = {
  id: string;
  event_id: string;
  vault_secret_name: string;
  bol_event_id: string;
  organization_name: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
};

type Run = {
  id: string;
  config_id: string;
  status: string;
  mode: string;
  triggered_by: string | null;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  files_downloaded: any;
  import_audit: any;
};

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "success") return "default";
  if (s === "started") return "outline";
  if (s.endsWith("_failed") || s === "failed") return "destructive";
  return "secondary";
};

export default function BolSync() {
  const qc = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [credsOpen, setCredsOpen] = useState(false);
  const [credsForm, setCredsForm] = useState({ email: "", password: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<any>(null);

  const cfgQ = useQuery({
    queryKey: ["bol-sync-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bol_sync_config" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Cfg[];
    },
  });

  const eventsQ = useQuery({
    queryKey: ["bol-sync-config-events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name, date").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const runsQ = useQuery({
    queryKey: ["bol-sync-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bol_sync_runs" as any)
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Run[];
    },
  });

  const runMut = useMutation({
    mutationFn: async (configId: string) => {
      const { data, error } = await supabase.functions.invoke("fetch-bol-reports", {
        body: { configId, mode: "manual", triggeredBy: "ui" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const r = data?.results?.[0];
      if (data?.ok) toast.success("Sync BOL concluída.");
      else toast.error(`Falhou: ${r?.phase || "erro"} — ${r?.error || ""}`);
      qc.invalidateQueries({ queryKey: ["bol-sync-runs"] });
      qc.invalidateQueries({ queryKey: ["bol-sync-config"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro a invocar função"),
  });

  const discoverMut = useMutation({
    mutationFn: async (configId?: string) => {
      const { data, error } = await supabase.functions.invoke("fetch-bol-reports", {
        body: { action: "discover", configId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      setDiscoverResult(data);
      if (data?.ok) toast.success("Ligação BOL OK — ver inventário.");
      else toast.error(data?.error || "Ligação falhou");
    },
    onError: (e: any) => toast.error(e?.message || "Erro"),
  });

  const credsMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("update-bol-credentials", {
        body: { secretName: SHARED_SECRET, email: credsForm.email, password: credsForm.password },
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error || "falhou");
      return data;
    },
    onSuccess: () => {
      toast.success("Credenciais BOL guardadas no Vault.");
      setCredsOpen(false);
      setCredsForm({ email: "", password: "" });
    },
    onError: (e: any) => toast.error(e?.message || "Erro"),
  });

  const enableMut = useMutation({
    mutationFn: async (args: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("bol_sync_config" as any).update({ enabled: args.enabled }).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bol-sync-config"] }),
  });

  const updateIdMut = useMutation({
    mutationFn: async (args: { id: string; bol_event_id: string }) => {
      const { error } = await supabase.from("bol_sync_config" as any).update({ bol_event_id: args.bol_event_id }).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração actualizada.");
      qc.invalidateQueries({ queryKey: ["bol-sync-config"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro a guardar"),
  });

  const cfgs = cfgQ.data || [];
  const runs = runsQ.data || [];
  const eventName = (id: string) => (eventsQ.data || []).find((e: any) => e.id === id)?.name || id.slice(0, 8);

  return (
    <div className="container py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sync BOL</h1>
          <p className="text-muted-foreground mt-1">
            Importação diária do mapa <b>M2 - Tipo de Venda (ocupação por setor)</b> do backoffice produtores.bol.pt.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCredsOpen(true)}>
            <KeyRound className="h-4 w-4 mr-2" /> Credenciais
          </Button>
          <Button variant="outline" disabled={discoverMut.isPending} onClick={() => discoverMut.mutate(undefined)}>
            {discoverMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
            Testar ligação
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Adicionar evento
          </Button>
        </div>
      </div>

      {cfgQ.isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : cfgs.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Sem configurações. Usa <b>Adicionar evento</b> — as credenciais usam a conta partilhada <code>{SHARED_SECRET}</code>.
        </CardContent></Card>
      ) : (
        cfgs.map((cfg) => (
          <ConfigCard
            key={cfg.id}
            cfg={cfg}
            eventLabel={eventName(cfg.event_id)}
            running={runMut.isPending}
            onRun={() => runMut.mutate(cfg.id)}
            onToggle={(v) => enableMut.mutate({ id: cfg.id, enabled: v })}
            onSave={(bolId) => updateIdMut.mutate({ id: cfg.id, bol_event_id: bolId })}
            saving={updateIdMut.isPending}
          />
        ))
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Últimas execuções</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["bol-sync-runs"] })}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Sem execuções registadas.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Início</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => {
                  const dur = r.finished_at
                    ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)
                    : null;
                  return (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedRun(r)}>
                      <TableCell className="font-mono text-xs">{new Date(r.started_at).toLocaleString("pt-PT")}</TableCell>
                      <TableCell><Badge variant="outline">{r.mode}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(r.status)}>
                          {r.status === "success" ? <CheckCircle2 className="h-3 w-3 mr-1" /> :
                            r.status.endsWith("_failed") || r.status === "failed" ? <AlertTriangle className="h-3 w-3 mr-1" /> : null}
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{dur !== null ? `${dur}s` : "—"}</TableCell>
                      <TableCell><Button variant="ghost" size="sm">Ver</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRun} onOpenChange={(o) => !o && setSelectedRun(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Detalhes da execução</DialogTitle></DialogHeader>
          {selectedRun && (
            <div className="space-y-4 text-sm">
              <div><b>Estado:</b> <Badge variant={statusVariant(selectedRun.status)}>{selectedRun.status}</Badge></div>
              <div><b>Início:</b> {new Date(selectedRun.started_at).toLocaleString("pt-PT")}</div>
              {selectedRun.finished_at && <div><b>Fim:</b> {new Date(selectedRun.finished_at).toLocaleString("pt-PT")}</div>}
              {selectedRun.error_message && (
                <div className="bg-destructive/10 border border-destructive/30 rounded p-3">
                  <b>Erro:</b>
                  <pre className="whitespace-pre-wrap text-xs mt-1">{selectedRun.error_message}</pre>
                </div>
              )}
              {selectedRun.files_downloaded && (
                <div>
                  <b>Ficheiros:</b>
                  <pre className="bg-muted rounded p-2 text-xs overflow-auto mt-1">{JSON.stringify(selectedRun.files_downloaded, null, 2)}</pre>
                </div>
              )}
              {selectedRun.import_audit && (
                <div>
                  <b>Auditoria do importador:</b>
                  <pre className="bg-muted rounded p-2 text-xs overflow-auto mt-1">{JSON.stringify(selectedRun.import_audit, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!discoverResult} onOpenChange={(o) => !o && setDiscoverResult(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Teste de ligação BOL (discover)</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Inventário das páginas autenticadas do backoffice — serve para calibrar o URL/form do mapa M2.
          </p>
          <pre className="bg-muted rounded p-2 text-xs overflow-auto">{JSON.stringify(discoverResult, null, 2)}</pre>
        </DialogContent>
      </Dialog>

      <Dialog open={credsOpen} onOpenChange={setCredsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Credenciais BOL ({SHARED_SECRET})</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email / utilizador do backoffice</Label>
              <Input value={credsForm.email} onChange={(e) => setCredsForm((s) => ({ ...s, email: e.target.value }))} placeholder="produtor@empresa.pt" />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={credsForm.password} onChange={(e) => setCredsForm((s) => ({ ...s, password: e.target.value }))} />
            </div>
            <p className="text-xs text-muted-foreground">Guardadas encriptadas no Vault; usadas só pelo backend ao correr a sync.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredsOpen(false)}>Cancelar</Button>
            <Button disabled={credsMut.isPending || !credsForm.email || !credsForm.password} onClick={() => credsMut.mutate()}>
              {credsMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddConfigModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        existingEventIds={cfgs.map((c) => c.event_id)}
        onCreated={() => {
          setAddOpen(false);
          qc.invalidateQueries({ queryKey: ["bol-sync-config"] });
        }}
      />
    </div>
  );
}

function ConfigCard({
  cfg, eventLabel, running, onRun, onToggle, onSave, saving,
}: {
  cfg: Cfg;
  eventLabel: string;
  running: boolean;
  onRun: () => void;
  onToggle: (v: boolean) => void;
  onSave: (bolEventId: string) => void;
  saving: boolean;
}) {
  const [bolId, setBolId] = useState(cfg.bol_event_id || "");
  const dirty = bolId.trim() !== (cfg.bol_event_id || "");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{eventLabel}</CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              Vault: <code>{cfg.vault_secret_name}</code>
              {cfg.last_run_at && (
                <> • última corrida {new Date(cfg.last_run_at).toLocaleString("pt-PT")}{" "}
                  <Badge variant={statusVariant(cfg.last_run_status || "")}>{cfg.last_run_status}</Badge>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Ativo</Label>
              <Switch checked={cfg.enabled} onCheckedChange={onToggle} />
            </div>
            <Button size="sm" disabled={running} onClick={onRun}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Sincronizar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Código do evento na BOL</Label>
          <Input value={bolId} onChange={(e) => setBolId(e.target.value)} className="font-mono w-40" placeholder="ex: 178134" />
        </div>
        <Button size="sm" variant="outline" disabled={!dirty || saving || !bolId.trim()} onClick={() => onSave(bolId.trim())}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Guardar
        </Button>
      </CardContent>
    </Card>
  );
}

function AddConfigModal({
  open, onClose, existingEventIds, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  existingEventIds: string[];
  onCreated: () => void;
}) {
  const { company } = useCompany();
  const [eventId, setEventId] = useState("");
  const [bolEventId, setBolEventId] = useState("");
  const [otherAccount, setOtherAccount] = useState(false);
  const [creds, setCreds] = useState({ email: "", password: "" });

  const eventsQ = useQuery({
    queryKey: ["bol-events-picker", company?.id],
    enabled: open && !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date")
        .eq("company_id", company!.id)
        .order("date", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!company?.id) throw new Error("empresa não resolvida");
      const secretName = otherAccount ? `bol_${eventId}` : SHARED_SECRET;
      const { data, error } = await supabase.from("bol_sync_config" as any).insert({
        company_id: company.id,
        event_id: eventId,
        bol_event_id: bolEventId.trim(),
        vault_secret_name: secretName,
        organization_name: "BOL",
        enabled: true,
      }).select("id").single();
      if (error) throw error;
      if (otherAccount) {
        const { error: cErr } = await supabase.functions.invoke("update-bol-credentials", {
          body: { secretName, email: creds.email, password: creds.password },
        });
        if (cErr) throw cErr;
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Evento ligado ao sync BOL.");
      setEventId(""); setBolEventId(""); setOtherAccount(false); setCreds({ email: "", password: "" });
      onCreated();
    },
    onError: (e: any) => toast.error(e?.message || "Erro a criar configuração"),
  });

  const available = (eventsQ.data || []).filter((e: any) => !existingEventIds.includes(e.id));
  const credsOk = !otherAccount || (!!creds.email && !!creds.password);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Adicionar evento ao sync BOL</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Evento do ERP</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger><SelectValue placeholder={eventsQ.isLoading ? "A carregar…" : "Selecionar evento"} /></SelectTrigger>
              <SelectContent className="max-h-72">
                {available.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}{e.date ? ` — ${e.date}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Código do evento na BOL</Label>
            <Input value={bolEventId} onChange={(e) => setBolEventId(e.target.value)} placeholder="ex: 178134" className="font-mono" />
            <p className="text-[11px] text-muted-foreground">Visível na página MAPAS do backoffice produtores.bol.pt.</p>
          </div>
          <div className="rounded border p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Credenciais</div>
                <div className="text-xs text-muted-foreground">
                  {otherAccount
                    ? "Vai guardar credenciais próprias no Vault para este evento."
                    : <>Usa a conta partilhada <code>{SHARED_SECRET}</code> — não é preciso email/password.</>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Label className="text-xs">Usar outra conta</Label>
                <Switch checked={otherAccount} onCheckedChange={setOtherAccount} />
              </div>
            </div>
            {otherAccount && (
              <div className="space-y-2 pt-1">
                <Input value={creds.email} onChange={(e) => setCreds((s) => ({ ...s, email: e.target.value }))} placeholder="produtor@empresa.pt" />
                <Input type="password" value={creds.password} onChange={(e) => setCreds((s) => ({ ...s, password: e.target.value }))} placeholder="Password" />
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!eventId || !bolEventId.trim() || !credsOk || createMut.isPending} onClick={() => createMut.mutate()}>
            {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
