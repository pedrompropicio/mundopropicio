import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, CheckCircle, CreditCard, AlertTriangle, FileText, ExternalLink, Download } from "lucide-react";
import { SupplierBankDetails } from "@/components/SupplierBankDetails";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { format } from "date-fns";

interface Props {
  noteId: string;
  onBack: () => void;
}

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  approved: "Aprovada",
  paid: "Paga",
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-success/15 text-success",
  paid: "bg-primary/15 text-primary",
};

export function ReimbursementNoteDetail({ noteId, onBack }: Props) {
  const { isAdmin, isManager, user, role } = useAuth();
  const isEditor = role === "editor";
  const queryClient = useQueryClient();
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [showPayConfirm, setShowPayConfirm] = useState(false);

  const { data: note, isLoading: noteLoading } = useQuery({
    queryKey: ["reimbursement-note", noteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_notes")
        .select("*")
        .eq("id", noteId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["reimbursement-note-items", noteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_note_items")
        .select("*, transactions(*)")
        .eq("reimbursement_note_id", noteId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // Transactions with accounting docs info
  const transactionIds = items.map((i: any) => i.transaction_id);
  const { data: transactionDocs = [] } = useQuery({
    queryKey: ["reimbursement-item-docs", transactionIds],
    queryFn: async () => {
      if (transactionIds.length === 0) return [];
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("transaction_id, is_accounting")
        .in("transaction_id", transactionIds)
        .eq("is_accounting", true);
      if (error) throw error;
      return data;
    },
    enabled: transactionIds.length > 0,
  });

  const docsMap = transactionDocs.reduce<Record<string, boolean>>((acc, d: any) => {
    acc[d.transaction_id] = true;
    return acc;
  }, {});

  // Available transactions for adding
  const { data: availableTransactions = [] } = useQuery({
    queryKey: ["reimbursement-available-transactions", note?.employee_name],
    queryFn: async () => {
      if (!note?.employee_name) return [];
      // Get already-linked transaction IDs
      const { data: allItems } = await supabase
        .from("reimbursement_note_items")
        .select("transaction_id");
      const linkedIds = (allItems || []).map((i: any) => i.transaction_id);

      let query = supabase
        .from("transactions")
        .select("id, description, amount, date, status, event_id, events(name)")
        .eq("is_reimbursement", true)
        .eq("reimbursement_to", note.employee_name)
        .in("status", ["pending", "approved"]);

      const { data, error } = await query.order("date", { ascending: false });
      if (error) throw error;
      return (data || []).filter((t: any) => !linkedIds.includes(t.id));
    },
    enabled: !!note?.employee_name && showAddItem,
  });

  // Supplier bank details for payment
  const { data: supplierData } = useQuery({
    queryKey: ["supplier-bank-details-reimb", (note as any)?.supplier_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("name, nif, iban, swift_bic, iban_2, swift_bic_2, iban_3, swift_bic_3")
        .eq("id", (note as any).supplier_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!(note as any)?.supplier_id,
  });

  // Financial accounts for payment
  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("id, name, type").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: showPayConfirm,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["reimbursement-note", noteId] });
    queryClient.invalidateQueries({ queryKey: ["reimbursement-note-items", noteId] });
    queryClient.invalidateQueries({ queryKey: ["reimbursement-notes"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  };

  const addItemMutation = useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await supabase.from("reimbursement_note_items").insert({
        reimbursement_note_id: noteId,
        transaction_id: transactionId,
      });
      if (error) throw error;
      // Recalculate total
      await recalcTotal();
    },
    onSuccess: () => {
      invalidateAll();
      setSelectedTransactionId("");
      toast({ title: "Despesa adicionada à nota" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("reimbursement_note_items").delete().eq("id", itemId);
      if (error) throw error;
      await recalcTotal();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Despesa removida da nota" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      // Check all items have accounting docs
      const missingDocs = items.filter((i: any) => !docsMap[i.transaction_id]);
      if (missingDocs.length > 0) {
        throw new Error(`${missingDocs.length} despesa(s) sem fatura contábil anexada`);
      }

      // Approve pending transactions
      const pendingIds = items
        .filter((i: any) => i.transactions?.status === "pending")
        .map((i: any) => i.transaction_id);
      if (pendingIds.length > 0) {
        const { error: txError } = await supabase
          .from("transactions")
          .update({ status: "approved" })
          .in("id", pendingIds);
        if (txError) throw txError;
      }

      // Approve note
      const { error } = await supabase
        .from("reimbursement_notes")
        .update({
          status: "approved",
          approved_by: user?.email || "system",
          approved_at: new Date().toISOString(),
        })
        .eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Nota aprovada! Todas as despesas foram aprovadas automaticamente." });
    },
    onError: (err: any) => toast({ title: "Erro ao aprovar", description: err.message, variant: "destructive" }),
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!paymentAccountId) throw new Error("Selecione a conta bancária");

      const today = new Date().toISOString().split("T")[0];

      // Create payment transaction
      const { data: paymentTx, error: payError } = await supabase
        .from("transactions")
        .insert({
          description: `Reembolso ${note.code} — ${note.employee_name}`,
          type: "expense",
          amount: Number(note.total_amount),
          iva_rate: 0,
          account_id: paymentAccountId,
          date: today,
          status: "paid",
          paid_amount: Number(note.total_amount),
          payment_date: today,
        } as any)
        .select("id")
        .single();
      if (payError) throw payError;

      // Mark each item transaction as paid with correct paid_amount
      for (const item of items) {
        const txAmount = Number(item.transactions?.amount || 0);
        await supabase
          .from("transactions")
          .update({
            status: "paid",
            paid_amount: txAmount,
            payment_date: today,
          })
          .eq("id", item.transaction_id);
      }

      // Update note
      const { error } = await supabase
        .from("reimbursement_notes")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          payment_transaction_id: paymentTx.id,
        })
        .eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setShowPayConfirm(false);
      toast({ title: "Reembolso pago com sucesso!" });
    },
    onError: (err: any) => toast({ title: "Erro ao pagar", description: err.message, variant: "destructive" }),
  });

  async function recalcTotal() {
    const { data: currentItems } = await supabase
      .from("reimbursement_note_items")
      .select("transactions(amount)")
      .eq("reimbursement_note_id", noteId);
    const total = (currentItems || []).reduce((s: number, i: any) => s + Number(i.transactions?.amount || 0), 0);
    await supabase.from("reimbursement_notes").update({ total_amount: total }).eq("id", noteId);
  }

  if (noteLoading || !note) {
    return <p className="text-sm text-muted-foreground text-center py-8">A carregar…</p>;
  }

  const isDraft = note.status === "draft";
  const isApproved = note.status === "approved";
  const allHaveDocs = items.length > 0 && items.every((i: any) => docsMap[i.transaction_id]);
  const canApprove = isDraft && items.length > 0 && allHaveDocs && (isAdmin || isManager);
  const canPay = isApproved && (isAdmin || isManager || isEditor);

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 16;

    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Nota de Reembolso ${note.code}`, margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Funcionário: ${note.employee_name}`, margin, y);
    doc.text(`Estado: ${statusLabels[note.status] || note.status}`, pageW / 2, y);
    y += 5;
    doc.text(`Data de criação: ${format(new Date(note.created_at), "dd/MM/yyyy")}`, margin, y);
    if (note.approved_by) {
      doc.text(`Aprovada por: ${note.approved_by} em ${note.approved_at ? format(new Date(note.approved_at), "dd/MM/yyyy") : "—"}`, pageW / 2, y);
    }
    y += 5;
    if (note.paid_at) {
      doc.text(`Paga em: ${format(new Date(note.paid_at), "dd/MM/yyyy")}`, margin, y);
      y += 5;
    }
    if (note.notes) {
      doc.text(`Notas: ${note.notes}`, margin, y);
      y += 5;
    }
    y += 3;

    // Table
    const tableData = items.map((item: any) => {
      const tx = item.transactions;
      return [
        tx?.description || "—",
        tx?.specification || "",
        tx?.date ? format(new Date(tx.date), "dd/MM/yyyy") : "",
        tx?.status === "paid" ? "Pago" : tx?.status === "approved" ? "Aprovado" : "Pendente",
        docsMap[item.transaction_id] ? "Sim" : "Não",
        formatCurrency(Number(tx?.amount || 0)),
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["Descrição", "Especificação", "Data", "Estado", "Fatura", "Valor"]],
      body: tableData,
      foot: [["TOTAL", "", "", "", "", formatCurrency(Number(note.total_amount))]],
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [41, 41, 41] },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
      columnStyles: {
        5: { halign: "right" },
      },
    });

    doc.save(`${note.code.replace(/\//g, "-")}.pdf`);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg p-2 hover:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight">{note.code}</h1>
            <Badge variant="outline" className={statusColors[note.status]}>
              {statusLabels[note.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Funcionário: <span className="font-medium text-foreground">{note.employee_name}</span>
            {note.approved_by && <> · Aprovada por {note.approved_by}</>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold font-mono">{formatCurrency(Number(note.total_amount))}</p>
        </div>
      </div>

      {note.notes && (
        <div className="glass rounded-xl p-3">
          <p className="text-xs text-muted-foreground">{note.notes}</p>
        </div>
      )}

      {/* Payment info */}
      {note.payment_transaction_id && (
        <div className="glass rounded-xl p-3 flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <span className="text-sm">Paga em {note.paid_at ? format(new Date(note.paid_at), "dd/MM/yyyy") : "—"}</span>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={exportPdf}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar PDF
        </Button>
        {isDraft && (
          <Button size="sm" variant="outline" onClick={() => setShowAddItem(!showAddItem)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar Despesa
          </Button>
        )}
        {isDraft && items.length > 0 && !allHaveDocs && (
          <div className="flex items-center gap-1.5 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            Existem despesas sem fatura contábil — necessário para aprovar
          </div>
        )}
        {canApprove && (
          <Button size="sm" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
            <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
            {approveMutation.isPending ? "A aprovar…" : "Aprovar Nota"}
          </Button>
        )}
        {canPay && !showPayConfirm && (
          <Button size="sm" variant="default" onClick={() => setShowPayConfirm(true)}>
            <CreditCard className="mr-1.5 h-3.5 w-3.5" /> Pagar Reembolso
          </Button>
        )}
      </div>

      {/* Add item panel */}
      {showAddItem && isDraft && (
        <div className="glass rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold">Selecionar despesa de reembolso</h3>
          {availableTransactions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma despesa de reembolso pendente para {note.employee_name}.
              Certifique-se de que as transações estão marcadas como "Reembolso" com o nome correto do funcionário.
            </p>
          ) : (
            <div className="space-y-2">
              <SearchableSelect
                options={availableTransactions.map((t: any) => ({
                  value: t.id,
                  label: `${t.description} — ${formatCurrency(Number(t.amount))}${t.events?.name ? ` (${t.events.name})` : ""}`,
                }))}
                value={selectedTransactionId}
                onValueChange={setSelectedTransactionId}
                placeholder="Selecionar despesa…"
                searchPlaceholder="Pesquisar…"
              />
              <Button
                size="sm"
                onClick={() => addItemMutation.mutate(selectedTransactionId)}
                disabled={!selectedTransactionId || addItemMutation.isPending}
              >
                Adicionar
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Pay confirmation */}
      {showPayConfirm && canPay && (
        <div className="glass rounded-xl p-4 space-y-3 border border-primary/30">
          <h3 className="text-sm font-semibold">Confirmar Pagamento</h3>
          <p className="text-xs text-muted-foreground">
            Será criada uma transação de pagamento de {formatCurrency(Number(note.total_amount))} e todas as despesas serão marcadas como pagas.
          </p>
          {supplierData && (
            <SupplierBankDetails supplier={supplierData} defaultExpanded />
          )}
          <SearchableSelect
            options={accounts.map((a: any) => ({ value: a.id, label: a.name }))}
            value={paymentAccountId}
            onValueChange={setPaymentAccountId}
            placeholder="Conta bancária de saída…"
            searchPlaceholder="Pesquisar conta…"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowPayConfirm(false)}>Cancelar</Button>
            <Button
              size="sm"
              onClick={() => payMutation.mutate()}
              disabled={!paymentAccountId || payMutation.isPending}
            >
              {payMutation.isPending ? "A processar…" : "Confirmar Pagamento"}
            </Button>
          </div>
        </div>
      )}

      {/* Items table */}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma despesa vinculada. Adicione despesas de reembolso.</p>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fatura</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                {isDraft && <TableHead className="w-[50px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item: any) => {
                const tx = item.transactions;
                const hasDocs = !!docsMap[item.transaction_id];
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="text-sm font-medium">{tx?.description || "—"}</p>
                      {tx?.specification && <p className="text-xs text-muted-foreground">{tx.specification}</p>}
                      <p className="text-xs text-muted-foreground font-mono">{tx?.date ? format(new Date(tx.date), "dd/MM/yyyy") : ""}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tx?.event_id ? "Vinculado" : "Sem evento"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={tx?.status === "paid" ? "bg-primary/15 text-primary" : tx?.status === "approved" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}>
                        {tx?.status === "paid" ? "Pago" : tx?.status === "approved" ? "Aprovado" : "Aguardando"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {hasDocs ? (
                        <span className="flex items-center gap-1 text-success text-xs"><FileText className="h-3 w-3" /> ✓</span>
                      ) : (
                        <span className="flex items-center gap-1 text-warning text-xs"><AlertTriangle className="h-3 w-3" /> Pendente</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(tx?.amount || 0))}</TableCell>
                    {isDraft && (
                      <TableCell>
                        <button
                          onClick={() => removeItemMutation.mutate(item.id)}
                          className="p-1 rounded hover:bg-destructive/10 transition-colors"
                          title="Desvincular"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2 border-border bg-muted/30">
                <TableCell colSpan={4} className="font-bold text-sm">TOTAL</TableCell>
                <TableCell className="text-right font-mono font-bold">{formatCurrency(Number(note.total_amount))}</TableCell>
                {isDraft && <TableCell />}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
