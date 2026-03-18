import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Database, Download, Loader2, Trash2, RefreshCw, Clock, HardDrive } from "lucide-react";
import { Navigate } from "react-router-dom";

export default function DatabaseBackups() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: backups = [], isLoading } = useQuery({
    queryKey: ["database-backups"],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("database-backups")
        .list("", { sortBy: { column: "created_at", order: "desc" } });
      if (error) throw error;
      return data.filter((f) => f.name.endsWith(".json"));
    },
  });

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      setCreating(true);
      const { data, error } = await supabase.functions.invoke("database-backup");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Backup criado", description: `Ficheiro: ${data.file}` });
      queryClient.invalidateQueries({ queryKey: ["database-backups"] });
      setCreating(false);
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao criar backup", description: err.message, variant: "destructive" });
      setCreating(false);
    },
  });

  const deleteBackupMutation = useMutation({
    mutationFn: async (fileName: string) => {
      const { error } = await supabase.storage
        .from("database-backups")
        .remove([fileName]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Backup eliminado" });
      queryClient.invalidateQueries({ queryKey: ["database-backups"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const handleDownload = async (fileName: string) => {
    const { data, error } = await supabase.storage
      .from("database-backups")
      .download(fileName);
    if (error) {
      toast({ title: "Erro ao descarregar", description: error.message, variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) return <Navigate to="/" replace />;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("pt-PT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Backups</h1>
          <p className="text-sm text-muted-foreground">Cópias de segurança da base de dados</p>
        </div>
        <button
          onClick={() => createBackupMutation.mutate()}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Database className="h-4 w-4" />
          )}
          {creating ? "A criar backup…" : "Criar Backup"}
        </button>
      </div>

      <div className="glass rounded-xl p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-12">
            <HardDrive className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum backup encontrado</p>
            <p className="text-xs text-muted-foreground mt-1">
              Crie o primeiro backup manualmente ou aguarde o backup automático diário
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {backups.map((file) => (
              <div
                key={file.name}
                className="flex items-center gap-3 rounded-lg p-3 hover:bg-secondary/30 transition-colors"
              >
                <Database className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(file.created_at)}
                    </span>
                    {file.metadata?.size && (
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3" />
                        {formatFileSize(file.metadata.size as number)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleDownload(file.name)}
                    className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title="Descarregar"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Eliminar este backup?")) {
                        deleteBackupMutation.mutate(file.name);
                      }
                    }}
                    className="rounded-lg p-2 text-destructive hover:bg-destructive/15 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          Backup Automático
        </h3>
        <p className="text-xs text-muted-foreground">
          O sistema cria automaticamente um backup diário às 3h da manhã.
          São mantidos os últimos 30 backups. Backups antigos são eliminados automaticamente.
        </p>
      </div>
    </div>
  );
}
