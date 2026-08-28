import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Play, Plus, RefreshCw, AlertTriangle, CheckCircle2, Clock, Zap, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useHasFeature } from "@/hooks/useCompanyFeatures";
import { FEATURES } from "@/lib/features";
import { FeatureNotEnabledCard } from "@/components/FeatureNotEnabledCard";
import CoalaApplyButton from "@/components/coala/CoalaApplyButton";


type Cfg = {
  id: string;
  event_id: string;
  drive_file_id: string;
  file_label: string | null;
  enabled: boolean;
  schedule_cron: string;
  last_run_at: string | null;
  last_run_status: string | null;
  auto_apply_enabled?: boolean;
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
  if (s === "blocked_disabled") return "destructive";

  if (s === "failed") return "destructive";
  if (s === "running") return "outline";
  return "secondary";
};

export default function CoalaSync() {
  const qc = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [newCfg, setNewCfg] = useState({ event_id: "", drive_file_id: "", file_label: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const hasFeature = useHasFeature(FEATURES.SYNC_COALA);

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
    onSuccess: async (data: any) => {
      const r = data?.runs?.[0];
      if (r?.status === "blocked") toast.error(`Sync bloqueada: ${r.conflicts} conflito(s)`);
      else if (r?.status === "failed") toast.error(`Sync falhou: ${r.error}`);
      else if (r?.status === "skipped_unchanged") toast.info("Ficheiro inalterado desde a última run");
      else toast.success(`Sync ${r?.status} — novos:${r?.new ?? 0} · removidos:${r?.removed ?? 0} · mismatches:${r?.mismatches ?? 0}`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["coala-sync-runs"] }),
        qc.invalidateQueries({ queryKey: ["coala-sync-config"] }),
      ]);
      if (r?.runId) {
        const { data: fullRun } = await supabase
          .from("coala_sync_runs" as any)
          .select("*")
          .eq("id", r.runId)
          .maybeSingle();
        if (fullRun) setSelectedRun(fullRun as unknown as Run);
      }
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

  if (!hasFeature) return <FeatureNotEnabledCard featureKey={FEATURES.SYNC_COALA} />;

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
                  <TableHead>Auto-aplicar</TableHead>
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
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={c.auto_apply_enabled !== false}
                            onCheckedChange={(v) => upsertMut.mutate({ id: c.id, auto_apply_enabled: v })}
                          />
                          <span className="text-[10px] text-muted-foreground">
                            {c.auto_apply_enabled !== false ? "auto" : "manual"}
                          </span>
                        </div>
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
                        <CoalaApplyButton
                          eventId={c.event_id}
                          enabled={c.enabled}
                          autoApplyEnabled={c.auto_apply_enabled !== false}
                          pending={runMut.isPending}
                          onConfirm={() => runMut.mutate({ configId: c.id, mode: "apply" })}
                        />

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
      <DiffReviewDialog
        run={selectedRun}
        driveFileId={
          (cfgQ.data ?? []).find((c) => c.id === selectedRun?.config_id)?.drive_file_id ?? null
        }
        onClose={() => setSelectedRun(null)}
        onApplied={() => {
          qc.invalidateQueries({ queryKey: ["coala-sync-runs"] });
          qc.invalidateQueries({ queryKey: ["coala-sync-config"] });
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Modal de revisão de diferenças (Validar / Ignorar / Editar)
// ─────────────────────────────────────────────────────────────────
type DiffItem = {
  rowKey: string;
  diffKind:
    | "value_mismatch"
    | "rename_only"
    | "split_pending"
    | "new_row"
    | "removed_row"
    | "conflict"
    | "sponsor_mismatch"
    | "extra_in_bp"
    | "tx_missing"
    | "tx_value_mismatch"
    | "tx_extra";
  description: string;
  fileAmount?: number | null;
  bpAmount?: number | null;
  delta?: number | null;
  rowNumber?: number | null;
  supplier?: string | null;
  bpDescription?: string | null;
  fuzzyScore?: number | null;
  txIsPaid?: boolean;
  severity?: "auto" | "review";
  raw?: any;
};

function buildDiffItems(run: Run | null): DiffItem[] {
  if (!run?.diff) return [];
  const items: DiffItem[] = [];
  const d = run.diff as any;

  // 1. BP — Diferenças de VALOR
  for (const m of d.valueMismatches ?? []) {
    items.push({
      rowKey: m.rowKey ?? `vm:${m.description}:${m.fileAmount}`,
      diffKind: "value_mismatch",
      description: m.description ?? "(sem descrição)",
      fileAmount: m.fileAmount ?? null,
      bpAmount: m.bpAmount ?? null,
      delta: m.delta ?? null,
      bpDescription: m.bpDescription ?? null,
      fuzzyScore: m.fuzzyScore ?? null,
      rowNumber: m.rowNumber ?? null,
      severity: m.severity,
      raw: m,
    });
  }

  // 1b. BP — Renomeações (mesmo valor, descrição diferente)
  for (const m of d.renameOnly ?? []) {
    items.push({
      rowKey: `rn:${m.bpId}:${m.rowNumber}`,
      diffKind: "rename_only",
      description: m.description ?? "(sem descrição)",
      fileAmount: m.fileAmount ?? null,
      bpAmount: m.bpAmount ?? null,
      delta: 0,
      bpDescription: m.bpDescription ?? null,
      fuzzyScore: m.fuzzyScore ?? null,
      rowNumber: m.rowNumber ?? null,
      severity: m.severity,
      raw: m,
    });
  }

  // 1c. BP — Splits 1→N detectados
  for (const s of d.splitPending ?? []) {
    items.push({
      rowKey: `sp:${s.bpId}`,
      diffKind: "split_pending",
      description: `${s.bpDescription} ↔ ${s.fileRows.length} linhas do XLSX`,
      bpAmount: s.bpAmount,
      fileAmount: s.bpAmount + s.sumDelta,
      delta: s.sumDelta,
      severity: s.severity,
      raw: s,
    });
  }

  // 2. BP — Falta no BP
  for (const r of d.missingInBp ?? []) {
    items.push({
      rowKey: `miss:${r.description}:${r.netAmount}`,
      diffKind: "new_row",
      description: r.description,
      fileAmount: r.netAmount,
      rowNumber: r.rowNumber ?? null,
      supplier: r.supplier ?? null,
      raw: r,
    });
  }

  // 3. BP — Extra no BP
  for (const r of d.extraInBp ?? []) {
    items.push({
      rowKey: `extra:${r.id}`,
      diffKind: "extra_in_bp",
      description: r.description,
      bpAmount: r.amount,
      raw: r,
    });
  }

  // 4. TX — Falta TX (XLSX marca pago/parcial mas não há TX)
  for (const r of d.txMissing ?? []) {
    items.push({
      rowKey: `txmiss:${r.description}:${r.netAmount}`,
      diffKind: "tx_missing",
      description: r.description,
      fileAmount: r.netAmount,
      rowNumber: r.rowNumber ?? null,
      supplier: r.supplier ?? null,
      raw: r,
    });
  }

  // 5. TX — Diferença de valor
  for (const m of d.txValueMismatches ?? []) {
    items.push({
      rowKey: `txvm:${m.txId ?? m.description}:${m.fileAmount}`,
      diffKind: "tx_value_mismatch",
      description: m.description ?? "(sem descrição)",
      fileAmount: m.fileAmount ?? null,
      bpAmount: m.txAmount ?? null,
      delta: m.delta ?? null,
      bpDescription: m.txDescription ?? null,
      fuzzyScore: m.fuzzyScore ?? null,
      rowNumber: m.rowNumber ?? null,
      txIsPaid: !!m.txIsPaid,
      raw: m,
    });
  }

  // 6. TX — Extra (TX no sistema sem linha equivalente no XLSX)
  for (const r of d.txExtra ?? []) {
    items.push({
      rowKey: `txextra:${r.id}`,
      diffKind: "tx_extra",
      description: r.description,
      bpAmount: r.amount,
      txIsPaid: !!r.isPaid,
      raw: r,
    });
  }

  // 7. Conflitos manuais
  for (const r of d.xlsxVsState?.conflicts ?? []) {
    items.push({
      rowKey: r.rowKey,
      diffKind: "conflict",
      description: r.payload?.description ?? "(conflito)",
      raw: r,
    });
  }

  // 8. Patrocinadores
  for (const s of d.sponsors?.mismatch ?? []) {
    items.push({
      rowKey: `sp:${s.name ?? s.description}`,
      diffKind: "sponsor_mismatch",
      description: s.name ?? s.description ?? "(patrocinador)",
      fileAmount: s.file?.confirmed ?? null,
      bpAmount: s.db?.confirmed ?? null,
      delta: s.delta?.confirmed ?? null,
      raw: s,
    });
  }
  return items;
}

const kindLabel: Record<DiffItem["diffKind"], string> = {
  value_mismatch: "BP — Δ valor",
  rename_only: "BP — Renomeada",
  split_pending: "BP — Split 1→N",
  new_row: "BP — Falta",
  removed_row: "Linha removida",
  extra_in_bp: "BP — Extra",
  conflict: "Conflito manual",
  sponsor_mismatch: "Patrocinador",
  tx_missing: "TX — Falta",
  tx_value_mismatch: "TX — Δ valor",
  tx_extra: "TX — Extra",
};

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function DiffReviewDialog({
  run,
  driveFileId,
  onClose,
  onApplied,
}: {
  run: Run | null;
  driveFileId: string | null;
  onClose: () => void;
  onApplied: () => void;
}) {
  const qc = useQueryClient();
  const items = buildDiffItems(run);

  const decisionsQ = useQuery({
    enabled: !!run,
    queryKey: ["coala-sync-decisions", run?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coala_sync_decisions" as any)
        .select("*")
        .eq("run_id", run!.id);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const decByKey = new Map<string, any>(
    (decisionsQ.data ?? []).map((d: any) => [`${d.row_key}::${d.diff_kind}`, d]),
  );

  const decideMut = useMutation({
    mutationFn: async (payload: {
      item: DiffItem;
      decision: "validate" | "ignore" | "edit";
      customAmount?: number | null;
      notes?: string | null;
    }) => {
      if (!run) return;
      const { data: u } = await supabase.auth.getUser();
      const row = {
        run_id: run.id,
        config_id: run.config_id!,
        row_key: payload.item.rowKey,
        diff_kind: payload.item.diffKind,
        decision: payload.decision,
        custom_amount: payload.customAmount ?? null,
        notes: payload.notes ?? null,
        decided_by: u.user?.id ?? null,
        decided_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("coala_sync_decisions" as any)
        .upsert(row, { onConflict: "run_id,row_key,diff_kind" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coala-sync-decisions", run?.id] }),
    onError: (e: any) => toast.error(e.message),
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      if (!run?.config_id) throw new Error("Run sem config");
      const { data, error } = await supabase.functions.invoke("sync-coala-from-drive", {
        body: { configId: run.config_id, mode: "apply", triggeredBy: "manual_with_decisions", basedOnRunId: run.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const r = data?.runs?.[0];
      if (r?.status === "blocked") {
        toast.error(`Sync bloqueada: ${r.conflicts} conflito(s) pendentes`);
      } else {
        // Auto-aprendizado: ler do audit?.summary?.categoryMapping ou pendencies_report
        const cm = r?.audit?.summary?.categoryMapping ?? r?.summary?.categoryMapping ?? null;
        const learnedExact = cm?.autoLearnedExact ?? 0;
        const learnedFuzzy = cm?.autoLearnedFuzzy ?? 0;
        const ccProtected = cm?.ccProtectedConflicts ?? 0;
        const extras: string[] = [];
        if (learnedExact + learnedFuzzy > 0) extras.push(`🧠 ${learnedExact + learnedFuzzy} auto-aprendidas (${learnedExact} exactas, ${learnedFuzzy} fuzzy)`);
        if (ccProtected > 0) extras.push(`🛡 ${ccProtected} CC protegidos`);
        toast.success(`Sync aplicada (${r?.status ?? "ok"})${extras.length ? " — " + extras.join(" • ") : ""}`);
      }
      onApplied();
      onClose();
    },
    onError: (e: any) => toast.error(`Falha ao aplicar: ${e.message}`),
  });

  const pending = items.filter((i) => !decByKey.has(`${i.rowKey}::${i.diffKind}`));
  const allDecided = items.length > 0 && pending.length === 0;

  const autoItems = useMemo(() => items.filter((i) => i.severity === "auto"), [items]);
  const reviewItems = useMemo(() => items.filter((i) => i.severity === "review"), [items]);

  const [tab, setTab] = useState<"all" | "auto" | "review">("all");
  const filtered = tab === "auto" ? autoItems : tab === "review" ? reviewItems : items;

  const [expressOpen, setExpressOpen] = useState(false);
  const expressItems = reviewItems.filter((i) => !decByKey.has(`${i.rowKey}::${i.diffKind}`));

  return (
    <Dialog open={!!run} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revisão de diferenças do sync</DialogTitle>
        </DialogHeader>
        {run && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div><b>Início:</b> {new Date(run.started_at).toLocaleString("pt-PT")}</div>
              <div><b>Estado:</b> <Badge variant={statusColor(run.status) as any}>{run.status}</Badge></div>
              <div><b>Linhas (XLSX):</b> {run.total_rows ?? "—"}</div>
              <div><b>Pendentes:</b> {pending.length} / {items.length}</div>
            </div>

            {/* Totais comparativos Ficheiro vs BP (vindos de apply-coala-bp phase=compare) */}
            {(() => {
              const s = (run.diff as any)?.xlsxVsBp;
              if (!s?.file || !s?.bp) return null;
              return (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="font-medium mb-2">Comparativo Ficheiro (Base Custos col. L) vs BP do evento</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Ficheiro XLSX</div>
                      <div>{s.file.lines} linhas · <b>{fmtMoney(s.file.net)}</b></div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">BP do sistema (despesa)</div>
                      <div>{s.bp.lines} linhas · <b>{fmtMoney(s.bp.net)}</b></div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Δ (BP − Ficheiro)</div>
                      <div className={s.delta?.net > 0 ? "text-emerald-500" : s.delta?.net < 0 ? "text-destructive" : ""}>
                        {s.delta?.lines} linhas · <b>{fmtMoney(s.delta?.net)}</b>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Diferenças</div>
                      <div className="text-xs">
                        Falta no BP: <b>{s.missingInBp ?? 0}</b> · Extra no BP: <b>{s.extraInBp ?? 0}</b> · Valor: <b>{s.valueMismatches ?? 0}</b>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Coluna L do XLSX = "Valor Total s/ IVA" (chave de match contra <i>event_forecasts.amount</i>).
                    Coluna N = "Status PGT" (informativo — usado no apply para liquidar transações).
                  </p>
                </div>
              );
            })()}

            {run.error_message && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <b>Erro:</b> {run.error_message}
              </div>
            )}

            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem diferenças nesta execução. Tudo alinhado ✅</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
                    <TabsList>
                      <TabsTrigger value="all">Tudo ({items.length})</TabsTrigger>
                      <TabsTrigger value="auto">Auto ({autoItems.length})</TabsTrigger>
                      <TabsTrigger value="review">Review ({reviewItems.length})</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {expressItems.length > 0 && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => setExpressOpen(true)}
                      className="gap-2"
                    >
                      <Zap className="h-4 w-4" />
                      Modo Revisão Express ({expressItems.length})
                    </Button>
                  )}
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">Tipo</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Ficheiro</TableHead>
                        <TableHead className="text-right">Sistema</TableHead>
                        <TableHead className="text-right">Δ</TableHead>
                        <TableHead className="w-[280px]">Decisão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((it) => {
                        const key = `${it.rowKey}::${it.diffKind}`;
                        const dec = decByKey.get(key);
                        return (
                          <DecisionRow
                            key={key}
                            item={it}
                            existing={dec}
                            onDecide={(decision, customAmount, notes) =>
                              decideMut.mutate({ item: it, decision, customAmount, notes })
                            }
                            pending={decideMut.isPending}
                          />
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            <DialogFooter className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {allDecided
                  ? "Todas as diferenças têm decisão. Podes aplicar."
                  : "Decide cada linha (validar / ignorar / editar) para libertar o Apply."}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Fechar</Button>
                <Button
                  disabled={!allDecided || applyMut.isPending || run.mode !== "dry_run"}
                  onClick={() => {
                    if (!confirm("Aplicar sync com as decisões registadas? Snapshot do BP é criado automaticamente.")) return;
                    applyMut.mutate();
                  }}
                >
                  {applyMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Aplicar decisões
                </Button>
              </div>
            </DialogFooter>

            <ExpressReviewOverlay
              open={expressOpen}
              onClose={() => setExpressOpen(false)}
              items={expressItems}
              driveFileId={driveFileId}
              onDecide={(item, decision, customAmount, notes) =>
                decideMut.mutateAsync({ item, decision, customAmount, notes })
              }
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DecisionRow({
  item,
  existing,
  onDecide,
  pending,
}: {
  item: DiffItem;
  existing?: any;
  onDecide: (decision: "validate" | "ignore" | "edit", customAmount?: number | null, notes?: string | null) => void;
  pending: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState<string>(
    existing?.custom_amount?.toString() ?? item.fileAmount?.toString() ?? "",
  );
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");

  const decision = existing?.decision as "validate" | "ignore" | "edit" | undefined;

  return (
    <TableRow className={decision ? "opacity-90" : ""}>
      <TableCell>
        <Badge
          variant={
            item.diffKind.startsWith("tx_") ? "secondary" : "outline"
          }
          className="text-[10px]"
        >
          {kindLabel[item.diffKind]}
        </Badge>
        {item.txIsPaid && (
          <Badge variant="destructive" className="text-[9px] ml-1">liquidada</Badge>
        )}
      </TableCell>
      <TableCell className="text-xs">
        <div className="font-medium">{item.description}</div>
        <div className="text-[10px] text-muted-foreground space-x-2">
          {item.rowNumber != null && <span>XLSX linha {item.rowNumber}</span>}
          {item.supplier && <span>· {item.supplier}</span>}
          {item.bpDescription && item.bpDescription !== item.description && (
            <span>· {item.diffKind.startsWith("tx_") ? "TX" : "BP"}: <i>{item.bpDescription}</i></span>
          )}
          {item.fuzzyScore != null && <span>· match {(item.fuzzyScore * 100).toFixed(0)}%</span>}
        </div>
      </TableCell>
      <TableCell className="text-right text-xs">{fmtMoney(item.fileAmount)}</TableCell>
      <TableCell className="text-right text-xs">
        {item.diffKind === "new_row" ? (
          (() => {
            const cands = (item.raw?.bpCandidates ?? []) as Array<{ id: string; description: string; amount: number; delta: number; fuzzyScore: number; hasTransaction: boolean }>;
            if (!cands.length) return <span className="text-muted-foreground italic">sem candidatos</span>;
            return (
              <div className="space-y-1 text-left">
                <div className="text-[10px] text-muted-foreground">Top {cands.length} no BP:</div>
                {cands.map((c) => (
                  <div key={c.id} className="text-[10px] leading-tight">
                    <div className="truncate max-w-[260px]" title={c.description}>{c.description}</div>
                    <div className="text-muted-foreground">
                      {fmtMoney(c.amount)} · Δ {c.delta >= 0 ? "+" : ""}{c.delta.toFixed(2)} · {(c.fuzzyScore * 100).toFixed(0)}%
                      {c.hasTransaction && <span className="ml-1 text-amber-500">· tem TX</span>}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        ) : item.diffKind === "extra_in_bp" ? (
          <span>{fmtMoney(item.bpAmount)} <span className="text-[10px] text-muted-foreground">(só no BP)</span></span>
        ) : item.diffKind === "tx_extra" ? (
          <span>{fmtMoney(item.bpAmount)} <span className="text-[10px] text-muted-foreground">(TX só no sistema)</span></span>
        ) : item.diffKind === "tx_missing" ? (
          <span className="text-[10px] text-muted-foreground italic">sem TX criada</span>
        ) : (
          fmtMoney(item.bpAmount)
        )}
      </TableCell>
      <TableCell className={`text-right text-xs ${(item.delta ?? 0) > 0 ? "text-emerald-500" : (item.delta ?? 0) < 0 ? "text-destructive" : ""}`}>
        {item.delta != null ? item.delta.toFixed(2) : "—"}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1 items-center">
          <Button
            size="sm"
            variant={decision === "validate" ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => onDecide("validate")}
            disabled={pending}
          >
            ✓ Validar
          </Button>
          <Button
            size="sm"
            variant={decision === "ignore" ? "secondary" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => onDecide("ignore")}
            disabled={pending}
          >
            ⊘ Ignorar
          </Button>
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant={decision === "edit" ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                disabled={pending}
              >
                ✎ Editar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajustar valor</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {item.diffKind === "new_row" && Array.isArray(item.raw?.bpCandidates) && item.raw.bpCandidates.length > 0 && (
                  <div className="rounded border bg-muted/40 p-2 space-y-1">
                    <div className="text-[11px] text-muted-foreground">Candidatos do BP (clica para usar)</div>
                    {item.raw.bpCandidates.map((c: any) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left text-xs rounded px-2 py-1 hover:bg-accent"
                        onClick={() => {
                          setCustomAmount(String(c.amount));
                          setNotes((prev) => prev || `Vincular a BP "${c.description}" (id ${c.id.slice(0, 8)}…)`);
                        }}
                      >
                        <div className="font-medium truncate">{c.description}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {fmtMoney(c.amount)} · Δ {c.delta >= 0 ? "+" : ""}{Number(c.delta).toFixed(2)} · match {(Number(c.fuzzyScore) * 100).toFixed(0)}%
                          {c.hasTransaction && <span className="ml-1 text-amber-500">· tem TX</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <div>
                  <Label>Valor a usar (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Nota (opcional)</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Justificação" />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    const n = parseFloat(customAmount);
                    if (Number.isNaN(n)) {
                      toast.error("Valor inválido");
                      return;
                    }
                    onDecide("edit", n, notes || null);
                    setEditOpen(false);
                  }}
                >
                  Guardar decisão
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {decision && (
            <Badge variant="secondary" className="text-[10px] ml-1">
              {decision === "validate" ? "Validado" : decision === "ignore" ? "Ignorado" : `Editado → ${existing?.custom_amount?.toFixed?.(2) ?? "?"} €`}
            </Badge>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─────────────────────────────────────────────────────────────────
// Modo Revisão Express — overlay 1-a-1 com atalhos de teclado
// ─────────────────────────────────────────────────────────────────
function ExpressReviewOverlay({
  open,
  onClose,
  items,
  onDecide,
  driveFileId,
}: {
  open: boolean;
  onClose: () => void;
  items: DiffItem[];
  driveFileId: string | null;
  onDecide: (
    item: DiffItem,
    decision: "validate" | "ignore" | "edit",
    customAmount?: number | null,
    notes?: string | null,
  ) => Promise<unknown> | void;
}) {
  const [idx, setIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Reset índice quando o overlay abre OU quando a fila muda (após decisões).
  useEffect(() => {
    if (open) setIdx(0);
  }, [open]);

  useEffect(() => {
    if (idx >= items.length && items.length > 0) setIdx(items.length - 1);
  }, [items.length, idx]);

  const current = items[idx];

  useEffect(() => {
    setEditing(false);
    setCustomAmount(current?.fileAmount?.toString() ?? "");
    setNotes("");
  }, [current?.rowKey, current?.diffKind]);

  const handleDecide = async (
    decision: "validate" | "ignore" | "edit",
    extra?: { customAmount?: number | null; notes?: string | null },
  ) => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await onDecide(current, decision, extra?.customAmount, extra?.notes);
      // próximo carrega em 200ms ou fecha quando acabar
      setTimeout(() => {
        setBusy(false);
        if (idx + 1 >= items.length) {
          onClose();
        } else {
          setIdx((i) => i + 1);
        }
      }, 200);
    } catch (e) {
      setBusy(false);
    }
  };

  // Atalhos de teclado
  useEffect(() => {
    if (!open || editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "1") { e.preventDefault(); handleDecide("validate"); }
      else if (e.key === "2") { e.preventDefault(); handleDecide("ignore"); }
      else if (e.key === "3") { e.preventDefault(); setEditing(true); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, editing, idx, items.length]); // eslint-disable-line

  if (!open) return null;
  if (!current) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Revisão Express</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Sem itens para rever. Tudo decidido ✅</p>
          <DialogFooter><Button onClick={onClose}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const total = items.length;
  const progress = ((idx + 1) / total) * 100;
  const delta = current.delta ?? 0;
  const split = current.diffKind === "split_pending" ? (current.raw?.fileRows ?? []) : [];
  const isRename = current.diffKind === "rename_only";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Revisão Express — Item {idx + 1} de {total}
            </span>
            <span className="text-xs text-muted-foreground font-normal">
              ESC fecha · ←/→ navega · 1/2/3 decide
            </span>
          </DialogTitle>
        </DialogHeader>

        <Progress value={progress} className="h-2" />

        <div className="rounded-lg border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="text-xs">{kindLabel[current.diffKind]}</Badge>
            <div className="text-xs text-muted-foreground space-x-2 flex items-center">
              {current.rowNumber != null && <span>Linha {current.rowNumber}</span>}
              {current.supplier && <span>· {current.supplier}</span>}
              {driveFileId && current.rowNumber != null && (
                <a
                  href={`https://docs.google.com/spreadsheets/d/${driveFileId}/edit?gid=1423346099&range=A${current.rowNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline ml-1"
                >
                  Abrir na planilha ↗
                </a>
              )}
            </div>
          </div>

          <div className="text-base font-medium">{current.description}</div>
          {current.bpDescription && current.bpDescription !== current.description && (
            <div className="text-xs text-muted-foreground">
              Sistema: <i>{current.bpDescription}</i>
              {current.fuzzyScore != null && <> · match {(current.fuzzyScore * 100).toFixed(0)}%</>}
            </div>
          )}

          {!isRename && (
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="rounded-md border p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Planilha</div>
                <div className="text-lg font-semibold">{fmtMoney(current.fileAmount)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Sistema</div>
                <div className="text-lg font-semibold">{fmtMoney(current.bpAmount)}</div>
              </div>
              <div className={`rounded-md border p-3 ${delta > 0 ? "border-emerald-500/40" : delta < 0 ? "border-destructive/40" : ""}`}>
                <div className="text-[10px] uppercase text-muted-foreground">Δ</div>
                <div className={`text-lg font-semibold ${delta > 0 ? "text-emerald-500" : delta < 0 ? "text-destructive" : ""}`}>
                  {current.delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} €` : "—"}
                </div>
              </div>
            </div>
          )}

          {isRename && (
            <div className="space-y-2 pt-2">
              <div className="text-[10px] uppercase text-muted-foreground">Renomeação detectada</div>
              <div className="rounded-md border p-3 text-sm">
                <div className="text-xs text-muted-foreground">Sistema (atual):</div>
                <div className="line-through opacity-60">{current.bpDescription}</div>
                <div className="text-xs text-muted-foreground mt-1">Planilha (nova):</div>
                <div className="font-medium">{current.description}</div>
              </div>
            </div>
          )}

          {split.length > 0 && (
            <div className="space-y-1 pt-2">
              <div className="text-[10px] uppercase text-muted-foreground">Linhas do XLSX que somam ({split.length})</div>
              <div className="rounded-md border divide-y text-sm">
                {split.map((r: any, i: number) => (
                  <div key={i} className="flex justify-between p-2">
                    <span className="truncate">{r.description ?? r.rowNumber}</span>
                    <span className="font-mono">{fmtMoney(r.netAmount ?? r.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {editing && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              {isRename ? (
                <>
                  <Label>Descrição custom</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Descrição a adoptar"
                  />
                </>
              ) : (
                <>
                  <Label>Valor custom (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                  />
                  <Label>Notas (opcional)</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </>
              )}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const amt = customAmount ? Number(customAmount) : null;
                    handleDecide("edit", { customAmount: amt, notes: notes || null });
                  }}
                  disabled={busy}
                >
                  Confirmar custom
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col">
          {!editing && (
            <div className="grid grid-cols-3 gap-2 w-full">
              <Button size="lg" variant="default" disabled={busy} onClick={() => handleDecide("validate")}>
                <span className="font-bold mr-2">1</span> Aceitar planilha
              </Button>
              <Button size="lg" variant="secondary" disabled={busy} onClick={() => handleDecide("ignore")}>
                <span className="font-bold mr-2">2</span> Manter sistema
              </Button>
              <Button size="lg" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                <span className="font-bold mr-2">3</span> Editar
              </Button>
            </div>
          )}
          <div className="flex justify-between w-full pt-1">
            <Button size="sm" variant="ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>Sair</Button>
            <Button size="sm" variant="ghost" onClick={() => setIdx((i) => Math.min(items.length - 1, i + 1))} disabled={idx >= items.length - 1}>
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
