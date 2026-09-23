/**
 * BI de Vendas — secção "Lotes e preços" ao nível do evento (#214, 1.ª ronda).
 *
 * Tudo agregado na base por UMA chamada a `get_event_zone_price_dynamics`
 * (jsonb único, SECURITY DEFINER, isolado por empresa). O cliente NUNCA lê
 * `ticket_sales` para esta secção — a barreira dos 1.000 do PostgREST (#206)
 * não se aplica porque não há setof grande a atravessar a rede.
 *
 * Lote codificado no nome da zona (Ticketline) é tratado como zona — sem
 * parsing do nome.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { detectPriceTurns, type PriceTurn } from "@/lib/zone-price-turns";
import { netOfIva } from "@/hooks/useEventIvaRates";

const nfInt = new Intl.NumberFormat("pt-PT");
const nfMoney = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const int = (v: number) => nfInt.format(Number(v || 0));
const money = (v: number) => `${nfMoney.format(Number(v || 0))} €`;
const pct = (v: number) => `${nf1.format(Number(v || 0))}%`;
const fmtDay = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

interface ZoneRow {
  zone_id: string;
  zone_name: string;
  preco_vigor: number | null;
  qty: number | null;
  value: number | null;
  released: number | null;
  released_on: string | null;
  released_fonte: "exacta" | "normalizada" | null;
  ocupacao_pct: number | null;
  viradas: number;
  first_sale: string | null;
  last_sale: string | null;
}
interface SeriesRow {
  zone_id: string;
  sale_date: string;
  qty: number | null;
  value: number | null;
  price: number | null;
}
interface TurnRow {
  zone_id: string;
  zone_name: string;
  sale_date: string;
  preco_antigo: number | null;
  preco_novo: number | null;
}
interface Payload {
  event_id: string;
  zonas: ZoneRow[];
  series: SeriesRow[];
  viradas: TurnRow[];
  totais: { qty: number; value: number; zonas: number; dias_distintos: number; ultima_sale_date: string | null };
  espelho: { qty: number; value: number; dias: number; ultima_sale_date: string | null; providers: string[] };
}

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--accent-foreground))",
  "hsl(var(--muted-foreground))",
];

export default function ZoneLotsPrices({
  eventId,
  withIva,
  ivaRate,
}: {
  eventId: string;
  withIva: boolean;
  ivaRate: number;
}) {
  const [selected, setSelected] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"acumulado" | "dia">("acumulado");

  const q = useQuery({
    queryKey: ["bi-event-zone-price-dynamics", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_event_zone_price_dynamics" as any, {
        p_event_id: eventId,
      });
      if (error) throw error;
      return data as unknown as Payload;
    },
  });

  const val = (v: number | null | undefined) => (withIva ? Number(v || 0) : netOfIva(Number(v || 0), ivaRate));
  const ivaSfx = withIva ? "" : " s/ IVA";

  const data = q.data;
  const zones = data?.zonas ?? [];
  const turnsByZone = useMemo(() => {
    const byZone = new Map<string, PriceTurn[]>();
    for (const z of zones) {
      const pts = (data?.series ?? [])
        .filter((s) => s.zone_id === z.zone_id)
        .map((s) => ({ sale_date: s.sale_date, price: s.price }));
      byZone.set(z.zone_id, detectPriceTurns(pts));
    }
    return byZone;
  }, [zones, data?.series]);

  const activeIds = selected ?? zones.slice(0, 4).map((z) => z.zone_id);

  const chart = useMemo(() => {
    const series = (data?.series ?? []).filter((s) => activeIds.includes(s.zone_id));
    const days = Array.from(new Set(series.map((s) => s.sale_date))).sort();
    const acc = new Map<string, number>();
    const rows = days.map((d) => {
      const row: Record<string, any> = { sale_date: d };
      for (const id of activeIds) {
        const dayQty = series
          .filter((s) => s.zone_id === id && s.sale_date === d)
          .reduce((sum, s) => sum + Number(s.qty || 0), 0);
        const prev = acc.get(id) ?? 0;
        const next = prev + dayQty;
        acc.set(id, next);
        row[id] = mode === "acumulado" ? next : dayQty;
      }
      return row;
    });
    const marks: { sale_date: string; label: string }[] = [];
    for (const id of activeIds) {
      const z = zones.find((x) => x.zone_id === id);
      for (const t of turnsByZone.get(id) ?? []) {
        marks.push({ sale_date: t.sale_date, label: `${z?.zone_name ?? ""} ${money(t.from)}→${money(t.to)}` });
      }
    }
    return { rows, marks };
  }, [data?.series, activeIds, mode, turnsByZone, zones]);

  if (q.isLoading) {
    return (
      <Card className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> A carregar lotes e preços…
      </Card>
    );
  }
  if (q.error) {
    return <Card className="p-6 text-sm text-destructive">Não foi possível ler lotes e preços deste evento.</Card>;
  }
  if (!data || zones.length === 0) {
    return <Card className="p-6 text-sm text-muted-foreground">Ainda não há vendas por zona neste evento.</Card>;
  }

  const zoneQty = data.totais.qty ?? 0;
  const zoneValue = val(data.totais.value);
  const mirrorQty = data.espelho?.qty ?? 0;
  const mirrorValue = val(data.espelho?.value);
  const difQty = mirrorQty - zoneQty;
  const difValue = mirrorValue - zoneValue;
  const hasDif = Math.abs(difQty) > 0 || Math.abs(difValue) > 0.01;
  const soAcumulado = (data.totais.dias_distintos ?? 0) <= 1;

  return (
    <div className="space-y-4">
      {hasDif && (
        <Card className="border-warning/40 bg-warning/5 p-3 text-xs">
          <p className="font-medium text-warning">
            O total por zona não bate com o total do evento: diferença de {int(difQty)} bilhetes e {money(difValue)}
            {ivaSfx}.
          </p>
          <p className="mt-1 text-muted-foreground">
            Por zona até {fmtDay(data.totais.ultima_sale_date)} · total do evento até{" "}
            {fmtDay(data.espelho?.ultima_sale_date)} ({(data.espelho?.providers ?? []).join(", ") || "—"}). Quando o
            espelho da bilheteira está à frente, a leitura por zona fica atrasada — não é erro de soma.
          </p>
        </Card>
      )}

      <Card className="p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 p-3">
          <p className="text-sm font-semibold">Lotes e preços por zona</p>
          <p className="text-xs text-muted-foreground">
            {int(zoneQty)} bilhetes · {money(zoneValue)}
            {ivaSfx} · {int(data.totais.zonas)} zonas com venda
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-3 font-medium">Zona / lote</th>
                <th className="p-3 text-right font-medium">Preço em vigor</th>
                <th className="p-3 text-right font-medium">Bilhetes</th>
                <th className="p-3 text-right font-medium">Valor{ivaSfx}</th>
                <th className="p-3 text-right font-medium">Libertado</th>
                <th className="p-3 text-right font-medium">Ocupação do libertado</th>
                <th className="p-3 font-medium">Viradas de preço</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {zones.map((z) => {
                const turns = turnsByZone.get(z.zone_id) ?? [];
                return (
                  <tr key={z.zone_id} className="border-b align-top last:border-0">
                    <td className="p-3 font-medium">{z.zone_name}</td>
                    <td className="p-3 text-right">
                      {z.preco_vigor !== null ? money(val(z.preco_vigor)) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-right">{int(Number(z.qty || 0))}</td>
                    <td className="p-3 text-right">{money(val(z.value))}</td>
                    <td className="p-3 text-right">
                      {z.released !== null ? int(Number(z.released)) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-right">
                      {z.ocupacao_pct !== null ? (
                        <>
                          {pct(Number(z.ocupacao_pct))}
                          {z.released_fonte === "normalizada" && (
                            <span
                              className="ml-1 text-xs text-muted-foreground"
                              title="zona casada por nome normalizado (lote/recinto no rótulo da bilheteira)"
                            >
                              ≈
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground" title="sem lotação libertada correspondente">
                          —
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {turns.length === 0 ? (
                        <span className="text-xs text-muted-foreground">sem viradas</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {turns.map((t, i) => (
                            <Badge key={i} variant="outline" className="text-[11px] font-normal">
                              {fmtDay(t.sale_date)}: {money(val(t.from))} → {money(val(t.to))}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="p-3 text-xs text-muted-foreground">
          Preço em vigor é o do bilhete mais recente vendido na zona. A ocupação é sobre o que a bilheteira libertou à
          venda (última leitura de {fmtDay(zones.find((z) => z.released_on)?.released_on ?? null)}); zonas sem leitura
          correspondente ficam com “—”. Os lotes que a Ticketline escreve no nome da zona contam como zonas.
        </p>
      </Card>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
          <p className="text-sm font-semibold">Curva diária por zona</p>
          {!soAcumulado && (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={mode === "acumulado" ? "default" : "outline"}
                onClick={() => setMode("acumulado")}
              >
                Acumulado
              </Button>
              <Button size="sm" variant={mode === "dia" ? "default" : "outline"} onClick={() => setMode("dia")}>
                Por dia
              </Button>
            </div>
          )}
        </div>

        {soAcumulado ? (
          <p className="px-3 pb-4 text-sm text-muted-foreground">
            Esta bilheteira só dá o acumulado — sem curva por zona.
            {(data.espelho?.providers ?? []).length ? ` Origem: ${data.espelho.providers.join(", ")}.` : ""}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1 px-3 pb-2">
              {zones.map((z) => {
                const on = activeIds.includes(z.zone_id);
                return (
                  <button
                    type="button"
                    key={z.zone_id}
                    onClick={() =>
                      setSelected(on ? activeIds.filter((i) => i !== z.zone_id) : [...activeIds, z.zone_id])
                    }
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px]",
                      on ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {z.zone_name}
                  </button>
                );
              })}
            </div>
            <div className="h-[320px] px-1 pb-3">
              <ResponsiveContainer width="100%" height="100%">
                {mode === "acumulado" ? (
                  <AreaChart data={chart.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="sale_date" tickFormatter={fmtDay} fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip
                      labelFormatter={(l) => fmtDay(String(l))}
                      formatter={(v: any, n: any) => [int(Number(v)), zones.find((z) => z.zone_id === n)?.zone_name ?? n]}
                    />
                    <Legend formatter={(n: any) => zones.find((z) => z.zone_id === n)?.zone_name ?? n} />
                    {chart.marks.map((m, i) => (
                      <ReferenceLine
                        key={`m${i}`}
                        x={m.sale_date}
                        stroke="hsl(var(--warning))"
                        strokeDasharray="4 2"
                        label={{ value: "€", fill: "hsl(var(--warning))", fontSize: 10 }}
                      />
                    ))}
                    {activeIds.map((id, i) => (
                      <Area
                        key={id}
                        type="monotone"
                        dataKey={id}
                        stroke={PALETTE[i % PALETTE.length]}
                        fill={PALETTE[i % PALETTE.length]}
                        fillOpacity={0.15}
                      />
                    ))}
                  </AreaChart>
                ) : (
                  <BarChart data={chart.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="sale_date" tickFormatter={fmtDay} fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip
                      labelFormatter={(l) => fmtDay(String(l))}
                      formatter={(v: any, n: any) => [int(Number(v)), zones.find((z) => z.zone_id === n)?.zone_name ?? n]}
                    />
                    <Legend formatter={(n: any) => zones.find((z) => z.zone_id === n)?.zone_name ?? n} />
                    {chart.marks.map((m, i) => (
                      <ReferenceLine key={`m${i}`} x={m.sale_date} stroke="hsl(var(--warning))" strokeDasharray="4 2" />
                    ))}
                    {activeIds.map((id, i) => (
                      <Bar key={id} dataKey={id} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            <p className="px-3 pb-3 text-xs text-muted-foreground">
              Marcas verticais a tracejado são viradas de preço. Por omissão mostram-se as quatro zonas com mais
              receita; carrega nos nomes para mudar.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
