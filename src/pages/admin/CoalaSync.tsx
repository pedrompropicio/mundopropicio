import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Play, Plus, RefreshCw, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

type Cfg = {
  id: string;
  event_id: string;
  drive_file_id: string;
  file_label: string | null;
  enabled: boolean;
  schedule_cron: string;
  last_run_at: string | null;
  last_run_status: string | null;
};

type Run = {
  id: string;
  config_id: string | null;
  mode: string;
  triggered_by: string;
  status: string;
  total_rows: number | null;
  new_count: number | null;
  removed_count: number | null;
  conflict_count: number | null;
  xlsx_sha256: string | null;
  diff: any;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

const statusColor = (s: string) => {
  if (s === "success") return "default";
  if (s === "skipped_unchanged") return "secondary";
  if (s === "blocked") return "destructive";
  if (s === "failed") return "destructive";
  if (s === "running") return "outline";
  return "secondary";
};

export default function CoalaSync() {
  const qc = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [newCfg, setNewCfg] = useState({ event_id: "", drive_file_id: "", file_label: "" });
  const [createOpen, setCreateOpen] = useState(false);

  const cfgQ = useQuery({
    queryKey: ["coala-sync-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("coala_sync_config" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Cfg[];
    },
  });

  const runsQ = useQuery({
    queryKey: ["coala-sync-runs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("coala_sync_runs" as any).select("*").order("started_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Run[];
    },
  });

  const eventsQ = useQuery({
    queryKey: ["coala-events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name, import_template").eq("import_template", "coala");
      if (error) throw error;
      return data ?? [];
    },
  });

  const runMut = useMutation({
    mutationFn: async ({ configId, mode }: { configId: string; mode: "dry_run" | "apply" }) => {
      const { data, error } = await supabase.functions.invoke("sync-coala-from-drive", {
        body: { configId, mode, triggeredBy: "manual" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const r = data?.runs?.[0];
      if (r?.status === "blocked") toast.error(`Sync bloqueada: ${r.conflicts} conflito(s)`);
      else if (r?.status === "failed") toast.error(`Sync falhou: ${r.error}`);
      else if (r?.status === "skipped_unchanged") toast.info("Ficheiro inalterado desde a última run");
      else toast.success(`Sync ${r?.status} — novos:${r?.new ?? 0} · removidos:${r?.removed ?? 0} · mismatches:${r?.mismatches ?? 0}`);
      qc.invalidateQueries({ queryKey: ["coala-sync-runs"] });
      qc.invalidateQueries({ queryKey: ["coala-sync-config"] });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message}`),
  });

  const upsertMut = useMutation({
    mutationFn: async (cfg: Partial<Cfg> & { id?: string }) => {
      if (cfg.id) {
        const { error } = await supabase.from("coala_sync_config" as any).update(cfg).eq("id", cfg.id);
        if (error) throw error;
      } else {
        const ev = (eventsQ.data ?? []).find((e: any) => e.id === cfg.event_id);
        if (!ev) throw new Error("Evento não encontrado");
        // descobrir company_id do evento
        const { data: evRow, error: evErr } = await supabase.from("events").select("company_id").eq("id", cfg.event_id!).single();
        if (evErr) throw evErr;
        const { error } = await supabase.from("coala_sync_config" as any).insert({
          event_id: cfg.event_id,
          drive_file_id: cfg.drive_file_id,
          file_label: cfg.file_label,
          company_id: (evRow as any).company_id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Configuração guardada");
      setCreateOpen(false);
      setNewCfg({ event_id: "", drive_file_id: "", file_label: "" });
      qc.invalidateQueries({ queryKey: ["coala-sync-config"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sync Coala — Google Drive</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sincronização automática diária da planilha Coala no Google Drive com o BP do evento.
            Cron 05:00 UTC (06:00 Lisboa). Em caso de conflito com edição manual, o sync é bloqueado.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Nova configuração</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova configuração de sync</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Evento</Label>
                <Select value={newCfg.event_id} onValueChange={(v) => setNewCfg({ ...newCfg, event_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar evento Coala" /></SelectTrigger>
                  <SelectContent>
                    {(eventsQ.data ?? []).map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ID do ficheiro no Google Drive</Label>
                <Input
                  placeholder="1psA-GNOQd-1U2jlgQzV8ebXgGK6wM6jZjpXUmQVzLQA"
                  value={newCfg.drive_file_id}
                  onChange={(e) => setNewCfg({ ...newCfg, drive_file_id: e.target.value.trim() })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Extrair de drive.google.com/spreadsheets/d/<b>FILE_ID</b>/edit
                </p>
              </div>
              <div>
                <Label>Etiqueta (opcional)</Label>
                <Input
                  placeholder="Coala V13 — PT 2026"
                  value={newCfg.file_label}
                  onChange={(e) => setNewCfg({ ...newCfg, file_label: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => upsertMut.mutate(newCfg)}
                disabled={!newCfg.event_id || !newCfg.drive_file_id || upsertMut.isPending}
              >
                {upsertMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Configurações */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações</CardTitle>
          <CardDescription>Ficheiros do Drive monitorizados. O cron só processa configs ativas.</CardDescription>
        </CardHeader>
        <CardContent>
          {cfgQ.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (cfgQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem configurações. Cria uma para começar.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>Drive File ID</TableHead>
                  <TableHead>Etiqueta</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Última run</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(cfgQ.data ?? []).map((c) => {
                  const ev = (eventsQ.data ?? []).find((e: any) => e.id === c.event_id);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{(ev as any)?.name ?? c.event_id.slice(0, 8)}</TableCell>
                      <TableCell className="font-mono text-xs">{c.drive_file_id.slice(0, 18)}…</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.file_label ?? "—"}</TableCell>
                      <TableCell>
                        <Switch
                          checked={c.enabled}
                          onCheckedChange={(v) => upsertMut.mutate({ id: c.id, enabled: v })}
                        />
                      </TableCell>
                      <TableCell>
                        {c.last_run_status ? (
                          <Badge variant={statusColor(c.last_run_status) as any}>{c.last_run_status}</Badge>
                        ) : <span className="text-xs text-muted-foreground">nunca</span>}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm" variant="outline"
                          onClick={() => runMut.mutate({ configId: c.id, mode: "dry_run" })}
                          disabled={runMut.isPending}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Dry-run
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            if (!confirm("Aplicar sync? Vai reescrever o BP/TX a partir do ficheiro do Drive (snapshot automático antes).")) return;
                            runMut.mutate({ configId: c.id, mode: "apply" });
                          }}
                          disabled={runMut.isPending}
                        >
                          <Play className="h-3 w-3 mr-1" /> Apply
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Histórico de runs */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de execuções</CardTitle>
          <CardDescription>Últimas 50 runs (manual + cron). Clica numa para ver o diff.</CardDescription>
        </CardHeader>
        <CardContent>
          {runsQ.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Linhas</TableHead>
                  <TableHead className="text-right">Novas</TableHead>
                  <TableHead className="text-right">Removidas</TableHead>
                  <TableHead className="text-right">Conflitos</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runsQ.data ?? []).map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelectedRun(r)}>
                    <TableCell className="text-xs">{new Date(r.started_at).toLocaleString("pt-PT")}</TableCell>
                    <TableCell><Badge variant="outline">{r.triggered_by}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{r.mode}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={statusColor(r.status) as any} className="gap-1">
                        {r.status === "success" && <CheckCircle2 className="h-3 w-3" />}
                        {r.status === "blocked" && <AlertTriangle className="h-3 w-3" />}
                        {r.status === "running" && <Clock className="h-3 w-3" />}
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{r.total_rows ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.new_count ?? 0}</TableCell>
                    <TableCell className="text-right">{r.removed_count ?? 0}</TableCell>
                    <TableCell className="text-right">{r.conflict_count ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.error_message ? <span className="text-destructive">{r.error_message.slice(0, 40)}…</span> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Diff modal */}
      <Dialog open={!!selectedRun} onOpenChange={(o) => !o && setSelectedRun(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da execução</DialogTitle>
          </DialogHeader>
          {selectedRun && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><b>Início:</b> {new Date(selectedRun.started_at).toLocaleString("pt-PT")}</div>
                <div><b>Fim:</b> {selectedRun.finished_at ? new Date(selectedRun.finished_at).toLocaleString("pt-PT") : "—"}</div>
                <div><b>SHA256:</b> <span className="font-mono text-xs">{selectedRun.xlsx_sha256?.slice(0, 16)}…</span></div>
                <div><b>Estado:</b> <Badge variant={statusColor(selectedRun.status) as any}>{selectedRun.status}</Badge></div>
              </div>
              {selectedRun.error_message && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <b>Erro:</b> {selectedRun.error_message}
                </div>
              )}
              {selectedRun.diff && (
                <div className="space-y-3">
                  {selectedRun.diff.xlsxVsBp && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm">XLSX vs BP atual</CardTitle></CardHeader>
                      <CardContent className="text-xs">
                        <pre className="whitespace-pre-wrap">{JSON.stringify(selectedRun.diff.xlsxVsBp, null, 2)}</pre>
                      </CardContent>
                    </Card>
                  )}
                  {(selectedRun.diff.valueMismatches?.length ?? 0) > 0 && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm">Diferenças de valor ({selectedRun.diff.valueMismatches.length})</CardTitle></CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Descrição</TableHead>
                              <TableHead className="text-right">Ficheiro</TableHead>
                              <TableHead className="text-right">BP</TableHead>
                              <TableHead className="text-right">Δ</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedRun.diff.valueMismatches.slice(0, 20).map((m: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{m.description}</TableCell>
                                <TableCell className="text-right text-xs">{m.fileAmount?.toFixed(2)} €</TableCell>
                                <TableCell className="text-right text-xs">{m.bpAmount?.toFixed(2)} €</TableCell>
                                <TableCell className={`text-right text-xs ${m.delta > 0 ? "text-emerald-500" : "text-destructive"}`}>{m.delta?.toFixed(2)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                  {(selectedRun.diff.xlsxVsState?.conflicts?.length ?? 0) > 0 && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm text-destructive">Conflitos com edição manual ({selectedRun.diff.xlsxVsState.conflicts.length})</CardTitle></CardHeader>
                      <CardContent>
                        <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(selectedRun.diff.xlsxVsState.conflicts, null, 2)}</pre>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
