import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-md rounded-xl p-6 space-y-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Histórico de Alterações</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem alterações registadas.</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
