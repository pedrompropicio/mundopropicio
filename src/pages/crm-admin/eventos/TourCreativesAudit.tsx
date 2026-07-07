import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScanSearch, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  eventId: string;
  parentEventId: string | null;
  eventType: string | null;
}

interface CityRow {
  id: string;
  name: string;
  date: string | null;
  poster_image_url: string | null;
  hero_image_url: string | null;
}

interface MarketingRow {
  event_id: string;
  hero_image_url: string | null;
  poster_vertical_url: string | null;
  og_image_url: string | null;
  hero_video_url: string | null;
}

interface Conflict {
  field: string;
  url: string;
  cities: { id: string; name: string; date: string | null }[];
}

const FIELD_LABELS: Record<string, string> = {
  "event.poster_image_url": "Evento · Poster",
  "event.hero_image_url": "Evento · Hero",
  "marketing.hero_image_url": "Marketing · Hero",
  "marketing.poster_vertical_url": "Marketing · Poster vertical",
  "marketing.og_image_url": "Marketing · OG image",
  "marketing.hero_video_url": "Marketing · Vídeo hero",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function truncate(s: string, n = 60) {
  if (s.length <= n) return s;
  return `${s.slice(0, n / 2)}…${s.slice(-n / 2)}`;
}

export function TourCreativesAudit({ eventId, parentEventId, eventType }: Props) {
  const [open, setOpen] = useState(false);
  const isTour = !!parentEventId || eventType === "multi_day";
  const tourParentId = parentEventId ?? eventId;

  const query = useQuery({
    queryKey: ["crm-tour-creatives-audit", tourParentId],
    enabled: open && isTour,
    queryFn: async () => {
      const { data: cities, error: e1 } = await (supabase as any)
        .from("events")
        .select("id, name, date, poster_image_url, hero_image_url")
        .eq("parent_event_id", tourParentId)
        .order("date");
      if (e1) throw e1;
      const rows: CityRow[] = cities ?? [];
      const ids = rows.map((r) => r.id);
      let mk: MarketingRow[] = [];
      if (ids.length > 0) {
        const { data: mkData, error: e2 } = await (supabase as any)
          .from("event_marketing")
          .select("event_id, hero_image_url, poster_vertical_url, og_image_url, hero_video_url")
          .in("event_id", ids);
        if (e2) throw e2;
        mk = mkData ?? [];
      }
      return { cities: rows, marketing: mk };
    },
  });

  const conflicts = useMemo<Conflict[]>(() => {
    if (!query.data) return [];
    const { cities, marketing } = query.data;
    const cityById = new Map(cities.map((c) => [c.id, c]));
    const mkById = new Map(marketing.map((m) => [m.event_id, m]));

    // key: field|url → set of cityIds
    const buckets = new Map<string, { field: string; url: string; ids: Set<string> }>();
    const push = (field: string, url: string | null | undefined, cityId: string) => {
      if (!url) return;
      const k = `${field}|${url}`;
      if (!buckets.has(k)) buckets.set(k, { field, url, ids: new Set() });
      buckets.get(k)!.ids.add(cityId);
    };

    for (const c of cities) {
      push("event.poster_image_url", c.poster_image_url, c.id);
      push("event.hero_image_url", c.hero_image_url, c.id);
      const m = mkById.get(c.id);
      if (m) {
        push("marketing.hero_image_url", m.hero_image_url, c.id);
        push("marketing.poster_vertical_url", m.poster_vertical_url, c.id);
        push("marketing.og_image_url", m.og_image_url, c.id);
        push("marketing.hero_video_url", m.hero_video_url, c.id);
      }
    }

    const out: Conflict[] = [];
    for (const b of buckets.values()) {
      if (b.ids.size < 2) continue;
      const cs = Array.from(b.ids).map((id) => cityById.get(id)!).filter(Boolean);
      const dates = new Set(cs.map((c) => c.date ?? ""));
      if (dates.size > 1) {
        out.push({
          field: b.field,
          url: b.url,
          cities: cs.map((c) => ({ id: c.id, name: c.name, date: c.date })),
        });
      }
    }
    return out;
  }, [query.data]);

  if (!isTour) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <ScanSearch className="mr-1 h-4 w-4" /> Conferir criativos do tour
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conferir criativos do tour</DialogTitle>
          <DialogDescription>
            Deteta criativos partilhados por várias cidades com datas diferentes — possível arte com data errada. Só leitura.
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> A analisar…
          </div>
        ) : query.error ? (
          <p className="text-sm text-destructive">Erro: {(query.error as any).message}</p>
        ) : conflicts.length === 0 ? (
          <div className="flex items-center gap-2 rounded border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            Sem conflitos de criativos detetados neste tour.
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {conflicts.map((c, i) => (
              <div key={i} className="rounded border border-yellow-500/40 bg-yellow-500/5 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{FIELD_LABELS[c.field] ?? c.field}</p>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs text-muted-foreground hover:underline"
                      title={c.url}
                    >
                      {truncate(c.url, 80)}
                    </a>
                    <ul className="mt-1 list-disc pl-5">
                      {c.cities.map((ci) => (
                        <li key={ci.id}>
                          {ci.name} <span className="text-muted-foreground">({fmtDate(ci.date)})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
