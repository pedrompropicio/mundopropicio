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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Download, FileArchive, Undo2, CheckCircle2, FileText, Pencil, Trash2 } from "lucide-react";
import { signedCompanyUrl, downloadFromCompanyBucket, removeFromCompanyBucket } from "@/lib/storage";

interface Row {
  id: string;
  storage_path: string;
  file_name: string;
  supplier_name: string | null;
  supplier_nif: string | null;
  invoice_date: string | null;
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

const effectiveDate = (r: Row) => r.invoice_date ?? r.created_at.slice(0, 10);
const monthKey = (r: Row) => effectiveDate(r).slice(0, 7);
const monthLabel = (k: string) => {
  const [y, m] = k.split("-");
  const names = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${names[Number(m) - 1]} ${y}`;
};

export function AccountantStandaloneInvoicesTab() {
  const { companyId } = useCompany();
  const { user, isAdmin, isAccountant } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [exporting, setExporting] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({ supplier_name: "", supplier_nif: "", invoice_date: "", total_amount: "", iva_amount: "", notes: "" });

  const canProcess = isAdmin || isAccountant;
  const canEdit = (r: Row) => isAdmin || r.created_by === user?.id;
  // Apagar: só enquanto "nova", por quem capturou ou admin/platform_admin.
  const canDelete = (r: Row) => r.status === "new" && (isAdmin || r.created_by === user?.id);

  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({
      supplier_name: r.supplier_name ?? "",
      supplier_nif: r.supplier_nif ?? "",
      invoice_date: r.invoice_date ?? "",
      total_amount: r.total_amount == null ? "" : String(r.total_amount),
      iva_amount: r.iva_amount == null ? "" : String(r.iva_amount),
      notes: r.notes ?? "",
    });
  };

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const num = (v: string) => {
        const n = Number(v.replace(",", "."));
        return v.trim() === "" || Number.isNaN(n) ? null : n;
      };
      const { error } = await (supabase as any)
        .from("standalone_invoices")
        .update({
          supplier_name: form.supplier_name.trim() || null,
          supplier_nif: form.supplier_nif.trim() || null,
          invoice_date: form.invoice_date || null,
          total_amount: num(form.total_amount),
          iva_amount: num(form.iva_amount),
          notes: form.notes.trim() || null,
        })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["standalone-invoices"] });
      toast({ title: "Fatura atualizada" });
    },
    onError: (e: any) => toast({ title: "Falhou", description: e.message, variant: "destructive" }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["standalone-invoices", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("standalone_invoices")
        .select("*")
        .eq("company_id", companyId)
        .order("invoice_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["standalone-invoice-profiles", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("id, full_name, email");
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => (map[p.id] = p.full_name || p.email || "—"));
      return map;
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
      toast({ title: "Fatura apagada" });
    },
    onError: (e: any) =>
      toast({ title: "Não foi possível apagar", description: e.message, variant: "destructive" }),
  });

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    (data ?? []).forEach((r) => {
      const k = monthKey(r);
      map.set(k, [...(map.get(k) ?? []), r]);
    });
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [data]);

  const openDoc = async (r: Row) => {
    const { data, error } = await signedCompanyUrl("standalone-invoices", r.storage_path, 3600);
    if (error || !data?.signedUrl) {
      toast({ title: "Não foi possível abrir", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const exportMonth = async (key: string, rows: Row[]) => {
    setExporting(key);
    try {
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
          Total: r.total_amount ?? "",
          IVA: r.iva_amount ?? "",
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

  if (isLoading) {
    return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>;
  }

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">Sem faturas avulsas registadas.</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Faturas no NIF da empresa pagas com recursos próprios da diretoria — apenas para efeitos contabilísticos.
        Não têm transação associada.
      </p>
      {groups.map(([key, rows]) => (
        <section key={key} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">
              {monthLabel(key)} <span className="text-muted-foreground text-sm">({rows.length})</span>
            </h3>
            <Button size="sm" variant="outline" onClick={() => exportMonth(key, rows)} disabled={exporting === key}>
              {exporting === key ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileArchive className="h-4 w-4 mr-1.5" />}
              Exportar mês
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
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
                      {effectiveDate(r)} · NIF {r.supplier_nif ?? "—"} · {fmtEUR(r.total_amount)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      Capturado por {profiles?.[r.created_by ?? ""] ?? "—"}
                      {r.notes ? ` · ${r.notes}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button size="sm" variant="ghost" onClick={() => openDoc(r)}>
                        <Download className="h-3.5 w-3.5 mr-1" /> Documento
                      </Button>
                      {canEdit(r) && (
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                        </Button>
                      )}
                      {canProcess && (
                        <Button
                          size="sm"
                          variant="ghost"
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
                          className="text-destructive hover:text-destructive"
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
              <div className="space-y-1">
                <Label htmlFor="ed-total">Total (€)</Label>
                <Input id="ed-total" inputMode="decimal" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ed-iva">IVA (€)</Label>
                <Input id="ed-iva" inputMode="decimal" value={form.iva_amount} onChange={(e) => setForm({ ...form, iva_amount: e.target.value })} />
              </div>
            </div>
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
