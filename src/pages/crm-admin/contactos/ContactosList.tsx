import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Mail, MessageCircle } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { MP_COMPANY_ID } from "../constants";
import ContactDetailsSheet from "./ContactDetailsSheet";
import { relativeFromNow } from "../lib/relativeTime";

type TriState = "all" | "yes" | "no";

export default function ContactosList() {
  const [search, setSearch] = useState("");
  const [emailConsent, setEmailConsent] = useState<TriState>("all");
  const [waConsent, setWaConsent] = useState<TriState>("all");
  const [activeFilter, setActiveFilter] = useState<TriState>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-contactos-list", MP_COMPANY_ID],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contacts")
        .select("id, name, email, phone_e164, source, consent_email, consent_whatsapp, is_active, last_activity_at")
        .eq("company_id", MP_COMPANY_ID)
        .order("last_activity_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sources = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((c: any) => c.source && set.add(c.source));
    return Array.from(set).sort();
  }, [data]);

  const rows = useMemo(() => {
    return (data ?? []).filter((c: any) => {
      if (search) {
        const s = search.toLowerCase();
        const hit =
          c.email?.toLowerCase().includes(s) ||
          c.name?.toLowerCase().includes(s) ||
          c.phone_e164?.toLowerCase().includes(s);
        if (!hit) return false;
      }
      if (emailConsent !== "all" && c.consent_email !== (emailConsent === "yes")) return false;
      if (waConsent !== "all" && c.consent_whatsapp !== (waConsent === "yes")) return false;
      if (activeFilter !== "all" && c.is_active !== (activeFilter === "yes")) return false;
      if (sourceFilter !== "all" && (c.source ?? "") !== sourceFilter) return false;
      return true;
    });
  }, [data, search, emailConsent, waConsent, activeFilter, sourceFilter]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Contactos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lista unificada de contactos com consentimentos e histórico.
        </p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar email, nome ou telefone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={emailConsent} onValueChange={(v) => setEmailConsent(v as TriState)}>
            <SelectTrigger><SelectValue placeholder="Consent email" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Consent email: todos</SelectItem>
              <SelectItem value="yes">Sim</SelectItem>
              <SelectItem value="no">Não</SelectItem>
            </SelectContent>
          </Select>
          <Select value={waConsent} onValueChange={(v) => setWaConsent(v as TriState)}>
            <SelectTrigger><SelectValue placeholder="Consent WhatsApp" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Consent WA: todos</SelectItem>
              <SelectItem value="yes">Sim</SelectItem>
              <SelectItem value="no">Não</SelectItem>
            </SelectContent>
          </Select>
          <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as TriState)}>
            <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Estado: todos</SelectItem>
              <SelectItem value="yes">Activo</SelectItem>
              <SelectItem value="no">Inactivo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Source: todos</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contacto</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Consents</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Última actividade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">A carregar…</TableCell></TableRow>}
            {error && <TableRow><TableCell colSpan={5} className="text-center text-destructive">{(error as Error).message}</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sem contactos.</TableCell></TableRow>
            )}
            {rows.map((c: any) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c.id)}>
                <TableCell>
                  <div className="font-medium">{c.name ?? c.email ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.name && c.email ? c.email : ""}
                    {c.phone_e164 ? ` · ${c.phone_e164}` : ""}
                  </div>
                </TableCell>
                <TableCell>
                  {c.source ? <Badge variant="outline" className="text-xs">{c.source}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Mail className={`h-4 w-4 ${c.consent_email ? "text-emerald-600" : "text-muted-foreground/40"}`} />
                    <MessageCircle className={`h-4 w-4 ${c.consent_whatsapp ? "text-emerald-600" : "text-muted-foreground/40"}`} />
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={c.is_active ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-muted text-muted-foreground"}>
                    {c.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{relativeFromNow(c.last_activity_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <p className="text-xs text-muted-foreground">{rows.length} contactos</p>

      <ContactDetailsSheet
        contactId={selected}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </div>
  );
}
