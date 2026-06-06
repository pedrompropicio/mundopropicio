import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronRight } from "lucide-react";
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
import { MP_COMPANY_ID } from "../constants";
import type { EventRow, EventMarketingRow } from "../types";

const ACTIVE_ONLY_KEY = "crm.eventos.activeOnly";
const INACTIVE_STATUSES = new Set(["completed", "cancelled", "archived"]);

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type EventWithMk = EventRow & {
  marketing: Pick<EventMarketingRow, "status" | "updated_at"> | null;
};

export default function EventosList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-eventos-list", MP_COMPANY_ID],
    queryFn: async (): Promise<EventWithMk[]> => {
      const { data: events, error: eErr } = await (supabase as any)
        .from("events")
        .select("id, name, slug, status, date, company_id")
        .eq("company_id", MP_COMPANY_ID)
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

  const rows = useMemo(() => {
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Eventos — Marketing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Editar a face pública (landing) dos eventos. Os eventos são criados no módulo ERP.
        </p>
      </div>

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
              <SelectItem value="drafted">Rascunho</SelectItem>
              <SelectItem value="none">Sem marketing</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Estado marketing</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  A carregar…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-destructive">
                  Erro: {(error as Error).message}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sem eventos.
                </TableCell>
              </TableRow>
            )}
            {rows.map((e) => {
              const st = e.marketing?.status ?? "none";
              const badge =
                st === "published"
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                  : st === "drafted"
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                    : "bg-muted text-muted-foreground border-border";
              const label =
                st === "published" ? "Publicado" : st === "drafted" ? "Rascunho" : "Sem marketing";
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
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
    </div>
  );
}
