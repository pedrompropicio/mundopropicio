import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronRight, Plus, Handshake, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompany } from "@/hooks/useCompany";
import type { EventRow, EventMarketingRow } from "../types";

const ACTIVE_ONLY_KEY = "crm.eventos.activeOnly";
const INACTIVE_STATUSES = new Set(["completed", "cancelled", "archived"]);

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type EventWithMk = EventRow & {
  management_type: string | null;
  partner_name: string | null;
  marketing: Pick<EventMarketingRow, "status" | "updated_at"> | null;
};

type EndorsementRow = {
  event_id: string;
  partner_label: string | null;
  display_order: number;
  featured: boolean;
  event: { id: string; name: string; date: string | null; company_id: string } | null;
  company: { id: string; display_name: string | null; legal_name: string | null } | null;
};

export default function EventosList() {
  const { companyId } = useCompany();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Eventos — Portal MP</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Eventos próprios (MP gere) e endossos cross-company para o portal mundopropicio.com.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate("/crm/eventos/novo")}>
            <Plus className="h-4 w-4" /> Novo evento próprio
          </Button>
          <Button variant="outline" onClick={() => navigate("/crm/eventos/endossar")}>
            <Handshake className="h-4 w-4" /> Endossar evento
          </Button>
        </div>
      </div>

      <Tabs defaultValue="proprios">
        <TabsList>
          <TabsTrigger value="proprios">Próprios</TabsTrigger>
          <TabsTrigger value="endossados">Endossados</TabsTrigger>
        </TabsList>
        <TabsContent value="proprios" className="space-y-4">
          <PropriosTab />
        </TabsContent>
        <TabsContent value="endossados" className="space-y-4">
          <EndossadosTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tab Próprios ──────────────────────────────────────────────────────

function PropriosTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeOnly, setActiveOnly] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(ACTIVE_ONLY_KEY);
    return v === null ? true : v === "true";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_ONLY_KEY, String(activeOnly));
    } catch {}
  }, [activeOnly]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-eventos-list", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<EventWithMk[]> => {
      const { data: events, error: eErr } = await (supabase as any)
        .from("events")
        .select("id, name, slug, status, date, company_id, management_type, partner_name")
        .eq("company_id", companyId)
        .order("date", { ascending: false, nullsFirst: false })
        .limit(500);
      if (eErr) throw eErr;
      const ids = (events ?? []).map((e: any) => e.id);
      let mkMap = new Map<string, { status: string; updated_at: string }>();
      if (ids.length > 0) {
        const { data: mk, error: mkErr } = await (supabase as any)
          .from("event_marketing")
          .select("event_id, status, updated_at")
          .in("event_id", ids);
        if (mkErr) throw mkErr;
        mkMap = new Map((mk ?? []).map((r: any) => [r.event_id, r]));
      }
      return (events ?? []).map((e: any) => ({
        ...e,
        marketing: mkMap.get(e.id)
          ? { status: mkMap.get(e.id)!.status as any, updated_at: mkMap.get(e.id)!.updated_at }
          : null,
      }));
    },
  });

  const today = todayISO();

  const baseFiltered = useMemo(() => {
    const list = data ?? [];
    return list.filter((e) => {
      if (search) {
        const s = search.toLowerCase();
        if (
          !e.name?.toLowerCase().includes(s) &&
          !(e.slug ?? "").toLowerCase().includes(s)
        )
          return false;
      }
      if (statusFilter !== "all") {
        const st = e.marketing?.status ?? "none";
        if (st !== statusFilter) return false;
      }
      return true;
    });
  }, [data, search, statusFilter]);

  const rows = useMemo(() => {
    if (!activeOnly) return baseFiltered;
    return baseFiltered.filter((e) => {
      if (e.status && INACTIVE_STATUSES.has(String(e.status).toLowerCase())) return false;
      if (e.date && e.date < today) return false;
      return true;
    });
  }, [baseFiltered, activeOnly, today]);

  return (
    <>
      <Card className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por nome ou slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              <SelectItem value="published">Publicado</SelectItem>
              <SelectItem value="draft">Rascunho</SelectItem>
              <SelectItem value="none">Sem marketing</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 sm:pl-2">
            <Switch
              id="crm-eventos-active-only"
              checked={activeOnly}
              onCheckedChange={setActiveOnly}
              className="data-[state=checked]:bg-emerald-500"
            />
            <Label
              htmlFor="crm-eventos-active-only"
              className="text-sm cursor-pointer whitespace-nowrap"
            >
              Apenas eventos activos
            </Label>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {activeOnly
            ? `${rows.length} de ${baseFiltered.length} eventos`
            : `${baseFiltered.length} eventos`}
        </p>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Estado marketing</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  A carregar…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-destructive">
                  Erro: {(error as Error).message}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Sem eventos.
                </TableCell>
              </TableRow>
            )}
            {rows.map((e) => {
              const st = e.marketing?.status ?? "none";
              const badge =
                st === "published"
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                  : st === "draft"
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                    : "bg-muted text-muted-foreground border-border";
              const label =
                st === "published" ? "Publicado" : st === "draft" ? "Rascunho" : "Sem marketing";
              const isPartner = e.management_type === "partner_managed";
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>
                    {isPartner ? (
                      <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">
                        Parceria{e.partner_name ? `: ${e.partner_name}` : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Própria
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {e.slug ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {e.date ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badge}`}
                    >
                      {label}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/crm/eventos/${e.id}`}>
                        Editar marketing
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

// ─── Tab Endossados ────────────────────────────────────────────────────

function EndossadosTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-eventos-endorsements", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<EndorsementRow[]> => {
      const { data: endorsements, error: eErr } = await (supabase as any)
        .from("event_portal_endorsements")
        .select("event_id, partner_label, display_order, featured")
        .eq("portal_company_id", companyId)
        .order("display_order", { ascending: true });
      if (eErr) throw eErr;
      const ids = (endorsements ?? []).map((r: any) => r.event_id);
      if (ids.length === 0) return [];

      const { data: events } = await (supabase as any)
        .from("events")
        .select("id, name, date, company_id")
        .in("id", ids);
      const eventMap = new Map<string, any>((events ?? []).map((e: any) => [e.id, e]));

      const companyIds = Array.from(
        new Set((events ?? []).map((e: any) => e.company_id).filter(Boolean))
      );
      let companyMap = new Map<string, any>();
      if (companyIds.length > 0) {
        const { data: companies } = await (supabase as any)
          .from("companies")
          .select("id, display_name, legal_name")
          .in("id", companyIds);
        companyMap = new Map((companies ?? []).map((c: any) => [c.id, c]));
      }

      return (endorsements ?? []).map((r: any) => {
        const ev = eventMap.get(r.event_id) ?? null;
        return {
          ...r,
          event: ev,
          company: ev ? companyMap.get(ev.company_id) ?? null : null,
        };
      }).sort((a: EndorsementRow, b: EndorsementRow) => {
        if (a.display_order !== b.display_order) return a.display_order - b.display_order;
        const da = a.event?.date ?? "";
        const db = b.event?.date ?? "";
        return db.localeCompare(da);
      });
    },
  });

  return (
    <>
      <Card className="p-4">
        <p className="text-xs text-muted-foreground">
          {isLoading ? "A carregar…" : `${data?.length ?? 0} eventos endossados`}
        </p>
      </Card>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead>Empresa dona</TableHead>
              <TableHead>Etiqueta</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Ordem</TableHead>
              <TableHead>Destaque</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-destructive">
                  Erro: {(error as Error).message}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Sem eventos endossados ainda.
                </TableCell>
              </TableRow>
            )}
            {(data ?? []).map((r) => (
              <TableRow key={r.event_id}>
                <TableCell className="font-medium">{r.event?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {r.company?.display_name ?? r.company?.legal_name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {r.partner_label ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {r.event?.date ?? "—"}
                </TableCell>
                <TableCell className="text-xs">{r.display_order}</TableCell>
                <TableCell>
                  {r.featured ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">
                      <Star className="h-3 w-3" /> Destaque
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/crm/eventos/endorsement/${r.event_id}`}>
                      Editar
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
