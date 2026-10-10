/**
 * Terceiro nível do BI de Vendas — uma cidade/evento.
 *
 * MODO A (zonas): quando existem linhas em event_zone_capacities (lotação real
 *   das bilheteiras). Retrato de agora + velocidade fixa de 7 dias.
 * MODO B (sessões): quando não existem snapshots — as "zonas" do ERP são
 *   sessões (ex.: Henry & Klauss - Madrid) e as vendas vêm de ticket_sales.
 */
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import { setZoneOnSale, fetchOnSaleRunStatus, onSaleAlert } from "@/lib/zone-on-sale";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabase-paging";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { lisbonToday } from "@/lib/date-lisbon";
import { IvaToggle, useIvaMode } from "@/components/sales/IvaToggle";
import { netOfIva, useEventIvaRates } from "@/hooks/useEventIvaRates";
import { fetchZoneCapacities, latestByZone, type ZoneCapacityRow } from "@/lib/zone-capacities";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ZoneLotsPrices from "@/components/sales/ZoneLotsPrices";
import { useTicketlineCutoffs, keepTicketSaleRow, cumulativeWithCutoff, ddmm } from "@/lib/ticketline-cutoff";
import { zoneSelloutPill } from "@/lib/zone-sellout-pill";

const nfInt = new Intl.NumberFormat("pt-PT");
const nfMoney = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const money = (v: number) => `${nfMoney.format(Number(v || 0))} €`;
const int = (v: number) => nfInt.format(Number(v || 0));
const pct = (v: number) => `${nf1.format(Number(v || 0))}%`;

const fmtDay = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const daysBetween = (fromISO: string, toISOStr: string) => {
  const [y1, m1, d1] = fromISO.split("-").map(Number);
  const [y2, m2, d2] = toISOStr.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};


interface ZoneRow {
  id: string;
  name: string;
  total_capacity: number | null;
  on_sale: boolean | null;
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** Nome da sessão: "DD/MM/AAAA HH:MM" → { dayISO, weekday } */
const parseSessionName = (name: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(name.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const dayISO = `${y}-${mo}-${d}`;
  const wd = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay();
  return { dayISO, weekday: WEEKDAYS[wd] };
};


interface SaleRow {
  zone_id: string | null;
  quantity: number | null;
  total_value: number | null;
  notes: string | null;
}

function Pill({ label, tone }: { label: string; tone: "ok" | "warn" | "bad" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "ok" && "bg-success/15 text-success",
        tone === "warn" && "bg-warning/15 text-warning",
        tone === "bad" && "bg-destructive/15 text-destructive",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-3 tabular-nums">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </Card>
  );
}

export default function SalesBIEvent() {
  const { groupId = "", eventId = "" } = useParams();
  const { withIva, setWithIva, ivaSuffix } = useIvaMode();
  const { rateOf } = useEventIvaRates();
  const today = useMemo(() => lisbonToday(), []);
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const eventQ = useQuery({
    queryKey: ["bi-event", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name, date, company_id").eq("id", eventId).maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string; date: string | null; company_id: string } | null;
    },
  });

  // Lotação real da bilheteira (histórico completo; usa-se a última observação
  // por zone_label). Substitui bilheteira_zone_snapshots, que só capturava
  // parte dos lotes.
  const capsQ = useQuery({
    queryKey: ["bi-event-caps", eventId],
    enabled: !!eventId,
    queryFn: async () => fetchZoneCapacities([eventId as string]),
  });

  const hasSnaps = (capsQ.data?.length ?? 0) > 0;

  // Acumulado com corte (eventos Ticketline migrados) — regra em lib/ticketline-cutoff.
  const cutoffsQ = useTicketlineCutoffs(eventId ? [eventId] : []);
  const cutoffInfo = eventId ? cutoffsQ.data?.get(eventId) : undefined;
  const cumulativeQ = useQuery({
    queryKey: ["bi-event-cumulative-cutoff", eventId, cutoffInfo?.cutoffDate ?? null],
    enabled: !!eventId && !!cutoffInfo,
    queryFn: async () => {
      const { data: zs, error } = await supabase.from("event_ticket_zones").select("id").eq("event_id", eventId);
      if (error) throw error;
      const zoneIds = (zs ?? []).map((z: any) => z.id);
      if (zoneIds.length === 0) return cumulativeWithCutoff({ qty: 0, value: 0 }, cutoffInfo);
      const rows = await fetchAllPaged<any>((from, to) =>
        supabase
          .from("ticket_sales")
          .select("quantity, unit_price, total_value, sale_date")
          .in("zone_id", zoneIds)
          .order("id", { ascending: true })
          .range(from, to),
      );
      const base = { qty: 0, value: 0 };
      for (const r of rows as any[]) {
        if (!keepTicketSaleRow(cutoffsQ.data, eventId, r.sale_date)) continue;
        base.qty += Number(r.quantity ?? 0);
        base.value += r.total_value != null ? Number(r.total_value) : Number(r.quantity ?? 0) * Number(r.unit_price ?? 0);
      }
      return cumulativeWithCutoff(base, cutoffInfo);
    },
  });

  // #143 — marca à venda manual + alerta da leitura automática (ECI 403).
  const qc = useQueryClient();
  const [savingZone, setSavingZone] = useState<string | null>(null);
  const companyId = eventQ.data?.company_id ?? null;
  const onSaleRunsQ = useQuery({
    queryKey: ["bi-on-sale-runs", companyId, eventId],
    enabled: !!companyId && !!eventId,
    queryFn: () => fetchOnSaleRunStatus(companyId as string, eventId),
  });
  const toggleOnSale = async (r: { id: string; name: string; onSale: boolean }, after: boolean) => {
    if (!companyId) return;
    setSavingZone(r.id);
    try {
      await setZoneOnSale({ zoneId: r.id, zoneName: r.name, eventId, companyId, before: r.onSale, after });
      toast({ title: after ? "Sessão posta à venda" : "Sessão retirada da venda", description: r.name });
      qc.invalidateQueries({ queryKey: ["bi-event-zones", eventId] });
      qc.invalidateQueries({ queryKey: ["bi-on-sale-runs"] });
    } catch (e: any) {
      toast({ title: "Não gravado", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSavingZone(null);
    }
  };

  const zonesQ = useQuery({
    queryKey: ["bi-event-zones", eventId],
    enabled: !!eventId && capsQ.isSuccess && !hasSnaps,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("id, name, total_capacity, on_sale")
        .eq("event_id", eventId);
      if (error) throw error;
      return (data ?? []) as unknown as ZoneRow[];
    },
  });

  const salesQ = useQuery({
    queryKey: ["bi-event-sales", eventId, (zonesQ.data ?? []).length],
    enabled: !!eventId && capsQ.isSuccess && !hasSnaps && (zonesQ.data?.length ?? 0) > 0,
    queryFn: async () => {
      const zoneIds = (zonesQ.data ?? []).map((z) => z.id);
      // #205: paginado.
      const data = await fetchAllPaged<any>((from, to) =>
        supabase
          .from("ticket_sales")
          .select("zone_id, quantity, total_value, notes")
          .in("zone_id", zoneIds)
          .order("id", { ascending: true })
          .range(from, to),
      );
      return (data ?? []) as unknown as SaleRow[];
    },
  });

  const eventDate = eventQ.data?.date?.slice(0, 10) ?? null;
  const daysLeft = eventDate ? daysBetween(todayISO, eventDate) : null;

  // ---- MODO A: zonas (lotação da bilheteira) ----
  const zonesModel = useMemo(() => {
    const rows = capsQ.data ?? [];
    if (rows.length === 0) return null;
    const targetISO = (() => {
      const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - 7 * 86400000);
      return d.toISOString().slice(0, 10);
    })();
    const dist = (iso: string) => Math.abs(daysBetween(iso.slice(0, 10), targetISO));

    const byZone = new Map<string, ZoneCapacityRow[]>();
    for (const r of rows) {
      const list = byZone.get(r.zone_label) ?? [];
      list.push(r);
      byZone.set(r.zone_label, list);
    }

    // Só as zonas da observação corrente do evento (regra única em zone-capacities);
    // o histórico da zona serve apenas para a referência de ~7 dias.
    const zones = latestByZone(rows).map((latest) => {
      const label = latest.zone_label;
      const sorted = [...(byZone.get(label) ?? [latest])].sort((a, b) => String(b.observed_on).localeCompare(String(a.observed_on)));
      const ref = sorted.reduce((best, r) => (dist(r.observed_on) < dist(best.observed_on) ? r : best), sorted[0]);
      const capacity = latest.capacity != null ? Number(latest.capacity) : null;
      const occupied = Number(latest.occupied ?? 0);
      const blocked = Number(latest.blocked ?? 0);
      const porVender = Number(latest.available ?? 0);
      // saíram 7d = occupied de agora menos occupied da observação ~hoje-7.
      // Pode dar negativo (devoluções/libertações) e mostra-se tal como é.
      const saiu = occupied - Number(ref.occupied ?? 0);
      const ritmo = saiu / 7;
      const esgota = ritmo > 0 ? Math.ceil(porVender / ritmo) : null;
      const ocup = capacity && capacity > 0 ? (occupied / capacity) * 100 : null;
      const oversold = capacity != null && occupied > capacity;
      const pill = zoneSelloutPill({ porVender, ritmo, esgota, daysLeft });
      return {
        label,
        capacity,
        occupied,
        blocked,
        porVender,
        saiu,
        ritmo,
        esgota,
        ocup,
        oversold,
        pill,
        observedOn: String(latest.observed_on).slice(0, 10),
      };
    });
    zones.sort((a, b) => b.porVender - a.porVender);
    const totalCarga = zones.reduce((s, z) => s + (z.capacity ?? 0), 0);
    const totalOcupado = zones.reduce((s, z) => s + z.occupied, 0);
    return {
      zones,
      totalCarga,
      totalOcupado,
      totalPorVender: zones.reduce((s, z) => s + z.porVender, 0),
      totalSaiu: zones.reduce((s, z) => s + z.saiu, 0),
      totalRitmo: zones.reduce((s, z) => s + z.ritmo, 0),
      ocupGlobal: totalCarga > 0 ? (totalOcupado / totalCarga) * 100 : null,
      esgotadas: zones.filter((z) => z.porVender === 0).length,
      capturedAt: zones.reduce<string | null>((m, z) => (!m || z.observedOn > m ? z.observedOn : m), null),
    };
  }, [capsQ.data, daysLeft, today]);

  // ---- MODO B: sessões ----
  const sessionsModel = useMemo(() => {
    if (hasSnaps) return null;
    const zones = zonesQ.data ?? [];
    const sales = salesQ.data ?? [];
    if (zones.length === 0) return null;
    const channels = new Set<string>();
    const agg = new Map<string, { qty: number; value: number; byChannel: Map<string, number> }>();
    for (const s of sales) {
      if (!s.zone_id) continue;
      const ch = (s.notes ?? "").includes("•") ? (s.notes ?? "").split("•").slice(1).join("•").trim() : "Outro";
      channels.add(ch);
      const a = agg.get(s.zone_id) ?? { qty: 0, value: 0, byChannel: new Map<string, number>() };
      a.qty += Number(s.quantity ?? 0);
      // valor BRUTO na base; converte-se com a taxa DESTE evento quando "Sem IVA"
      const vGross = Number(s.total_value ?? 0);
      a.value += withIva ? vGross : netOfIva(vGross, rateOf(eventId));
      a.byChannel.set(ch, (a.byChannel.get(ch) ?? 0) + Number(s.quantity ?? 0));
      agg.set(s.zone_id, a);
    }
    const channelList = Array.from(channels).sort();
    const all = zones
      .map((z) => {
        const a = agg.get(z.id) ?? { qty: 0, value: 0, byChannel: new Map<string, number>() };
        const cap = z.total_capacity != null ? Number(z.total_capacity) : null;
        const ocup = cap && cap > 0 ? (a.qty / cap) * 100 : null;
        const onSale = z.on_sale !== false; // null = "não sabemos" conta como à venda
        let pill: { label: string; tone: "ok" | "warn" | "bad" | "muted" };
        if (!onSale) pill = { label: "não lançada", tone: "muted" };
        else if (a.qty === 0) pill = { label: "sem venda", tone: "muted" };
        else if (ocup !== null && ocup >= 5) pill = { label: "a andar", tone: "ok" };
        else if (ocup !== null && ocup >= 2) pill = { label: "lento", tone: "warn" };
        else pill = { label: "parado", tone: "bad" };
        return { id: z.id, name: z.name, qty: a.qty, value: a.value, cap, ocup, byChannel: a.byChannel, pill, onSale };
      })
      .sort((a, b) => b.qty - a.qty);

    // Sessões não lançadas ficam fora de TODOS os cálculos.
    const rows = all.filter((r) => r.onSale);
    const notLaunched = all
      .filter((r) => !r.onSale)
      .sort((a, b) => (parseSessionName(a.name)?.dayISO ?? a.name).localeCompare(parseSessionName(b.name)?.dayISO ?? b.name) || a.name.localeCompare(b.name));
    const totalQty = rows.reduce((s, r) => s + r.qty, 0);
    const totalValue = rows.reduce((s, r) => s + r.value, 0);
    const totalCap = rows.reduce((s, r) => s + (r.cap ?? 0), 0);

    // Por dia de espetáculo — só sessões à venda
    const byDay = new Map<string, { weekday: string; sessoes: number; cap: number; qty: number; value: number }>();
    for (const r of rows) {
      const p = parseSessionName(r.name);
      if (!p) continue;
      const d = byDay.get(p.dayISO) ?? { weekday: p.weekday, sessoes: 0, cap: 0, qty: 0, value: 0 };
      d.sessoes += 1;
      d.cap += r.cap ?? 0;
      d.qty += r.qty;
      d.value += r.value;
      byDay.set(p.dayISO, d);
    }
    const days = Array.from(byDay.entries())
      .map(([dayISO, d]) => ({ dayISO, ...d, ocup: d.cap > 0 ? (d.qty / d.cap) * 100 : null }))
      .sort((a, b) => a.dayISO.localeCompare(b.dayISO));

    return {
      rows,
      notLaunched,
      days,
      channelList,
      totalQty,
      totalValue,
      totalCap,
      ocupGlobal: totalCap > 0 ? (totalQty / totalCap) * 100 : null,
      semVenda: rows.filter((r) => r.qty === 0).length,
      totalSessoes: rows.length,
      precoMedio: totalQty > 0 ? totalValue / totalQty : 0,
    };
  }, [hasSnaps, zonesQ.data, salesQ.data, withIva, rateOf, eventId]);

  const isLoading =
    eventQ.isLoading || capsQ.isLoading || (!hasSnaps && (zonesQ.isLoading || salesQ.isLoading));

  const ivaSfx = withIva ? "" : " s/ IVA";

  return (
    <div className="w-full max-w-full space-y-4 overflow-x-hidden">
      <div>
        <Link
          to={`/vendas/${groupId}${ivaSuffix}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </Link>
        <h1 className="mt-1 text-xl font-bold tracking-tight lg:text-2xl">{eventQ.data?.name ?? "Evento"}</h1>
        {eventQ.isSuccess && !eventQ.data ? (
          <p className="text-sm text-warning">
            Este evento não está visível na empresa ativa (ou não existe). Troca a empresa ativa no topo para a dona do
            evento.
          </p>
        ) : eventQ.isError ? (
          <p className="text-sm text-destructive">Não foi possível ler o evento.</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {eventQ.data && !eventDate ? "sem data" : fmtDay(eventDate)}
            {daysLeft !== null
              ? daysLeft >= 0
                ? ` · faltam ${int(daysLeft)} dias`
                : ` · há ${int(Math.abs(daysLeft))} dias`
              : ""}
          </p>
        )}
        <div className="mt-3">
          <IvaToggle withIva={withIva} onChange={setWithIva} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : (
        <Tabs defaultValue="geral" className="space-y-4">
          <TabsList>
            <TabsTrigger value="geral">Visão geral</TabsTrigger>
            <TabsTrigger value="lotes">Lotes e preços</TabsTrigger>
          </TabsList>
          <TabsContent value="geral" className="space-y-4">
          {zonesModel ? (
        <>
          {cutoffInfo && (
            <Card className="border-warning/40 p-3 text-sm">
              <p className="font-medium">
                Bilhetes vendidos (acumulado actual):{" "}
                {cumulativeQ.data ? `${int(cumulativeQ.data.qty)} · ${money(cumulativeQ.data.value)}` : "…"}
              </p>
              <p className="text-xs text-muted-foreground">
                A Ticketline migrou este evento. O total do evento é actual: histórico até {ddmm(cutoffInfo.cutoffDate)}
                {" "}mais a série diária depois dessa data. A repartição por zona e a ocupação abaixo estão congeladas
                {" "}na última leitura ({ddmm(zonesModel.capturedAt)}) e não são de hoje.
              </p>
            </Card>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi label="Carga total" value={int(zonesModel.totalCarga)} sub={`última leitura ${ddmm(zonesModel.capturedAt)}`} />
            <Kpi label="Ocupado" value={int(zonesModel.totalOcupado)} sub={`última leitura ${ddmm(zonesModel.capturedAt)}`} />
            <Kpi label="Lugares por vender" value={int(zonesModel.totalPorVender)} sub={`última leitura ${ddmm(zonesModel.capturedAt)}`} />
            <Kpi
              label="Ocupação da sala"
              value={zonesModel.ocupGlobal !== null ? pct(zonesModel.ocupGlobal) : "—"}
              sub={`última leitura ${ddmm(zonesModel.capturedAt)}`}
            />
            <Kpi label="Saíram nos últimos 7 dias" value={int(zonesModel.totalSaiu)} />
            <Kpi label="Ritmo diário" value={`${nf1.format(zonesModel.totalRitmo)}/dia`} />
          </div>

          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Zona</th>
                    <th className="p-3 text-right font-medium">Carga</th>
                    <th className="p-3 text-right font-medium">Ocupado</th>
                    <th className="p-3 text-right font-medium">Por vender</th>
                    <th className="p-3 text-right font-medium">Bloqueado</th>
                    <th className="p-3 text-right font-medium">Ocupação da sala</th>
                    <th className="p-3 text-right font-medium">Saíram 7d</th>
                    <th className="p-3 text-right font-medium">Ritmo/dia</th>
                    <th className="p-3 text-right font-medium">Esgota em</th>
                    <th className="p-3 font-medium">Leitura</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {zonesModel.zones.map((z) => (
                    <tr key={z.label} className="border-b last:border-0">
                      <td className="p-3 font-medium">{z.label}</td>
                      <td className="p-3 text-right">
                        {z.capacity !== null ? int(z.capacity) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-right">{int(z.occupied)}</td>
                      <td className="p-3 text-right">{int(z.porVender)}</td>
                      <td className="p-3 text-right">{int(z.blocked)}</td>
                      <td className="p-3 text-right">
                        {z.ocup !== null ? (
                          <>
                            {pct(z.ocup)}
                            {z.oversold && (
                              <span className="ml-1 text-xs text-muted-foreground" title="ocupado acima da carga — libertações/devoluções">
                                ⚠
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={cn("p-3 text-right", z.saiu < 0 && "text-destructive")}>{int(z.saiu)}</td>
                      <td className="p-3 text-right">{nf1.format(z.ritmo)}</td>
                      <td className="p-3 text-right">
                        {z.esgota !== null ? `${int(z.esgota)} dias` : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3">
                        <Pill label={z.pill.label} tone={z.pill.tone} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="p-3 text-xs text-muted-foreground">
              Retrato de agora, com velocidade calculada sobre os últimos 7 dias. Ocupação da sala é o que a
              bilheteira diz que está tomado (inclui cortesias, protocolo e reservas) — não são os bilhetes vendidos
              por nós.
            </p>
          </Card>
        </>
      ) : sessionsModel ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi label="Sessões à venda" value={int(sessionsModel.totalSessoes)} />
            <Kpi label="Bilhetes vendidos" value={int(sessionsModel.totalQty)} />
            <Kpi label={`Receita${ivaSfx}`} value={money(sessionsModel.totalValue)} />
            <Kpi
              label="Ocupação (bilhetes nossos)"
              value={sessionsModel.ocupGlobal !== null ? pct(sessionsModel.ocupGlobal) : "—"}
              sub={`${int(sessionsModel.totalQty)} de ${int(sessionsModel.totalCap)} lugares à venda`}
            />
            <Kpi
              label="Sessões sem venda"
              value={`${int(sessionsModel.semVenda)} de ${int(sessionsModel.totalSessoes)}`}
            />
            <Kpi label={`Preço médio${ivaSfx}`} value={money(sessionsModel.precoMedio)} />
          </div>

          {sessionsModel.days.length > 0 && (
            <Card className="p-0">
              <p className="p-3 text-sm font-semibold">Por dia de espetáculo</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="p-3 font-medium">Data</th>
                      <th className="p-3 font-medium">Dia</th>
                      <th className="p-3 text-right font-medium">Sessões</th>
                      <th className="p-3 text-right font-medium">Carga</th>
                      <th className="p-3 text-right font-medium">Bilhetes</th>
                      <th className="p-3 text-right font-medium">Receita{ivaSfx}</th>
                      <th className="p-3 text-right font-medium">Ocupação (bilhetes nossos)</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {sessionsModel.days.map((d) => (
                      <tr key={d.dayISO} className="border-b last:border-0">
                        <td className="p-3 font-medium">{fmtDay(d.dayISO)}</td>
                        <td className="p-3 text-muted-foreground">{d.weekday}</td>
                        <td className="p-3 text-right">{int(d.sessoes)}</td>
                        <td className="p-3 text-right">{int(d.cap)}</td>
                        <td className="p-3 text-right">{int(d.qty)}</td>
                        <td className="p-3 text-right">{money(d.value)}</td>
                        <td className="p-3 text-right">
                          {d.ocup !== null ? pct(d.ocup) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="p-3 text-xs text-muted-foreground">
                Só sessões à venda. Ocupação calculada sobre os nossos bilhetes, não sobre observação da bilheteira.
              </p>
            </Card>
          )}

          {(() => {
            const msg = onSaleAlert(onSaleRunsQ.data);
            const m = onSaleRunsQ.data?.lastManual;
            return (msg || m) ? (
              <Card className="border-warning/40 bg-warning/5 p-3 text-sm space-y-1">
                {msg && <p className="font-medium">{msg}</p>}
                {m && (
                  <p className="text-xs text-muted-foreground">
                    Última marcação manual: {m.sessao} → {m.depois ? "à venda" : "não lançada"}, por {m.email ?? "—"} em{" "}
                    {new Date(m.started_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}.
                  </p>
                )}
              </Card>
            ) : null;
          })()}
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Sessão</th>
                    <th className="p-3 text-right font-medium">Bilhetes</th>
                    <th className="p-3 text-right font-medium">Ocupação (bilhetes nossos)</th>
                    <th className="p-3 text-right font-medium">Receita{ivaSfx}</th>
                    {sessionsModel.channelList.map((c) => (
                      <th key={c} className="p-3 text-right font-medium">
                        {c}
                      </th>
                    ))}
                    <th className="p-3 font-medium">Leitura</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {sessionsModel.rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-3 font-medium">{r.name}</td>
                      <td className="p-3 text-right">{int(r.qty)}</td>
                      <td className="p-3 text-right">
                        {r.ocup !== null ? pct(r.ocup) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-right">{money(r.value)}</td>
                      {sessionsModel.channelList.map((c) => (
                        <td key={c} className="p-3 text-right">
                          {r.byChannel.get(c) ? int(r.byChannel.get(c) as number) : <span className="text-muted-foreground">—</span>}
                        </td>
                      ))}
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Pill label={r.pill.label} tone={r.pill.tone} />
                          <button type="button" className="text-xs text-muted-foreground underline disabled:opacity-50"
                            disabled={savingZone === r.id} onClick={() => toggleOnSale(r, false)}>
                            Retirar da venda
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="p-3 text-xs text-muted-foreground">
              Retrato de agora: bilhetes acumulados por sessão, sem seletor de período. Só sessões à venda.
            </p>
          </Card>

          {sessionsModel.notLaunched.length > 0 && (
            <Card className="p-0">
              <p className="p-3 text-sm font-semibold">Ainda não lançadas</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="p-3 font-medium">Sessão</th>
                      <th className="p-3 text-right font-medium">Carga</th>
                      <th className="p-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {sessionsModel.notLaunched.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">{r.name}</td>
                        <td className="p-3 text-right">
                          {r.cap !== null ? int(r.cap) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Pill label="não lançada" tone="muted" />
                            <button type="button" className="text-xs text-primary underline disabled:opacity-50"
                              disabled={savingZone === r.id} onClick={() => toggleOnSale(r, true)}>
                              Pôr à venda
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="p-3 text-xs text-muted-foreground">
                Sessões ainda não colocadas à venda ao público. Não entram em nenhum indicador nem cálculo de
                ocupação.
              </p>
            </Card>
          )}
        </>
          ) : (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Sem dados de zonas nem de sessões para este evento.
            </Card>
          )}
          </TabsContent>
          <TabsContent value="lotes">
            <ZoneLotsPrices
              eventId={eventId}
              withIva={withIva}
              ivaRate={rateOf(eventId)}
              eventDate={eventDate}
              todayISO={todayISO}
            />
          </TabsContent>
        </Tabs>
      )}

    </div>
  );
}
