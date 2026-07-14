import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
import { useBackdropClose } from "@/lib/backdropClose";
  AlertTriangle, CheckCircle2, Loader2, RotateCcw, Search, Table as TableIcon, Calendar, X,
} from "lucide-react";

interface Props {
  fileName: string;
  onClose: () => void;
}

type Mode = "tables" | "events";

// Curated list of restorable tables (matches selective-restore TABLE_ORDER)
const TABLES = [
  "events", "event_dates", "event_sessions", "event_ticket_zones", "event_ticket_lots",
  "event_cache_configs", "event_cache_deductions", "event_cache_extras", "event_cache_payments",
  "event_cache_tiers", "event_cache_city_settlements", "event_closing_costs",
  "event_forecasts", "event_forecast_partners", "event_partners", "event_partner_extras",
  "event_ticket_office_assignments", "event_ticket_office_advances",
  "ticket_sales", "ticket_import_logs",
  "transactions", "transaction_documents", "transaction_audit_log", "transaction_payments",
  "partner_paid_expenses", "partner_advance_expenses", "partner_event_access",
  "payment_lists", "payment_list_items", "quotations", "recurring_transactions",
  "reimbursement_notes", "reimbursement_note_items",
  "suppliers", "supplier_documents",
  "financial_accounts", "financial_account_access",
  "cities", "venues", "venue_reservations",
  "account_categories", "accounting_exports",
  "system_audit_log", "forecast_audit_log", "bp_orphan_attachments",
  "profiles", "user_roles", "user_permissions", "role_permissions",
];

export default function SelectiveRestoreModal({ fileName, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("events");
  const [search, setSearch] = useState("");
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<any>(null);
  const [previewing, setPreviewing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Load events list from current DB so user can pick
  const { data: events = [] } = useQuery({
    queryKey: ["selective-restore-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events").select("id,name,date").order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Also load events from inside the backup file (for events that no longer exist in current DB)
  const { data: backupEvents = [], isLoading: loadingBackup } = useQuery({
    queryKey: ["backup-events", fileName],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("database-backups").download(fileName);
      if (error) throw error;
      const json = JSON.parse(await data.text());
      const evts: { id: string; name: string; date: string }[] = json.tables?.events ?? [];
      return evts.map((e) => ({ id: e.id, name: e.name, date: e.date }));
    },
  });

  // Merge both lists (backup first, current overrides name if newer)
  const allEvents = useMemo(() => {
    const map = new Map<string, { id: string; name: string; date: string; inBackup: boolean; inCurrent: boolean }>();
    backupEvents.forEach((e) => map.set(e.id, { ...e, inBackup: true, inCurrent: false }));
    events.forEach((e) => {
      const existing = map.get(e.id);
      if (existing) { existing.inCurrent = true; existing.name = e.name; }
      else map.set(e.id, { ...e, inBackup: false, inCurrent: true });
    });
    return Array.from(map.values()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [events, backupEvents]);

  const filteredEvents = useMemo(
    () => allEvents.filter((e) => e.name.toLowerCase().includes(search.toLowerCase())),
    [allEvents, search],
  );
  const filteredTables = useMemo(
    () => TABLES.filter((t) => t.toLowerCase().includes(search.toLowerCase())),
    [search],
  );

  const toggleTable = (t: string) => {
    setSelectedTables((s) => { const ns = new Set(s); ns.has(t) ? ns.delete(t) : ns.add(t); return ns; });
    setPreview(null);
  };
  const toggleEvent = (id: string) => {
    setSelectedEvents((s) => { const ns = new Set(s); ns.has(id) ? ns.delete(id) : ns.add(id); return ns; });
    setPreview(null);
  };

  const canPreview = mode === "tables" ? selectedTables.size > 0 : selectedEvents.size > 0;

  const handlePreview = async () => {
    setPreviewing(true);
    setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke("selective-restore", {
        body: {
          backup_file: fileName, mode: "preview", scope: mode,
          ...(mode === "tables" ? { tables: Array.from(selectedTables) } : { event_ids: Array.from(selectedEvents) }),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPreview(data);
    } catch (err: any) {
      toast({ title: "Erro na pré-visualização", description: err.message, variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  const handleRestore = async () => {
    if (!confirm(`Restaurar ${preview?.total_rows ?? 0} registos do backup? Os dados atuais serão substituídos.`)) return;
    setRestoring(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("selective-restore", {
        body: {
          backup_file: fileName, mode: "restore", scope: mode,
          ...(mode === "tables" ? { tables: Array.from(selectedTables) } : { event_ids: Array.from(selectedEvents) }),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
      toast({
        title: data.success ? "Restauração concluída" : "Restauração parcial",
        description: `${data.total_tables} tabelas, ${data.tables_with_errors} com erros`,
        variant: data.success ? "default" : "destructive",
      });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  // Reset selection when changing mode
  useEffect(() => { setPreview(null); setResult(null); }, [mode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" {...backdrop}>
      <div className="glass w-full max-w-3xl max-h-[90vh] rounded-xl p-5 overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" /> Restauração Seletiva
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">Backup: {fileName}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        {result ? (
          <div className="flex-1 overflow-y-auto space-y-3">
            <div className={`rounded-lg p-3 flex items-center gap-2 ${result.success ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
              {result.success ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
              <div className="text-sm">
                <p className="font-semibold">{result.success ? "Restauração concluída" : "Restauração parcial"}</p>
                <p className="text-xs text-muted-foreground">{result.total_tables} tabelas processadas, {result.tables_with_errors} com erros</p>
              </div>
            </div>
            <div className="space-y-1 text-xs">
              {Object.entries(result.results || {}).map(([t, info]: [string, any]) => (
                <div key={t} className={`rounded-md p-2 ${info.error ? "bg-destructive/10" : "bg-secondary/30"}`}>
                  <div className="flex justify-between">
                    <span className="font-mono">{t}</span>
                    <span>removidos: {info.deleted === "all" ? "todos" : info.deleted} → inseridos: {info.inserted}</span>
                  </div>
                  {info.error && <p className="text-destructive mt-1">⚠ {info.error}</p>}
                </div>
              ))}
            </div>
            <button onClick={onClose} className="w-full rounded-lg bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80">Fechar</button>
          </div>
        ) : (
          <>
            {/* Mode tabs */}
            <div className="flex gap-1 p-1 rounded-lg bg-secondary/50 mb-3">
              <button onClick={() => setMode("events")} className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${mode === "events" ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"}`}>
                <Calendar className="h-3.5 w-3.5" /> Por Evento
              </button>
              <button onClick={() => setMode("tables")} className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${mode === "tables" ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"}`}>
                <TableIcon className="h-3.5 w-3.5" /> Por Tabela
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={mode === "events" ? "Filtrar evento…" : "Filtrar tabela…"} className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-sm" />
            </div>

            {/* Selection list */}
            <div className="flex-1 overflow-y-auto rounded-lg border border-border min-h-[200px] max-h-[280px]">
              {mode === "events" ? (
                loadingBackup ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <ul className="divide-y divide-border">
                    {filteredEvents.map((e) => (
                      <li key={e.id}>
                        <label className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/30 cursor-pointer">
                          <input type="checkbox" checked={selectedEvents.has(e.id)} onChange={() => toggleEvent(e.id)} className="rounded border-border" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{e.name}</p>
                            <p className="text-[10px] text-muted-foreground">{e.date}</p>
                          </div>
                          {!e.inCurrent && <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">só backup</span>}
                          {!e.inBackup && <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">só atual</span>}
                        </label>
                      </li>
                    ))}
                    {filteredEvents.length === 0 && <li className="text-xs text-muted-foreground text-center py-8">Nenhum evento</li>}
                  </ul>
                )
              ) : (
                <ul className="divide-y divide-border">
                  {filteredTables.map((t) => (
                    <li key={t}>
                      <label className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/30 cursor-pointer">
                        <input type="checkbox" checked={selectedTables.has(t)} onChange={() => toggleTable(t)} className="rounded border-border" />
                        <span className="text-sm font-mono">{t}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>
                {mode === "events"
                  ? `${selectedEvents.size} evento(s) selecionado(s)`
                  : `${selectedTables.size} tabela(s) selecionada(s)`}
              </span>
              {mode === "events" && (
                <button onClick={() => setSelectedEvents(new Set())} className="hover:text-foreground">Limpar</button>
              )}
              {mode === "tables" && (
                <button onClick={() => setSelectedTables(new Set())} className="hover:text-foreground">Limpar</button>
              )}
            </div>

            {/* Preview */}
            {preview && (
              <div className="mt-3 rounded-lg bg-secondary/50 p-3 max-h-32 overflow-y-auto">
                <p className="text-xs font-semibold mb-1">Pré-visualização ({preview.total_rows} registos)</p>
                <div className="space-y-0.5 text-[11px]">
                  {Object.entries(preview.tables || {}).map(([t, n]: [string, any]) => (
                    <div key={t} className="flex justify-between"><span className="font-mono">{t}</span><span>{n}</span></div>
                  ))}
                </div>
              </div>
            )}

            {mode === "events" && (
              <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>O restauro por evento substitui apenas linhas associadas (forecasts, transactions, ticket_sales, partners, etc.) — outros eventos não são tocados.</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-3">
              <button onClick={onClose} className="flex-1 rounded-lg bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80">Cancelar</button>
              {!preview ? (
                <button onClick={handlePreview} disabled={!canPreview || previewing} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Pré-visualizar
                </button>
              ) : (
                <button onClick={handleRestore} disabled={restoring} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
                  {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  {restoring ? "A restaurar…" : "Restaurar"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
