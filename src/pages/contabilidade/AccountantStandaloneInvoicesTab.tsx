import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Download, FileArchive, Undo2, CheckCircle2, FileText, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { signedCompanyUrl, downloadFromCompanyBucket, removeFromCompanyBucket } from "@/lib/storage";
import { calculateStandaloneEur, isStandaloneInvoiceDuplicateError, parseStandaloneAmount, STANDALONE_INVOICE_CURRENCIES, type StandaloneInvoiceCurrency } from "@/lib/standalone-invoices";

interface Row {
  id: string;
  storage_path: string;
  file_name: string;
  supplier_name: string | null;
  supplier_nif: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: StandaloneInvoiceCurrency;
  original_amount: number | null;
  fx_rate: number | null;
  fx_rate_source: string | null;
  paid_by_partner_id: string | null;
  total_amount: number | null;
  iva_amount: number | null;
  notes: string | null;
  status: string;
  created_at: string;
  created_by: string | null;
  processed_at: string | null;
}

const fmtEUR = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);

/** Chave do grupo "sem data da fatura" — nunca misturada com um mês real. */
const NO_DATE = "sem-data";
const ALL = "todos";
const ALL_LIMIT = 1000;

const effectiveDate = (r: Row) => r.invoice_date ?? r.created_at.slice(0, 10);
/** Grupo: mês da invoice_date; sem invoice_date → grupo próprio. */
const groupKey = (r: Row) => (r.invoice_date ? r.invoice_date.slice(0, 7) : NO_DATE);
const monthLabel = (k: string) => {
  if (k === NO_DATE) return "Sem data da fatura";
  const [y, m] = k.split("-");
  const names = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${names[Number(m) - 1]} ${y}`;
};
/** Intervalo [início, fimExclusivo) de um mês "YYYY-MM". */
const monthRange = (k: string) => {
  const [y, m] = k.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start: `${k}-01`, end: next };
};


export function AccountantStandaloneInvoicesTab() {
  const { companyId } = useCompany();
  const { user, isAdmin, isAccountant } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [exporting, setExporting] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({ supplier_name: "", supplier_nif: "", invoice_number: "", invoice_date: "", currency: "EUR" as StandaloneInvoiceCurrency, original_amount: "", fx_rate: "", fx_rate_source: "", paid_by_partner_id: "none", total_amount: "", iva_amount: "", notes: "" });

  const canProcess = isAdmin || isAccountant;
  const canEdit = (r: Row) => isAdmin || r.created_by === user?.id;
  // Apagar: só enquanto "nova", por quem capturou ou admin/platform_admin.
  const canDelete = (r: Row) => r.status === "new" && (isAdmin || r.created_by === user?.id);

  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({
      supplier_name: r.supplier_name ?? "",
      supplier_nif: r.supplier_nif ?? "",
      invoice_number: r.invoice_number ?? "",
      invoice_date: r.invoice_date ?? "",
      currency: r.currency ?? "EUR",
      original_amount: r.original_amount == null ? "" : String(r.original_amount),
      fx_rate: r.fx_rate == null ? "" : String(r.fx_rate),
      fx_rate_source: r.fx_rate_source ?? "",
      paid_by_partner_id: r.paid_by_partner_id ?? "none",
      total_amount: r.total_amount == null ? "" : String(r.total_amount),
      iva_amount: r.iva_amount == null ? "" : String(r.iva_amount),
      notes: r.notes ?? "",
    });
  };

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      if (form.supplier_nif.trim() && form.invoice_number.trim()) {
        const { data: duplicate, error: duplicateError } = await (supabase as any).from("standalone_invoices")
          .select("id").eq("company_id", companyId).eq("supplier_nif", form.supplier_nif.trim())
          .eq("invoice_number", form.invoice_number.trim()).neq("id", editing.id).maybeSingle();
        if (duplicateError) throw duplicateError;
        if (duplicate) throw Object.assign(new Error("Já existe uma fatura deste fornecedor com este número."), { code: "DUPLICATE_INVOICE" });
      }
      const { error } = await (supabase as any)
        .from("standalone_invoices")
        .update({
          supplier_name: form.supplier_name.trim() || null,
          supplier_nif: form.supplier_nif.trim() || null,
          invoice_number: form.invoice_number.trim() || null,
          invoice_date: form.invoice_date || null,
          currency: form.currency,
          original_amount: form.currency === "EUR" ? null : parseStandaloneAmount(form.original_amount),
          fx_rate: form.currency === "EUR" ? null : parseStandaloneAmount(form.fx_rate),
          fx_rate_source: form.currency === "EUR" ? null : form.fx_rate_source.trim() || null,
          paid_by_partner_id: form.paid_by_partner_id === "none" ? null : form.paid_by_partner_id,
          total_amount: parseStandaloneAmount(form.total_amount),
          iva_amount: parseStandaloneAmount(form.iva_amount),
          notes: form.notes.trim() || null,
        })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["standalone-invoices"] });
      qc.invalidateQueries({ queryKey: ["standalone-invoice-months"] });
      toast({ title: "Fatura atualizada" });
    },
    onError: (e: any) => toast({ title: e?.code === "DUPLICATE_INVOICE" || isStandaloneInvoiceDuplicateError(e) ? "Fatura duplicada" : "Falhou", description: e?.code === "DUPLICATE_INVOICE" || isStandaloneInvoiceDuplicateError(e) ? "Já existe uma fatura deste fornecedor com este número." : e.message, variant: "destructive" }),
  });

  /**
   * Lista de meses disponíveis — consulta leve (só datas), independente do
   * limite de linhas da lista, para o seletor nunca perder meses antigos.
   */
  const { data: available } = useQuery({
    queryKey: ["standalone-invoice-months", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("standalone_invoices")
        .select("invoice_date")
        .eq("company_id", companyId);
      if (error) throw error;
      const months = new Set<string>();
      let hasNoDate = false;
      (data ?? []).forEach((r: { invoice_date: string | null }) => {
        if (r.invoice_date) months.add(r.invoice_date.slice(0, 7));
        else hasNoDate = true;
      });
      return { months: [...months].sort().reverse(), hasNoDate };
    },
  });

  const [selection, setSelection] = useState<string | null>(null);
  // Por defeito: mês mais recente COM faturas (não o mês do calendário).
  const selected =
    selection ?? available?.months[0] ?? (available?.hasNoDate ? NO_DATE : ALL);

  const { data, isLoading } = useQuery({
    queryKey: ["standalone-invoices", companyId, selected],
    enabled: !!companyId && !!available,
    queryFn: async () => {
      let q = (supabase as any)
        .from("standalone_invoices")
        .select("*")
        .eq("company_id", companyId);
      if (selected === NO_DATE) {
        q = q.is("invoice_date", null);
      } else if (selected !== ALL) {
        const { start, end } = monthRange(selected);
        q = q.gte("invoice_date", start).lt("invoice_date", end);
      } else {
        q = q.limit(ALL_LIMIT);
      }
      const { data, error } = await q
        .order("invoice_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const hitLimit = selected === ALL && (data?.length ?? 0) >= ALL_LIMIT;


  const { data: profilesData } = useQuery({
    queryKey: ["standalone-invoice-profiles", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: roles, error: roleError } = await supabase.from("user_roles").select("user_id").eq("company_id", companyId ?? "");
      if (roleError) throw roleError;
      const ids = [...new Set((roles ?? []).map((row) => row.user_id))];
      if (ids.length === 0) return { map: {} as Record<string, string>, users: [] as Array<{ id: string; full_name: string | null; email: string | null }> };
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => (map[p.id] = p.full_name || p.email || "—"));
      return { map, users: data ?? [] };
    },
  });

  const toggleProcessed = useMutation({
    mutationFn: async (r: Row) => {
      const processed = r.status !== "processed";
      const { error } = await (supabase as any)
        .from("standalone_invoices")
        .update({
          status: processed ? "processed" : "new",
          processed_at: processed ? new Date().toISOString() : null,
          processed_by: processed ? user?.id ?? null : null,
        })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["standalone-invoices"] }),
    onError: (e: any) => toast({ title: "Falhou", description: e.message, variant: "destructive" }),
  });

  const removeInvoice = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await (supabase as any)
        .from("standalone_invoices")
        .delete()
        .eq("id", r.id)
        .eq("status", "new");
      if (error) throw error;
      const { error: storageError } = await removeFromCompanyBucket("standalone-invoices", [r.storage_path]);
      if (storageError) console.warn("[standalone-invoices] ficheiro não removido", storageError);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["standalone-invoices"] });
      qc.invalidateQueries({ queryKey: ["standalone-invoice-months"] });
      toast({ title: "Fatura apagada" });
    },
    onError: (e: any) =>
      toast({ title: "Não foi possível apagar", description: e.message, variant: "destructive" }),
  });

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    (data ?? []).forEach((r) => {
      const k = groupKey(r);
      map.set(k, [...(map.get(k) ?? []), r]);
    });
    // "Sem data da fatura" sempre no topo; restantes meses, mais recente primeiro.
    return [...map.entries()].sort((a, b) => {
      if (a[0] === NO_DATE) return -1;
      if (b[0] === NO_DATE) return 1;
      return a[0] < b[0] ? 1 : -1;
    });
  }, [data]);


  const openDoc = async (r: Row) => {
    const { data, error } = await signedCompanyUrl("standalone-invoices", r.storage_path, 3600);
    if (error || !data?.signedUrl) {
      toast({ title: "Não foi possível abrir", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  /**
   * Exporta o grupo inteiro a partir de consulta por intervalo de datas
   * (não apenas as linhas em memória). Formato do ZIP/Excel inalterado.
   */
  const exportMonth = async (key: string) => {
    setExporting(key);
    try {
      let q = (supabase as any)
        .from("standalone_invoices")
        .select("*")
        .eq("company_id", companyId);
      if (key === NO_DATE) {
        q = q.is("invoice_date", null);
      } else {
        const { start, end } = monthRange(key);
        q = q.gte("invoice_date", start).lt("invoice_date", end);
      }
      const { data: allRows, error } = await q
        .order("invoice_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (allRows ?? []) as Row[];
      const [{ default: JSZip }, XLSX] = await Promise.all([import("jszip"), import("xlsx")]);
      const zip = new JSZip();
      let i = 0;
      const sheetRows: any[] = [];
      for (const r of rows) {
        i += 1;

        const { data: blob } = await downloadFromCompanyBucket("standalone-invoices", r.storage_path);
        const ext = r.file_name.match(/\.[^.]+$/)?.[0] ?? ".jpg";
        const name = `${String(i).padStart(3, "0")}-${(r.supplier_name ?? "fatura").replace(/[^\w.-]+/g, "_")}${ext}`;
        if (blob) zip.file(name, blob);
        sheetRows.push({
          "Nº": i,
          Data: effectiveDate(r),
          Fornecedor: r.supplier_name ?? "",
          NIF: r.supplier_nif ?? "",
          "Nº fatura": r.invoice_number ?? "",
          Moeda: r.currency ?? "EUR",
          "Valor original": r.original_amount ?? "",
          Câmbio: r.fx_rate ?? "",
          "Fonte do câmbio": r.fx_rate_source ?? "",
          "Total (EUR)": r.total_amount ?? "",
          IVA: r.iva_amount ?? "",
          "Pago por": profilesData?.map[r.paid_by_partner_id ?? ""] ?? "",
          Nota: r.notes ?? "",
          Estado: r.status === "processed" ? "Processada" : "Nova",
          Ficheiro: name,
        });
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), "Faturas Avulsas");
      const xlsx = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      zip.file(`faturas-avulsas-${key}.xlsx`, xlsx);
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = `faturas-avulsas-${key}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Exportação falhou", description: e.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const hasAny = (available?.months.length ?? 0) > 0 || !!available?.hasNoDate;

  const periodSelector = hasAny ? (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground">Mês</Label>
      <Select value={selected} onValueChange={setSelection}>
        <SelectTrigger className="h-8 w-[200px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os meses</SelectItem>
          {available?.hasNoDate && <SelectItem value={NO_DATE}>Sem data da fatura</SelectItem>}
          {available?.months.map((m) => (
            <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ) : null;

  if (!available || isLoading) {
    return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>;
  }

  if (!hasAny) {
    return <p className="text-sm text-muted-foreground p-4">Sem faturas avulsas registadas.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground max-w-xl">
          Faturas no NIF da empresa pagas com recursos próprios da diretoria — apenas para efeitos contabilísticos.
          Não têm transação associada.
        </p>
        {periodSelector}
      </div>
      {hitLimit && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <span>
            Foram carregadas as primeiras {ALL_LIMIT} faturas — existem mais. Escolha um mês
            no seletor para ver e exportar tudo desse período.
          </span>
        </div>
      )}
      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Sem faturas neste período.</p>
      )}
      {groups.map(([key, rows]) => (
        <section key={key} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">
              {monthLabel(key)} <span className="text-muted-foreground text-sm">({rows.length})</span>
            </h3>
            <Button size="sm" variant="outline" onClick={() => exportMonth(key)} disabled={exporting === key}>

              {exporting === key ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileArchive className="h-4 w-4 mr-1.5" />}
              Exportar mês
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => openDoc(r)}
                    className="h-16 w-16 shrink-0 rounded-md bg-muted flex items-center justify-center"
                    aria-label={`Abrir documento ${r.file_name}`}
                  >
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </button>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{r.supplier_name ?? "Sem fornecedor"}</span>
                      <Badge variant={r.status === "processed" ? "secondary" : "default"}>
                        {r.status === "processed" ? "Processada" : "Nova"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                       {effectiveDate(r)} · NIF {r.supplier_nif ?? "—"} · Fatura {r.invoice_number ?? "—"} · {fmtEUR(r.total_amount)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                       {r.currency !== "EUR" && r.original_amount != null ? `${r.currency} ${r.original_amount.toFixed(2)} · ` : ""}
                       Pago por {profilesData?.map[r.paid_by_partner_id ?? ""] ?? "—"} · Capturado por {profilesData?.map[r.created_by ?? ""] ?? "—"}
                      {r.notes ? ` · ${r.notes}` : ""}
                    </p>
                    <div className="flex flex-wrap items-start gap-1.5 pt-1">
                      <Button size="sm" variant="ghost" className="shrink-0" onClick={() => openDoc(r)}>
                        <Download className="h-3.5 w-3.5 mr-1" /> Documento
                      </Button>
                      {canEdit(r) && (
                        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                        </Button>
                      )}
                      {canProcess && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0"
                          onClick={() => toggleProcessed.mutate(r)}
                          disabled={toggleProcessed.isPending}
                        >
                          {r.status === "processed" ? (
                            <><Undo2 className="h-3.5 w-3.5 mr-1" /> Reabrir</>
                          ) : (
                            <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Marcar processada</>
                          )}
                        </Button>
                      )}
                      {canDelete(r) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0 text-destructive hover:text-destructive"
                          disabled={removeInvoice.isPending}
                          onClick={() => {
                            if (window.confirm("Apagar esta fatura avulsa? O documento também é removido.")) {
                              removeInvoice.mutate(r);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Apagar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar fatura avulsa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="ed-supplier">Fornecedor</Label>
              <Input id="ed-supplier" value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ed-nif">NIF</Label>
                <Input id="ed-nif" inputMode="numeric" value={form.supplier_nif} onChange={(e) => setForm({ ...form, supplier_nif: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ed-date">Data</Label>
                <Input id="ed-date" type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="ed-number">Nº fatura</Label><Input id="ed-number" value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} /></div>
              <div className="space-y-1"><Label>Moeda</Label><Select value={form.currency} onValueChange={(value) => setForm({ ...form, currency: value as StandaloneInvoiceCurrency, ...(value === "EUR" ? { original_amount: "", fx_rate: "", fx_rate_source: "" } : {}) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STANDALONE_INVOICE_CURRENCIES.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {form.currency !== "EUR" && <div className="space-y-3 rounded-md border p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label htmlFor="ed-original">Valor original</Label><Input id="ed-original" inputMode="decimal" value={form.original_amount} onChange={(e) => setForm({ ...form, original_amount: e.target.value, total_amount: calculateStandaloneEur(e.target.value, form.fx_rate) })} /></div>
                <div className="space-y-1"><Label htmlFor="ed-fx">Câmbio para EUR</Label><Input id="ed-fx" inputMode="decimal" value={form.fx_rate} onChange={(e) => setForm({ ...form, fx_rate: e.target.value, total_amount: calculateStandaloneEur(form.original_amount, e.target.value) })} /></div>
              </div>
              <div className="space-y-1"><Label htmlFor="ed-fx-source">Fonte do câmbio</Label><Input id="ed-fx-source" value={form.fx_rate_source} onChange={(e) => setForm({ ...form, fx_rate_source: e.target.value })} /></div>
            </div>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ed-total">Total (EUR)</Label>
                <Input id="ed-total" inputMode="decimal" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ed-iva">IVA (€)</Label>
                <Input id="ed-iva" inputMode="decimal" value={form.iva_amount} onChange={(e) => setForm({ ...form, iva_amount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1"><Label>Pago por</Label><Select value={form.paid_by_partner_id} onValueChange={(value) => setForm({ ...form, paid_by_partner_id: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem indicação</SelectItem>{profilesData?.users.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.full_name || profile.email || "Utilizador"}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1">
              <Label htmlFor="ed-notes">Nota</Label>
              <Input id="ed-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
              {saveEdit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
