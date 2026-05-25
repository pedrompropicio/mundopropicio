import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Play, RefreshCw, AlertTriangle, CheckCircle2, KeyRound, Calendar as CalendarIcon, X } from "lucide-react";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parse, isValid } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Cfg = {
  id: string;
  event_id: string;
  vault_secret_name: string;
  ticketline_event_id: string;
  organization_name: string;
  enabled: boolean;
  sales_start_date: string | null;
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

export default function TicketlineSync() {
  const qc = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [credsModal, setCredsModal] = useState<Cfg | null>(null);
  const [credsForm, setCredsForm] = useState({ email: "", password: "" });

  const cfgQ = useQuery({
    queryKey: ["ticketline-sync-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ticketline_sync_config" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Cfg[];
    },
  });

  const runsQ = useQuery({
    queryKey: ["ticketline-sync-runs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ticketline_sync_runs" as any).select("*").order("started_at", { ascending: false }).limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Run[];
    },
  });

  const runMut = useMutation({
    mutationFn: async (configId: string) => {
      const { data, error } = await supabase.functions.invoke("fetch-ticketline-reports", {
        body: { configId, mode: "manual", triggeredBy: "ui" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.ok) toast.success("Sync Ticketline concluída.");
      else toast.error(`Falhou: ${data?.results?.[0]?.phase || "erro"} — ${data?.results?.[0]?.error || ""}`);
      qc.invalidateQueries({ queryKey: ["ticketline-sync-runs"] });
      qc.invalidateQueries({ queryKey: ["ticketline-sync-config"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro a invocar função"),
  });

  const credsMut = useMutation({
    mutationFn: async () => {
      if (!credsModal) throw new Error("sem config");
      const { data, error } = await supabase.functions.invoke("update-ticketline-credentials", {
        body: { configId: credsModal.id, email: credsForm.email, password: credsForm.password },
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error || "falhou");
      return data;
    },
    onSuccess: () => {
      toast.success("Credenciais guardadas.");
      setCredsModal(null);
      setCredsForm({ email: "", password: "" });
    },
    onError: (e: any) => toast.error(e?.message || "Erro"),
  });

  const enableMut = useMutation({
    mutationFn: async (args: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("ticketline_sync_config" as any).update({ enabled: args.enabled }).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticketline-sync-config"] }),
  });

  const updateFieldsMut = useMutation({
    mutationFn: async (args: { id: string; ticketline_event_id: string; sales_start_date: string | null }) => {
      const { error } = await supabase.from("ticketline_sync_config" as any).update({
        ticketline_event_id: args.ticketline_event_id,
        sales_start_date: args.sales_start_date,
      }).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração actualizada.");
      qc.invalidateQueries({ queryKey: ["ticketline-sync-config"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro a guardar"),
  });

  const cfgs = cfgQ.data || [];
  const runs = runsQ.data || [];

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sync Ticketline</h1>
        <p className="text-muted-foreground mt-1">Importação automática diária da curva de vendas Ticketline (login Devise + sale_summary.xlsx).</p>
      </div>

      {cfgQ.isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : cfgs.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Sem configurações. Cria um registo em <code>ticketline_sync_config</code> com <code>event_id</code>, <code>ticketline_event_id</code> e <code>vault_secret_name</code>.
        </CardContent></Card>
      ) : (
        cfgs.map((cfg) => (
          <ConfigCard
            key={cfg.id}
            cfg={cfg}
            runDisabled={runMut.isPending}
            onRun={() => runMut.mutate(cfg.id)}
            onToggle={(v) => enableMut.mutate({ id: cfg.id, enabled: v })}
            onOpenCreds={() => { setCredsModal(cfg); setCredsForm({ email: "", password: "" }); }}
            onSave={(ticketline_event_id, sales_start_date) =>
              updateFieldsMut.mutate({ id: cfg.id, ticketline_event_id, sales_start_date })
            }
            saving={updateFieldsMut.isPending}
          />
        ))
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Últimas execuções</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["ticketline-sync-runs"] })}>
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
                  <TableHead>Ficheiros</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => {
                  const dur = r.finished_at ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000) : null;
                  const filesCount = Array.isArray(r.files_downloaded) ? r.files_downloaded.length : 0;
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
                      <TableCell>{filesCount}</TableCell>
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
              {selectedRun.triggered_by && <div><b>Trigger:</b> {selectedRun.triggered_by}</div>}
              {selectedRun.error_message && (
                <div className="bg-destructive/10 border border-destructive/30 rounded p-3">
                  <b>Erro:</b> <pre className="whitespace-pre-wrap text-xs mt-1">{selectedRun.error_message}</pre>
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

      <Dialog open={!!credsModal} onOpenChange={(o) => !o && setCredsModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Credenciais Ticketline</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email do organizador</Label>
              <Input value={credsForm.email} onChange={(e) => setCredsForm((s) => ({ ...s, email: e.target.value }))} placeholder="manager@empresa.pt" />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={credsForm.password} onChange={(e) => setCredsForm((s) => ({ ...s, password: e.target.value }))} />
            </div>
            <p className="text-xs text-muted-foreground">Guardadas encriptadas no Vault. Usadas só pelo backend ao correr a sync (login Devise → cookie de sessão).</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredsModal(null)}>Cancelar</Button>
            <Button disabled={credsMut.isPending || !credsForm.email || !credsForm.password} onClick={() => credsMut.mutate()}>
              {credsMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConfigCard({
  cfg, runDisabled, onRun, onToggle, onOpenCreds, onSave, saving,
}: {
  cfg: Cfg;
  runDisabled: boolean;
  onRun: () => void;
  onToggle: (v: boolean) => void;
  onOpenCreds: () => void;
  onSave: (ticketline_event_id: string, sales_start_date: string | null) => void;
  saving: boolean;
}) {
  const [tlEventId, setTlEventId] = useState(cfg.ticketline_event_id || "");
  const [salesStart, setSalesStart] = useState(cfg.sales_start_date || "");

  const dirty = (tlEventId !== (cfg.ticketline_event_id || "")) ||
                ((salesStart || null) !== (cfg.sales_start_date || null));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {cfg.organization_name}
              <Badge variant={cfg.enabled ? "default" : "secondary"}>{cfg.enabled ? "Ativo" : "Desativado"}</Badge>
              {cfg.last_run_status && (
                <Badge variant={statusVariant(cfg.last_run_status)}>{cfg.last_run_status}</Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1 font-mono text-xs">
              event_id={cfg.event_id.slice(0, 8)}…
            </CardDescription>
            {cfg.last_run_at && (
              <CardDescription className="mt-1">
                Última execução: {new Date(cfg.last_run_at).toLocaleString("pt-PT")}
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={cfg.enabled} onCheckedChange={onToggle} />
            <Button variant="outline" size="sm" onClick={onOpenCreds}>
              <KeyRound className="h-4 w-4 mr-2" /> Credenciais
            </Button>
            <Button size="sm" disabled={runDisabled} onClick={onRun}>
              {runDisabled ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Correr agora
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Código do evento na Ticketline</Label>
            <Input
              value={tlEventId}
              onChange={(e) => setTlEventId(e.target.value)}
              placeholder="ex: 63653"
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data de início de vendas (on-sale)</Label>
            <Input
              type="date"
              value={salesStart}
              onChange={(e) => setSalesStart(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Vazio = fallback 01-01-2025. Usado como <code>filter_start_date</code> no pedido sale_summary.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Vault: <code>{cfg.vault_secret_name}</code></div>
          <Button
            size="sm"
            variant="outline"
            disabled={!dirty || saving || !tlEventId.trim()}
            onClick={() => onSave(tlEventId.trim(), salesStart || null)}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
