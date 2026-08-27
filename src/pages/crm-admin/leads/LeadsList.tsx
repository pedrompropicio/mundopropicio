import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Loader2, Mail, MessageCircle, MousePointerClick, Search, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import ContactDetailsSheet from "../contactos/ContactDetailsSheet";
import { relativeFromNow } from "../lib/relativeTime";

function fmtDate(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("pt-PT");
}

export default function LeadsList() {
  const [params, setParams] = useSearchParams();
  const contactFilter = params.get("contact");
  const tab = params.get("tab") === "trafego" ? "trafego" : "contactos";

  const qc = useQueryClient();
  const { companyId } = useCompany();

  // ---- Contactos (pessoas identificáveis) ----
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<string | null>(null);

  // ---- Eventos de tráfego (cliques anónimos) ----
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const setTab = (v: string) => {
    if (v === "trafego") params.set("tab", "trafego");
    else params.delete("tab");
    setParams(params, { replace: true });
  };

  const { data: events } = useQuery({
    queryKey: ["crm-traffic-events", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("events")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const eventName = (id?: string | null) =>
    (events ?? []).find((e: any) => e.id === id)?.name ?? null;

  const { data: contacts, isLoading: loadingContacts, error: contactsError } = useQuery({
    queryKey: ["crm-contactos-view", companyId, contactFilter],
    enabled: !!companyId,
    queryFn: async () => {
      let q = (supabase as any)
        .from("crm_contactos")
        .select("*")
        .eq("company_id", companyId)
        .order("last_contact_at", { ascending: false, nullsFirst: false })
        .limit(2000);
      if (contactFilter) q = q.eq("contact_id", contactFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: traffic, isLoading: loadingTraffic, error: trafficError } = useQuery({
    queryKey: ["crm-eventos-trafego", companyId, eventFilter, fromDate, toDate],
    enabled: !!companyId,
    queryFn: async () => {
      let q = (supabase as any)
        .from("crm_eventos_trafego")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1000);
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

  const { data: contactsCount } = useQuery({
    queryKey: ["crm-contactos-count", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("crm_contactos")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: trafficCount } = useQuery({
    queryKey: ["crm-trafego-count", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("crm_eventos_trafego")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const contactRows = useMemo(() => {
    if (!search) return contacts ?? [];
    const s = search.toLowerCase();
    return (contacts ?? []).filter((c: any) =>
      c.name?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.phone_e164?.toLowerCase().includes(s),
    );
  }, [contacts, search]);

  const clearContactFilter = () => {
    params.delete("contact");
    setParams(params, { replace: true });
  };

  useEffect(() => {
    setChecked(new Set());
  }, [fromDate, toDate, eventFilter]);

  const rows = traffic ?? [];
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
      const next = new Set(prev);
      if (allChecked) rows.forEach((r: any) => next.delete(r.id));
      else rows.forEach((r: any) => next.add(r.id));
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
      toast.success(`${n} evento(s) de tráfego apagado(s) definitivamente.`);
      qc.invalidateQueries({ queryKey: ["crm-eventos-trafego"] });
      qc.invalidateQueries({ queryKey: ["crm-trafego-count"] });
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
        <h1 className="text-2xl font-bold text-foreground">Contactos &amp; tráfego</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pessoas identificáveis captadas pelo portal e, em separado, os eventos anónimos
          de tráfego para a bilheteira. Os dois números nunca se somam.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-emerald-500/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Contactos
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <Users className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {contactsCount === undefined ? "—" : contactsCount.toLocaleString("pt-PT")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Pessoas com email e/ou telefone — base real de contacto.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Eventos de tráfego
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-muted-foreground">
              {trafficCount === undefined ? "—" : trafficCount.toLocaleString("pt-PT")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Métrica de tráfego. Registos anónimos — não são pessoas contactáveis.
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="contactos">Contactos</TabsTrigger>
          <TabsTrigger value="trafego">Eventos de tráfego</TabsTrigger>
        </TabsList>

        <TabsContent value="contactos" className="space-y-4">
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
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pesquisar nome, email ou telefone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </Card>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Contactos</TableHead>
                  <TableHead>Consentimentos</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Interesse</TableHead>
                  <TableHead>Primeiro</TableHead>
                  <TableHead>Último</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingContacts && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">A carregar…</TableCell></TableRow>
                )}
                {contactsError && (
                  <TableRow><TableCell colSpan={7} className="text-center text-destructive">{(contactsError as Error).message}</TableCell></TableRow>
                )}
                {!loadingContacts && contactRows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sem contactos.</TableCell></TableRow>
                )}
                {contactRows.map((c: any) => (
                  <TableRow
                    key={c.contact_id}
                    className="cursor-pointer"
                    onClick={() => setSelectedContact(c.contact_id)}
                  >
                    <TableCell className="font-medium text-sm">
                      {c.name ?? c.email ?? c.phone_e164 ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{c.email ?? "—"}</div>
                      <div>{c.phone_e164 ?? ""}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {c.consent_email && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Mail className="h-3 w-3" /> Email
                          </Badge>
                        )}
                        {c.consent_whatsapp && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <MessageCircle className="h-3 w-3" /> WhatsApp
                          </Badge>
                        )}
                        {!c.consent_email && !c.consent_whatsapp && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.source ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {eventName(c.last_event_id) ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(c.first_contact_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{relativeFromNow(c.last_contact_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <p className="text-xs text-muted-foreground">{contactRows.length} contactos listados</p>
        </TabsContent>

        <TabsContent value="trafego" className="space-y-4">
          <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Registos <strong>anónimos</strong> de encaminhamento do portal para a bilheteira.
              Servem para medição de tráfego e para conversões offline do Google.
              <strong> Não são pessoas contactáveis</strong> — não têm email, telefone nem
              contacto associado, e nunca são somados aos contactos.
            </p>
          </div>

          <Card className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger><SelectValue placeholder="Evento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Evento: todos</SelectItem>
                  {(events ?? []).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
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
                  <TableHead>Evento</TableHead>
                  <TableHead>Origem / UTM</TableHead>
                  <TableHead>Campanha</TableHead>
                  <TableHead>País / região</TableHead>
                  <TableHead>CAPI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingTraffic && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">A carregar…</TableCell></TableRow>
                )}
                {trafficError && (
                  <TableRow><TableCell colSpan={7} className="text-center text-destructive">{(trafficError as Error).message}</TableCell></TableRow>
                )}
                {!loadingTraffic && rows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sem eventos de tráfego.</TableCell></TableRow>
                )}
                {rows.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="w-10">
                      <Checkbox
                        checked={checked.has(t.id)}
                        onCheckedChange={() => toggleOne(t.id)}
                        aria-label={`Selecionar evento de tráfego ${t.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{relativeFromNow(t.created_at)}</TableCell>
                    <TableCell className="text-sm">
                      {eventName(t.event_id) ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.utm_source ?? t.source ?? "—"}
                      {t.utm_medium ? ` / ${t.utm_medium}` : ""}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.utm_campaign ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.geo_country ?? "—"}{t.geo_region ? ` · ${t.geo_region}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {t.capi_status ?? "—"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{rows.length} eventos de tráfego listados</p>
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
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar {checkedCount} evento(s) de tráfego?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acção é <strong>irreversível</strong>. As linhas seleccionadas serão
              removidas para sempre e deixam de contar para medição e conversões offline.
              Contactos não são tocados aqui — para erasure completo RGPD usa a lista de
              contactos.
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

      <ContactDetailsSheet
        contactId={selectedContact}
        open={!!selectedContact}
        onOpenChange={(v) => !v && setSelectedContact(null)}
      />
    </div>
  );
}
