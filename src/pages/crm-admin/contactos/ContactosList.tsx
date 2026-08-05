import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Mail, MessageCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { useCompany } from "@/hooks/useCompany";
import ContactDetailsSheet from "./ContactDetailsSheet";
import { relativeFromNow } from "../lib/relativeTime";

type TriState = "all" | "yes" | "no";

export default function ContactosList() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const [search, setSearch] = useState("");
  const [emailConsent, setEmailConsent] = useState<TriState>("all");
  const [waConsent, setWaConsent] = useState<TriState>("all");
  const [activeFilter, setActiveFilter] = useState<TriState>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-contactos-list", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contacts")
        .select("id, name, email, phone_e164, source, consent_email, consent_whatsapp, is_active, last_activity_at")
        .eq("company_id", companyId)
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

  useEffect(() => {
    setChecked(new Set());
  }, [search, emailConsent, waConsent, activeFilter, sourceFilter]);

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

  const eraseMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = { ok: 0, failed: 0, leads: 0, captures: 0, errors: [] as string[] };
      for (const id of ids) {
        const { data: r, error } = await (supabase as any).rpc("crm_rgpd_erase_contact", {
          p_contact_id: id,
        });
        if (error) {
          results.failed += 1;
          results.errors.push(`${id.slice(0, 8)}: ${error.message ?? error.code ?? "erro"}`);
        } else {
          results.ok += 1;
          results.leads += (r?.leads_deleted ?? 0);
          results.captures += (r?.lead_captures_deleted ?? 0);
        }
      }
      return results;
    },
    onSuccess: (r) => {
      if (r.ok > 0) {
        toast.success(
          `${r.ok} contacto(s) apagado(s) (RGPD). ${r.leads} lead(s) e ${r.captures} captura(s) removidas.`,
        );
      }
      if (r.failed > 0) {
        toast.error(`${r.failed} falha(s): ${r.errors.slice(0, 3).join(" · ")}`);
      }
      qc.invalidateQueries({ queryKey: ["crm-contactos-list"] });
      qc.invalidateQueries({ queryKey: ["crm-leads-list"] });
      setChecked(new Set());
      setDeleteOpen(false);
      setConfirmText("");
    },
    onError: (e: any) => toast.error(`Falha total: ${e?.message ?? e}`),
  });

  const checkedCount = checked.size;
  const confirmPhrase = "APAGAR";
  const confirmMatches = confirmText.trim().toUpperCase() === confirmPhrase;

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
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked || (someChecked ? "indeterminate" : false)}
                  onCheckedChange={toggleAll}
                  aria-label="Selecionar todos"
                />
              </TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Consents</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Última actividade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">A carregar…</TableCell></TableRow>}
            {error && <TableRow><TableCell colSpan={6} className="text-center text-destructive">{(error as Error).message}</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem contactos.</TableCell></TableRow>
            )}
            {rows.map((c: any) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c.id)}>
                <TableCell onClick={(e) => e.stopPropagation()} className="w-10">
                  <Checkbox
                    checked={checked.has(c.id)}
                    onCheckedChange={() => toggleOne(c.id)}
                    aria-label={`Selecionar contacto ${c.email ?? c.id}`}
                  />
                </TableCell>
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

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{rows.length} contactos</p>
        {checkedCount > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => { setConfirmText(""); setDeleteOpen(true); }}
            disabled={eraseMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Apagar definitivamente (RGPD) ({checkedCount})
          </Button>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar {checkedCount} contacto(s) — RGPD Art. 17?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>Acção irreversível.</strong> Para cada contacto seleccionado:
              <ul className="list-disc list-inside mt-2 space-y-0.5 text-xs">
                <li>O contacto é removido da tabela <code className="font-mono">contacts</code>;</li>
                <li>TODAS as <code className="font-mono">leads</code> que o referenciam são apagadas;</li>
                <li>TODAS as <code className="font-mono">lead_capture</code> com o mesmo email são apagadas;</li>
                <li>Não há undo, não há cópia, não há reversão.</li>
              </ul>
              <br />
              Para confirmar, escreve <strong className="font-mono">{confirmPhrase}</strong> abaixo:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="confirm-erase" className="text-xs">Confirmação</Label>
            <Input
              id="confirm-erase"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              placeholder={confirmPhrase}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eraseMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmMatches) eraseMutation.mutate(Array.from(checked));
              }}
              disabled={!confirmMatches || eraseMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {eraseMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Apagar (RGPD)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ContactDetailsSheet
        contactId={selected}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </div>
  );
}
