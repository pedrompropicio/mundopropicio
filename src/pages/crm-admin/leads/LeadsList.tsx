import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useCompany } from "@/hooks/useCompany";
import LeadDetailsSheet from "./LeadDetailsSheet";
import { relativeFromNow } from "../lib/relativeTime";

const KIND_COLORS: Record<string, string> = {
  lead_capture: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  click: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  redirect: "bg-amber-500/10 text-amber-700 border-amber-500/30",
};

export default function LeadsList() {
  const [params, setParams] = useSearchParams();
  const contactFilter = params.get("contact");

  const qc = useQueryClient();
  const { companyId } = useCompany();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const { data: events } = useQuery({
    queryKey: ["crm-leads-events", MP_COMPANY_ID],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("events")
        .select("id, name")
        .eq("company_id", MP_COMPANY_ID)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-leads-list", MP_COMPANY_ID, contactFilter, eventFilter, fromDate, toDate],
    queryFn: async () => {
      let q = (supabase as any)
        .from("leads")
        .select(`
          id, kind, source, utm_source, created_at, contact_id, event_id,
          contact:contacts(id, name, email),
          event:events(id, name)
        `)
        .eq("company_id", MP_COMPANY_ID)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (contactFilter) q = q.eq("contact_id", contactFilter);
      if (eventFilter !== "all") q = q.eq("event_id", eventFilter);
      if (fromDate) q = q.gte("created_at", new Date(fromDate).toISOString());
      if (toDate) {
        const d = new Date(toDate); d.setHours(23, 59, 59, 999);
        q = q.lte("created_at", d.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const kinds = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((l: any) => set.add(l.kind));
    return Array.from(set).sort();
  }, [data]);

  const rows = useMemo(() => {
    return (data ?? []).filter((l: any) => {
      if (kindFilter !== "all" && l.kind !== kindFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const hit =
          l.contact?.email?.toLowerCase().includes(s) ||
          l.contact?.name?.toLowerCase().includes(s);
        if (!hit) return false;
      }
      return true;
    });
  }, [data, search, kindFilter]);

  const clearContactFilter = () => {
    params.delete("contact");
    setParams(params, { replace: true });
  };

  useEffect(() => {
    setChecked(new Set());
  }, [contactFilter, fromDate, toDate, eventFilter]);

  const toggleOne = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allChecked = rows.length > 0 && rows.every((r: any) => checked.has(r.id));
  const someChecked = rows.some((r: any) => checked.has(r.id)) && !allChecked;
  const toggleAll = () =>
    setChecked((prev) => {
      if (allChecked) {
        const next = new Set(prev);
        rows.forEach((r: any) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      rows.forEach((r: any) => next.add(r.id));
      return next;
    });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return 0;
      const { error } = await (supabase as any).from("leads").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} lead(s) apagado(s) definitivamente.`);
      qc.invalidateQueries({ queryKey: ["crm-leads-list"] });
      setChecked(new Set());
      setDeleteOpen(false);
      setConfirmText("");
    },
    onError: (e: any) => toast.error(`Falha a apagar: ${e?.message ?? e}`),
  });

  const checkedCount = checked.size;
  const confirmPhrase = "APAGAR";
  const confirmMatches = confirmText.trim().toUpperCase() === confirmPhrase;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Leads</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Leads capturados via portal, com origem, evento e estado.
        </p>
      </div>

      {contactFilter && (
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
            Filtrado por contacto
          </Badge>
          <Button size="sm" variant="ghost" onClick={clearContactFilter}>
            <X className="h-3 w-3" /> Limpar
          </Button>
        </div>
      )}

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar email/nome do contacto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tipo: todos</SelectItem>
              {kinds.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger><SelectValue placeholder="Evento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Evento: todos</SelectItem>
              {(events ?? []).map((e: any) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2 lg:col-span-1">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked || (someChecked ? "indeterminate" : false)}
                  onCheckedChange={toggleAll}
                  aria-label="Selecionar todos"
                />
              </TableHead>
              <TableHead>Quando</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Origem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">A carregar…</TableCell></TableRow>}
            {error && <TableRow><TableCell colSpan={6} className="text-center text-destructive">{(error as Error).message}</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem leads.</TableCell></TableRow>
            )}
            {rows.map((l: any) => (
              <TableRow key={l.id} className="cursor-pointer" onClick={() => setSelected(l.id)}>
                <TableCell onClick={(e) => e.stopPropagation()} className="w-10">
                  <Checkbox
                    checked={checked.has(l.id)}
                    onCheckedChange={() => toggleOne(l.id)}
                    aria-label={`Selecionar lead ${l.id}`}
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{relativeFromNow(l.created_at)}</TableCell>
                <TableCell>
                  <Badge className={KIND_COLORS[l.kind] ?? "bg-muted text-muted-foreground"}>
                    {l.kind}
                  </Badge>
                </TableCell>
                <TableCell>
                  {l.contact ? (
                    <>
                      <div className="font-medium text-sm">{l.contact.name ?? l.contact.email ?? "—"}</div>
                      {l.contact.name && l.contact.email && (
                        <div className="text-xs text-muted-foreground">{l.contact.email}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground text-sm">Anónimo</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{l.event?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {l.utm_source ?? l.source ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{rows.length} leads</p>
        {checkedCount > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => { setConfirmText(""); setDeleteOpen(true); }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Apagar definitivamente ({checkedCount})
          </Button>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar {checkedCount} lead(s) definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acção é <strong>irreversível</strong>. As linhas seleccionadas serão
              removidas para sempre da tabela <code className="font-mono text-xs">leads</code>.
              Contactos e capturas (lead_capture) NÃO são tocados aqui — para erasure
              completo RGPD usa a lista de contactos.
              <br /><br />
              Para confirmar, escreve <strong className="font-mono">{confirmPhrase}</strong> abaixo:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="confirm-delete" className="text-xs">Confirmação</Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              placeholder={confirmPhrase}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmMatches) deleteMutation.mutate(Array.from(checked));
              }}
              disabled={!confirmMatches || deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Apagar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LeadDetailsSheet
        leadId={selected}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </div>
  );
}
