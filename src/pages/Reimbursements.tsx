import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { moveToTrash } from "@/lib/trash";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Plus, Eye, Trash2, CheckCircle, CreditCard, Search } from "lucide-react";
import { ReimbursementNoteDetail } from "@/components/ReimbursementNoteDetail";
import { ReimbursementNoteFormModal } from "@/components/ReimbursementNoteFormModal";

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

export default function Reimbursements() {
  const { isAdmin, isManager, user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["reimbursement-notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_notes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: noteData } = await supabase.from("reimbursement_notes").select("*").eq("id", id).single();
      if (noteData) {
        await moveToTrash({
          entity_type: "reimbursement_note",
          entity_id: id,
          entity_data: noteData,
          deleted_by: user?.email || "sistema",
        });
      }
      const { error } = await supabase.from("reimbursement_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reimbursement-notes"] });
      toast({ title: "Nota de reembolso eliminada" });
    },
    onError: () => toast({ title: "Erro ao eliminar", variant: "destructive" }),
  });

  const filtered = notes.filter((n: any) => {
    if (statusFilter !== "all" && n.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return n.code?.toLowerCase().includes(s) || n.employee_name?.toLowerCase().includes(s);
    }
    return true;
  });

  if (selectedNoteId) {
    return (
      <ReimbursementNoteDetail
        noteId={selectedNoteId}
        onBack={() => setSelectedNoteId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
            Notas de Reembolso <HelpTooltip text={helpTexts.reimbursements} />
          </h1>
          <p className="text-sm text-muted-foreground">Gerencie reembolsos a funcionários por despesas pagas do próprio bolso</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Nova Nota
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar código ou funcionário…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-1">
          {[
            { value: "all", label: "Todas" },
            { value: "draft", label: "Rascunho" },
            { value: "approved", label: "Aprovadas" },
            { value: "paid", label: "Pagas" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                statusFilter === opt.value
                  ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">A carregar…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma nota de reembolso encontrada.</p>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Funcionário</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((note: any) => (
                <TableRow key={note.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedNoteId(note.id)}>
                  <TableCell className="font-mono font-medium text-sm">{note.code}</TableCell>
                  <TableCell className="text-sm">{note.employee_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[note.status]}>
                      {statusLabels[note.status] || note.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(Number(note.total_amount))}</TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setSelectedNoteId(note.id)} className="p-1 rounded hover:bg-secondary transition-colors">
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      {note.status === "draft" && (isAdmin || isManager) && (
                        <button
                          onClick={() => { if (window.confirm("Eliminar esta nota?")) deleteMutation.mutate(note.id); }}
                          className="p-1 rounded hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {showForm && (
        <ReimbursementNoteFormModal
          onClose={() => setShowForm(false)}
          onCreated={(id) => {
            setShowForm(false);
            setSelectedNoteId(id);
          }}
        />
      )}
    </div>
  );
}
