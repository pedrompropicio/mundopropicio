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
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { lisbonToday } from "@/lib/date-lisbon";
import { IvaToggle, useIvaMode } from "@/components/sales/IvaToggle";
import { netOfIva, useEventIvaRates } from "@/hooks/useEventIvaRates";
import { fetchZoneCapacities, type ZoneCapacityRow } from "@/lib/zone-capacities";

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
      const { data, error } = await supabase.from("events").select("id, name, date").eq("id", eventId).maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string; date: string | null } | null;
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

  const zonesQ = useQuery({
    queryKey: ["bi-event-zones", eventId],
    enabled: !!eventId && capsQ.isSuccess && !hasSnaps,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("id, name, total_capacity")
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
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("zone_id, quantity, total_value, notes")
        .in("zone_id", zoneIds);
      if (error) throw error;
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

    const zones = Array.from(byZone.entries()).map(([label, list]) => {
      const sorted = [...list].sort((a, b) => String(b.observed_on).localeCompare(String(a.observed_on)));
      const latest = sorted[0];
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
      let pill: { label: string; tone: "ok" | "warn" | "bad" | "muted" };
      if (porVender === 0) pill = { label: "esgotada", tone: "ok" };
      else if (ritmo <= 0) pill = { label: "parada", tone: "bad" };
      else if (daysLeft !== null && esgota !== null && esgota <= daysLeft * 0.8)
        pill = { label: "esgota a tempo", tone: "ok" };
      else if (daysLeft !== null && esgota !== null && esgota <= daysLeft) pill = { label: "à justa", tone: "warn" };
      else pill = { label: "não chega lá", tone: "bad" };
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
      capturedAt: zones[0]?.observedOn ?? null,
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
    const rows = zones
      .map((z) => {
        const a = agg.get(z.id) ?? { qty: 0, value: 0, byChannel: new Map<string, number>() };
        const cap = z.total_capacity != null ? Number(z.total_capacity) : null;
        const ocup = cap && cap > 0 ? (a.qty / cap) * 100 : null;
        let pill: { label: string; tone: "ok" | "warn" | "bad" | "muted" };
        if (a.qty === 0) pill = { label: "sem venda", tone: "muted" };
        else if (ocup !== null && ocup >= 5) pill = { label: "a andar", tone: "ok" };
        else if (ocup !== null && ocup >= 2) pill = { label: "lento", tone: "warn" };
        else pill = { label: "parado", tone: "bad" };
        return { id: z.id, name: z.name, qty: a.qty, value: a.value, cap, ocup, byChannel: a.byChannel, pill };
      })
      .sort((a, b) => b.qty - a.qty);
    const totalQty = rows.reduce((s, r) => s + r.qty, 0);
    const totalValue = rows.reduce((s, r) => s + r.value, 0);
    const totalCap = rows.reduce((s, r) => s + (r.cap ?? 0), 0);
    return {
      rows,
      channelList,
      totalQty,
      totalValue,
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
        <p className="text-sm text-muted-foreground">
          {fmtDay(eventDate)}
          {daysLeft !== null
            ? daysLeft >= 0
              ? ` · faltam ${int(daysLeft)} dias`
              : ` · há ${int(Math.abs(daysLeft))} dias`
            : ""}
        </p>
        <div className="mt-3">
          <IvaToggle withIva={withIva} onChange={setWithIva} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : zonesModel ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi label="Carga total" value={int(zonesModel.totalCarga)} />
            <Kpi label="Ocupado" value={int(zonesModel.totalOcupado)} />
            <Kpi label="Lugares por vender" value={int(zonesModel.totalPorVender)} />
            <Kpi
              label="Ocupação da sala"
              value={zonesModel.ocupGlobal !== null ? pct(zonesModel.ocupGlobal) : "—"}
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Bilhetes vendidos" value={int(sessionsModel.totalQty)} />
            <Kpi label={`Receita${ivaSfx}`} value={money(sessionsModel.totalValue)} />
            <Kpi
              label="Ocupação global"
              value={sessionsModel.ocupGlobal !== null ? pct(sessionsModel.ocupGlobal) : "—"}
            />
            <Kpi
              label="Sessões sem venda"
              value={`${int(sessionsModel.semVenda)} de ${int(sessionsModel.totalSessoes)}`}
            />
            <Kpi label={`Preço médio${ivaSfx}`} value={money(sessionsModel.precoMedio)} />
          </div>

          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Sessão</th>
                    <th className="p-3 text-right font-medium">Bilhetes</th>
                    <th className="p-3 text-right font-medium">Ocupação</th>
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
                        <Pill label={r.pill.label} tone={r.pill.tone} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="p-3 text-xs text-muted-foreground">
              Retrato de agora: bilhetes acumulados por sessão, sem seletor de período.
            </p>
          </Card>
        </>
      ) : (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Sem dados de zonas nem de sessões para este evento.
        </Card>
      )}
    </div>
  );
}
