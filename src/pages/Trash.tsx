import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { entityTypeLabels } from "@/lib/trash";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RotateCcw, Trash2, Eye, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

export default function TrashPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: trashItems = [], isLoading } = useQuery({
    queryKey: ["trash"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trash" as any)
        .select("*")
        .is("restored_at", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (item: any) => {
      const entityType = item.entity_type;
      const entityData = item.entity_data;

      // Re-insert the entity into its original table
      const tableMap: Record<string, string> = {
        forecast: "event_forecasts",
        transaction: "transactions",
        event: "events",
        supplier: "suppliers",
        reimbursement_note: "reimbursement_notes",
        quotation: "quotations",
        recurring_transaction: "recurring_transactions",
      };

      const tableName = tableMap[entityType];
      if (!tableName) throw new Error(`Tipo de entidade desconhecido: ${entityType}`);

      // Remove any fields that might cause issues
      const cleanData = { ...entityData };
      delete cleanData.updated_at; // will be set by trigger

      const { error: insertError } = await supabase.from(tableName as any).insert(cleanData as any);
      if (insertError) throw insertError;

      // Re-insert related data if present
      if (item.related_data) {
        for (const [relTable, relRows] of Object.entries(item.related_data)) {
          if (Array.isArray(relRows) && relRows.length > 0) {
            const cleanRows = relRows.map((r: any) => {
              const c = { ...r };
              delete c.updated_at;
              return c;
            });
            await supabase.from(relTable as any).insert(cleanRows as any);
          }
        }
      }

      // Mark as restored
      const { error: updateError } = await supabase
        .from("trash" as any)
        .update({ restored_at: new Date().toISOString() } as any)
        .eq("id", item.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["reimbursement-notes"] });
      toast({ title: "Item restaurado com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao restaurar", description: err.message, variant: "destructive" });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trash" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      toast({ title: "Item eliminado permanentemente" });
    },
    onError: () => toast({ title: "Erro ao eliminar", variant: "destructive" }),
  });

  const entityTypes = [...new Set(trashItems.map((t: any) => t.entity_type))];

  const filtered = typeFilter === "all"
    ? trashItems
    : trashItems.filter((t: any) => t.entity_type === typeFilter);

  const getEntitySummary = (item: any) => {
    const d = item.entity_data;
    if (!d) return item.entity_id;
    return d.name || d.description || d.employee_name || d.title || d.code || item.entity_id;
  };

  const getDaysLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
          <button onClick={() => navigate("/admin")} className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent transition-colors"><ArrowLeft className="h-4 w-4" /></button>
          🗑️ Lixeira
        </h1>
        <p className="text-sm text-muted-foreground">
          Itens eliminados são mantidos por 30 dias antes da remoção permanente
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => setTypeFilter("all")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
            typeFilter === "all"
              ? "bg-primary/15 text-primary ring-1 ring-primary/30"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          Todos ({trashItems.length})
        </button>
        {entityTypes.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              typeFilter === t
                ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {entityTypeLabels[t] || t} ({trashItems.filter((i: any) => i.entity_type === t).length})
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">A carregar…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Lixeira vazia 🎉</p>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Tipo</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Eliminado por</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Expira em</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item: any) => {
                const isExpanded = expandedId === item.id;
                const daysLeft = getDaysLeft(item.expires_at);
                return (
                  <>
                    <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedId(isExpanded ? null : item.id)}>
                      <TableCell>
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {entityTypeLabels[item.entity_type] || item.entity_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-sm max-w-[200px] truncate">
                        {getEntitySummary(item)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.deleted_by}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(item.deleted_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={daysLeft <= 5 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}>
                          {daysLeft}d
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={restoreMutation.isPending}>
                                <RotateCcw className="h-3 w-3 mr-1" /> Restaurar
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Restaurar item</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Restaurar "{getEntitySummary(item)}"? Ele será reinserido na base de dados.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => restoreMutation.mutate(item)}>Restaurar</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" disabled={permanentDeleteMutation.isPending}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Eliminar permanentemente</AlertDialogTitle>
                                  <AlertDialogDescription>Esta ação é irreversível. O item será removido definitivamente.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => permanentDeleteMutation.mutate(item.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${item.id}-detail`}>
                        <TableCell colSpan={7} className="bg-muted/30 p-4">
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Dados do item eliminado:</p>
                            <pre className="text-xs bg-background rounded-lg p-3 overflow-auto max-h-60 border">
                              {JSON.stringify(item.entity_data, null, 2)}
                            </pre>
                            {item.related_data && (
                              <>
                                <p className="text-xs font-medium text-muted-foreground mt-2">Dados relacionados:</p>
                                <pre className="text-xs bg-background rounded-lg p-3 overflow-auto max-h-40 border">
                                  {JSON.stringify(item.related_data, null, 2)}
                                </pre>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
