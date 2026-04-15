import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  transactionId: string;
  onClose: () => void;
}

export function TransactionAuditModal({ transactionId, onClose }: Props) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit_log", transactionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_audit_log")
        .select("*")
        .eq("transaction_id", transactionId)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de Alterações</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem registos de auditoria.</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              const isCreation = log.field_name === "Criação";

              if (isCreation) {
                return (
                  <div key={log.id} className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-medium text-primary">
                        <Plus className="h-3.5 w-3.5" />
                        Lançamento criado
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.changed_at).toLocaleString("pt-PT")}
                      </span>
                    </div>
                    <p className="text-xs text-foreground">{log.new_value}</p>
                    <p className="text-xs text-muted-foreground">Por: {log.changed_by}</p>
                  </div>
                );
              }

              return (
                <div key={log.id} className="rounded-lg bg-secondary/30 p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-primary">{log.field_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.changed_at).toLocaleString("pt-PT")}
                    </span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="text-muted-foreground">De:</span>
                    <span className="text-destructive line-through">{log.old_value || "—"}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="text-muted-foreground">Para:</span>
                    <span className="text-success">{log.new_value || "—"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Por: {log.changed_by}</p>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
