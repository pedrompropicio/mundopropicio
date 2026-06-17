import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Users, Inbox, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";

type GeoPeriod = "all" | "30d";

type Stat = {
  to: string;
  key: string;
  label: string;
  icon: typeof CalendarDays;
  value: number | null;
};

async function safeCount(
  table: string,
  apply?: (q: any) => any,
): Promise<number | null> {
  try {
    let q: any = (supabase as any).from(table).select("*", { count: "exact", head: true });
    if (apply) q = apply(q);
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

const NO_LOC_LABEL = "Sem localização";

function getCountryName(code: string): string {
  try {
    const dn = new Intl.DisplayNames(["pt"], { type: "region" });
    return dn.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

type RankRow = { key: string; label: string; count: number; pct: number; isNoLoc: boolean };

function buildRanking(
  items: Array<{ key: string; label: string; isNoLoc: boolean }>,
  total: number,
  maxRows = 8,
): RankRow[] {
  const counts = new Map<string, { label: string; count: number; isNoLoc: boolean }>();
  for (const it of items) {
    const cur = counts.get(it.key);
    if (cur) cur.count += 1;
    else counts.set(it.key, { label: it.label, count: 1, isNoLoc: it.isNoLoc });
  }
  const sorted = [...counts.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.count - a.count);

  const noLoc = sorted.filter((r) => r.isNoLoc);
  const real = sorted.filter((r) => !r.isNoLoc);

  const top = real.slice(0, maxRows);
  const rest = real.slice(maxRows);
  const rows: RankRow[] = top.map((r) => ({
    key: r.key,
    label: r.label,
    count: r.count,
    pct: total > 0 ? (r.count / total) * 100 : 0,
    isNoLoc: false,
  }));
  if (rest.length > 0) {
    const restCount = rest.reduce((s, r) => s + r.count, 0);
    rows.push({
      key: "__others__",
      label: `Outros (${rest.length})`,
      count: restCount,
      pct: total > 0 ? (restCount / total) * 100 : 0,
      isNoLoc: false,
    });
  }
  for (const nl of noLoc) {
    if (nl.count > 0) {
      rows.push({
        key: nl.key,
        label: nl.label,
        count: nl.count,
        pct: total > 0 ? (nl.count / total) * 100 : 0,
        isNoLoc: true,
      });
    }
  }
  return rows;
}

function RankingList({ rows }: { rows: RankRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Ainda sem dados de localização.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span
              className={
                r.isNoLoc
                  ? "truncate text-muted-foreground italic"
                  : "truncate text-foreground"
              }
            >
              {r.label}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {r.count.toLocaleString("pt-PT")} · {r.pct.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={
                r.isNoLoc
                  ? "h-full rounded-full bg-muted-foreground/40"
                  : "h-full rounded-full bg-emerald-500/70"
              }
              style={{ width: `${Math.min(100, Math.max(r.pct, r.count > 0 ? 2 : 0))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function CrmDashboard() {
  const [geoPeriod, setGeoPeriod] = useState<GeoPeriod>("all");

  const { data: eventsMk } = useQuery({
    queryKey: ["crm-stats", "event_marketing"],
    queryFn: () =>
      safeCount("event_marketing", (q) => q.eq("status", "published")),
    staleTime: 60_000,
    refetchOnMount: "always",
  });
  const { data: contacts } = useQuery({
    queryKey: ["crm-stats", "contacts"],
    queryFn: () => safeCount("contacts", (q) => q.eq("is_active", true)),
    staleTime: 60_000,
    refetchOnMount: "always",
  });
  const { data: leads } = useQuery({
    queryKey: ["crm-stats", "leads-30d"],
    queryFn: () => {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      return safeCount("leads", (q) => q.gte("created_at", since));
    },
    staleTime: 60_000,
    refetchOnMount: "always",
  });
  const { data: audiences } = useQuery({
    queryKey: ["crm-stats", "audiences"],
    queryFn: () => safeCount("audiences"),
    staleTime: 60_000,
    refetchOnMount: "always",
  });

  const { data: leadGeo } = useQuery({
    queryKey: ["crm-stats", "leads-geo"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Array<{ geo_country: string | null; geo_city: string | null; created_at: string | null }>> => {
      try {
        const { data, error } = await (supabase as any)
          .from("leads")
          .select("geo_country, geo_city, created_at")
          .limit(10000);
        if (error) return [];
        return (data ?? []) as Array<{ geo_country: string | null; geo_city: string | null; created_at: string | null }>;
      } catch {
        return [];
      }
    },
  });

  const { countryRows, cityRows, total } = useMemo(() => {
    const all = leadGeo ?? [];
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    const rows = geoPeriod === "30d"
      ? all.filter((r) => {
          if (!r.created_at) return false;
          const t = new Date(r.created_at).getTime();
          return Number.isFinite(t) && t >= cutoff;
        })
      : all;
    const total = rows.length;

    const countryItems = rows.map((r) => {
      const code = (r.geo_country ?? "").trim();
      if (!code) return { key: "__none__", label: NO_LOC_LABEL, isNoLoc: true };
      const up = code.toUpperCase();
      return { key: up, label: getCountryName(up), isNoLoc: false };
    });
    const cityItems = rows.map((r) => {
      const city = (r.geo_city ?? "").trim();
      if (!city) return { key: "__none__", label: NO_LOC_LABEL, isNoLoc: true };
      return { key: city.toLowerCase(), label: city, isNoLoc: false };
    });

    return {
      total,
      countryRows: buildRanking(countryItems, total),
      cityRows: buildRanking(cityItems, total),
    };
  }, [leadGeo, geoPeriod]);

  const stats: Stat[] = [
    { to: "/crm/eventos", key: "events", label: "Eventos com Marketing", icon: CalendarDays, value: eventsMk ?? null },
    { to: "/crm/contactos", key: "contacts", label: "Contactos", icon: Users, value: contacts ?? null },
    { to: "/crm/leads", key: "leads", label: "Leads (30 dias)", icon: Inbox, value: leads ?? null },
    { to: "/crm/audiences", key: "audiences", label: "Audiências", icon: Target, value: audiences ?? null },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">MP CRM</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vendas, relacionamento e marketing — visão geral
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.key}
            to={s.to}
            aria-label={`Abrir ${s.label}`}
            className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Card className="h-full cursor-pointer transition-all hover:border-emerald-500/40 hover:shadow-md hover:-translate-y-0.5">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {s.label}
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <s.icon className="h-4 w-4 text-emerald-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">
                  {s.value === null ? "—" : s.value.toLocaleString("pt-PT")}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 px-1">
          <h2 className="text-sm font-medium text-muted-foreground">
            Geografia dos leads
          </h2>
          <ToggleGroup
            type="single"
            size="sm"
            value={geoPeriod}
            onValueChange={(v) => {
              if (v === "all" || v === "30d") setGeoPeriod(v);
            }}
            className="gap-1"
          >
            <ToggleGroupItem value="all" className="h-7 px-3 text-xs">
              Todos
            </ToggleGroupItem>
            <ToggleGroupItem value="30d" className="h-7 px-3 text-xs">
              30 dias
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Leads por país
              </CardTitle>
            </CardHeader>
            <CardContent>
              {total === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ainda sem dados de localização.
                </p>
              ) : (
                <RankingList rows={countryRows} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Leads por cidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              {total === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ainda sem dados de localização.
                </p>
              ) : (
                <RankingList rows={cityRows} />
              )}
            </CardContent>
          </Card>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground px-1">
          A localização é estimada por IP e só é registada para leads que aceitaram
          cookies. A cidade é aproximada — em tráfego móvel pode refletir a localização
          da operadora, não a do utilizador. O país é fiável.
        </p>
      </div>
    </div>
  );
}
