/**
 * Tesouraria — Fase 1 (MVP).
 *
 * Camada paralela ao resultado: mostra onde está o caixa por evento (pool
 * comum) e o que está retido em bilheteira. NÃO altera DRE, BP, Acerto de
 * Sócios nem Resultado.
 *
 * Dados:
 *   • Posição no Pool: RPC `get_event_cash_position(company_id, [date_from], [date_to])`
 *   • Retido na Bilheteira: helper `fetchTicketOfficeRetainedByEvent`
 *
 * Posições negativas são esperadas — a receita real de bilheteira vive em
 * `ticket_sales` (conta `ticket_office`, fora do pool). A feature existe
 * exatamente para expor essa assimetria. Nada se "corrige" na UI.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChevronDown, ChevronRight, AlertTriangle, Wallet, Store, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/mock-data";
import { fetchTicketOfficeRetainedByEvent } from "@/lib/ticket-office-retained";
import HelpTooltip from "@/components/HelpTooltip";
import { TreasuryBridgeSheet } from "@/components/treasury/TreasuryBridgeSheet";
import { CommonsDrillSheet } from "@/components/treasury/CommonsDrillSheet";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface RpcRow {
  level: "event" | "common";
  event_id: string | null;
  master_event_id: string | null;
  parent_event_id: string | null;
  event_name: string;
  event_date: string | null;
  is_sub: boolean;
  realized: number;
  committed: number;
  pending: number;
}

type ModeKey = "realtime" | "month";

export default function Treasury() {
  const { companyId, isLoading: cLoading } = useCompany();
  const { hasPermission, isAdmin } = useAuth();
  const canView = isAdmin || hasPermission("view_balances") || hasPermission("manage_accounts");

  const [mode, setMode] = useState<ModeKey>("realtime");
  const today = new Date();
  const [from, setFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [bridgeEventId, setBridgeEventId] = useState<string | null>(null);
  const [commonsOpen, setCommonsOpen] = useState(false);

  const dateFrom = mode === "month" ? from : null;
  const dateTo = mode === "month" ? to : null;

  const { data: rows = [], isLoading, error } = useQuery<RpcRow[]>({
    queryKey: ["treasury-positions", companyId, dateFrom, dateTo],
    enabled: !!companyId && canView,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_event_cash_position", {
        p_company_id: companyId,
        p_date_from: dateFrom,
        p_date_to: dateTo,
      });
      if (error) throw error;
      return (data as RpcRow[]) ?? [];
    },
  });

  const { data: retainedMap = new Map<string, number>() } = useQuery({
    queryKey: ["treasury-retained", companyId],
    enabled: !!companyId && canView,
    queryFn: () => fetchTicketOfficeRetainedByEvent(companyId!),
  });

  const grouped = useMemo(() => {
    const commons: RpcRow[] = [];
    const masters = new Map<string, { master: RpcRow | null; subs: RpcRow[] }>();
    for (const r of rows) {
      if (r.level === "common") {
        commons.push(r);
        continue;
      }
      const masterId = r.master_event_id || r.event_id!;
      const bucket = masters.get(masterId) ?? { master: null, subs: [] };
      if (r.is_sub) bucket.subs.push(r);
      else bucket.master = r;
      masters.set(masterId, bucket);
    }
    // Consolidação: linha master = soma do master próprio + subs
    const consolidated = Array.from(masters.entries()).map(([masterId, b]) => {
      const master = b.master;
      const subs = b.subs;
      const sum = (k: "realized" | "committed" | "pending") =>
        (master?.[k] ?? 0) + subs.reduce((s, x) => s + x[k], 0);
      const retainedSum = (master ? retainedMap.get(masterId) ?? 0 : 0)
        + subs.reduce((s, x) => s + (retainedMap.get(x.event_id!) ?? 0), 0);
      return {
        masterId,
        master,
        subs,
        consolidated: {
          realized: sum("realized"),
          committed: sum("committed"),
          pending: sum("pending"),
          retained: retainedSum,
          name: master?.event_name ?? subs[0]?.event_name ?? "—",
          date: master?.event_date ?? subs[0]?.event_date ?? null,
          hasSubs: subs.length > 0,
        },
      };
    });
    consolidated.sort((a, b) => {
      const da = a.consolidated.date ?? "9999";
      const db = b.consolidated.date ?? "9999";
      return da.localeCompare(db);
    });
    return { commons, consolidated };
  }, [rows, retainedMap]);

  const totals = useMemo(() => {
    let realized = 0, committed = 0, pending = 0, retained = 0;
    for (const r of rows) {
      realized += r.realized;
      committed += r.committed;
      pending += r.pending;
    }
    for (const v of retainedMap.values()) retained += v;
    return { realized, committed, pending, retained };
  }, [rows, retainedMap]);

  if (!canView) {
    return <div className="p-6 text-sm text-muted-foreground">Sem permissão para ver Tesouraria.</div>;
  }
  if (cLoading) return <div className="p-6 text-sm text-muted-foreground">A carregar…</div>;

  return (
    <div className="space-y-4 p-3 sm:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
            Tesouraria
            <HelpTooltip text="Camada paralela ao DRE/BP: mostra onde está o caixa por evento (pool comum) e o que está retido em bilheteira. Posições negativas são esperadas — a receita de bilheteira vive fora do pool até ser repassada." />
          </h1>
          <p className="text-xs text-muted-foreground">
            Posição no pool ({"contas líquidas: bank · cash · prepaid_card"}) por evento, mais retido em bilheteiras.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/tesouraria/alocacao">Alocação gerencial →</a>
        </Button>
      </div>

      {/* Controlos */}
      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={mode} onValueChange={(v) => setMode(v as ModeKey)}>
          <TabsList>
            <TabsTrigger value="realtime">Tempo real</TabsTrigger>
            <TabsTrigger value="month">Por período</TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === "month" && (
          <>
            <div className="space-y-1">
              <Label className="text-[10px]">De</Label>
              <Input type="date" value={from} max={to} className="h-8 text-xs"
                onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Até</Label>
              <Input type="date" value={to} min={from} className="h-8 text-xs"
                onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        )}
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KPI label="Realizado (pool)" value={totals.realized} hint="Soma de paid_amount com ajustes em todas as contas líquidas, por evento." />
        <KPI label="Comprometido" value={totals.committed} muted hint="Aprovado, ainda não pago." />
        <KPI label="Pendente" value={totals.pending} muted warn hint="Menor certeza — ainda não aprovado." />
        <KPI label="Retido em bilheteira" value={totals.retained} icon={<Store className="h-3 w-3" />} hint="Liquidez condicionada: depende de repasse da bilheteira/sala (withholds_revenue)." />
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="text-xs text-muted-foreground">A carregar posições…</div>
      ) : error ? (
        <div className="text-xs text-destructive">Erro: {(error as Error).message}</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left p-2">Evento</th>
                <th className="text-right p-2">Realizado</th>
                <th className="text-right p-2 hidden sm:table-cell">Comprom.</th>
                <th className="text-right p-2 hidden sm:table-cell">Pendente</th>
                <th className="text-right p-2">Retido bilh.</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {grouped.commons.map((c) => (
                <tr key="common" className="border-t hover:bg-muted/30 cursor-pointer"
                    onClick={() => setCommonsOpen(true)}>
                  <td className="p-2 font-medium flex items-center gap-1">
                    <Wallet className="h-3 w-3 text-muted-foreground" />
                    Comuns
                    <Badge variant="outline" className="ml-1 text-[9px] py-0">sem evento</Badge>
                  </td>
                  <td className={`p-2 text-right font-mono ${signCls(c.realized)}`}>{formatCurrency(c.realized)}</td>
                  <td className="p-2 text-right font-mono hidden sm:table-cell text-muted-foreground">{formatCurrency(c.committed)}</td>
                  <td className="p-2 text-right font-mono hidden sm:table-cell text-muted-foreground/70">{formatCurrency(c.pending)}</td>
                  <td className="p-2 text-right font-mono text-muted-foreground">—</td>
                  <td className="p-2 text-right"><ChevronRight className="h-3 w-3 text-muted-foreground inline" /></td>
                </tr>
              ))}

              {grouped.consolidated.map((g) => {
                const isOpen = !!expanded[g.masterId];
                return (
                  <RowGroup
                    key={g.masterId}
                    group={g}
                    retainedMap={retainedMap}
                    isOpen={isOpen}
                    onToggle={() => setExpanded((s) => ({ ...s, [g.masterId]: !s[g.masterId] }))}
                    onOpenBridge={(evId) => setBridgeEventId(evId)}
                  />
                );
              })}

              {grouped.consolidated.length === 0 && grouped.commons.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground text-xs">
                  Sem movimentos no período.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground flex items-start gap-1">
        <Info className="h-3 w-3 mt-px shrink-0" />
        Posições negativas em eventos são <strong>esperadas</strong>: a receita real de bilheteira fica em contas <code>ticket_office</code>, fora do pool, até ser repassada. O ecrã expõe essa assimetria — não a esconde.
      </p>

      {bridgeEventId && (
        <TreasuryBridgeSheet
          open={!!bridgeEventId}
          eventId={bridgeEventId}
          onClose={() => setBridgeEventId(null)}
          retained={retainedMap.get(bridgeEventId) ?? 0}
          poolRow={rows.find((r) => r.event_id === bridgeEventId) ?? null}
        />
      )}

      {commonsOpen && companyId && (
        <CommonsDrillSheet
          open={commonsOpen}
          onClose={() => setCommonsOpen(false)}
          companyId={companyId}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      )}
    </div>
  );
}

function KPI({ label, value, muted, warn, hint, icon }: {
  label: string; value: number; muted?: boolean; warn?: boolean; hint?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card p-2">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        {icon}{label}
        {hint && <HelpTooltip text={hint} size={10} />}
        {warn && <AlertTriangle className="h-3 w-3 text-amber-500" />}
      </p>
      <p className={`text-sm font-mono font-semibold ${muted ? "text-muted-foreground" : signCls(value)}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function signCls(v: number) {
  if (v > 0.005) return "text-emerald-500";
  if (v < -0.005) return "text-red-400";
  return "";
}

function RowGroup({ group, retainedMap, isOpen, onToggle, onOpenBridge }: {
  group: ReturnType<typeof useGrouped>[number];
  retainedMap: Map<string, number>;
  isOpen: boolean;
  onToggle: () => void;
  onOpenBridge: (eventId: string) => void;
}) {
  const c = group.consolidated;
  return (
    <>
      <tr className="border-t hover:bg-muted/30 cursor-pointer"
          onClick={() => group.master && onOpenBridge(group.master.event_id!)}>
        <td className="p-2 font-medium">
          <div className="flex items-center gap-1">
            {c.hasSubs ? (
              <button
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                className="rounded p-0.5 hover:bg-muted"
                aria-label={isOpen ? "Recolher" : "Expandir"}
              >
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            ) : <span className="w-4" />}
            <span className="truncate max-w-[260px] sm:max-w-none">{c.name}</span>
            {c.hasSubs && <Badge variant="secondary" className="text-[9px] py-0">Master · {group.subs.length}</Badge>}
            {c.date && <span className="text-[10px] text-muted-foreground hidden sm:inline">{c.date}</span>}
          </div>
        </td>
        <td className={`p-2 text-right font-mono ${signCls(c.realized)}`}>{formatCurrency(c.realized)}</td>
        <td className="p-2 text-right font-mono hidden sm:table-cell text-muted-foreground">{formatCurrency(c.committed)}</td>
        <td className="p-2 text-right font-mono hidden sm:table-cell text-muted-foreground/70">{formatCurrency(c.pending)}</td>
        <td className={`p-2 text-right font-mono ${c.retained ? "text-amber-500" : "text-muted-foreground"}`}>
          {c.retained ? formatCurrency(c.retained) : "—"}
        </td>
        <td className="p-2 text-right"><ChevronRight className="h-3 w-3 text-muted-foreground inline" /></td>
      </tr>
      {isOpen && group.subs.map((s) => (
        <tr key={s.event_id} className="border-t bg-muted/10 hover:bg-muted/30 cursor-pointer"
            onClick={() => onOpenBridge(s.event_id!)}>
          <td className="p-2 pl-10 text-muted-foreground truncate">{s.event_name}
            {s.event_date && <span className="ml-2 text-[10px]">{s.event_date}</span>}
          </td>
          <td className={`p-2 text-right font-mono ${signCls(s.realized)}`}>{formatCurrency(s.realized)}</td>
          <td className="p-2 text-right font-mono hidden sm:table-cell text-muted-foreground">{formatCurrency(s.committed)}</td>
          <td className="p-2 text-right font-mono hidden sm:table-cell text-muted-foreground/70">{formatCurrency(s.pending)}</td>
          <td className={`p-2 text-right font-mono ${retainedMap.get(s.event_id!) ? "text-amber-500" : "text-muted-foreground"}`}>
            {retainedMap.get(s.event_id!) ? formatCurrency(retainedMap.get(s.event_id!)!) : "—"}
          </td>
          <td className="p-2 text-right"><ChevronRight className="h-3 w-3 text-muted-foreground inline" /></td>
        </tr>
      ))}
    </>
  );
}

// Helper type extractor para o RowGroup
type GroupItem = {
  masterId: string;
  master: RpcRow | null;
  subs: RpcRow[];
  consolidated: {
    realized: number; committed: number; pending: number; retained: number;
    name: string; date: string | null; hasSubs: boolean;
  };
};
function useGrouped(): GroupItem[] { return []; }
