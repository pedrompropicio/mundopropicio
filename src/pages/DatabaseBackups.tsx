import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  Database,
  Download,
  Loader2,
  Trash2,
  RefreshCw,
  Clock,
  HardDrive,
  RotateCcw,
  Eye,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FolderArchive,
  ArrowLeft,
} from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";

export default function DatabaseBackups() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<any>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<any>(null);
  const [previewing, setPreviewing] = useState(false);

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
      const { error } = await supabase.storage.from("database-backups").remove([fileName]);
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
    const { data, error } = await supabase.storage.from("database-backups").download(fileName);
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

  const handlePreview = async (fileName: string) => {
    setPreviewing(true);
    setRestoreTarget(fileName);
    setRestorePreview(null);
    setRestoreResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("database-restore", {
        body: { backup_file: fileName, mode: "preview" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setRestorePreview(data);
    } catch (err: any) {
      toast({ title: "Erro ao pré-visualizar", description: err.message, variant: "destructive" });
      setRestoreTarget(null);
    } finally {
      setPreviewing(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    setRestoreResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("database-restore", {
        body: { backup_file: restoreTarget, mode: "restore" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setRestoreResult(data);
      if (data.success) {
        toast({ title: "Restauração concluída", description: "Todos os dados foram restaurados com sucesso." });
      } else {
        toast({
          title: "Restauração parcial",
          description: `${data.tables_with_errors} tabela(s) com erros.`,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "Erro na restauração", description: err.message, variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  if (!isAdmin) return <Navigate to="/" replace />;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString("pt-PT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
            <button onClick={() => navigate("/admin")} className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent transition-colors"><ArrowLeft className="h-4 w-4" /></button>
            Backups <HelpTooltip text={helpTexts.databaseBackups} />
          </h1>
          <p className="text-sm text-muted-foreground">Cópias de segurança da base de dados e ficheiros</p>
        </div>
        <button
          onClick={() => createBackupMutation.mutate()}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          {creating ? "A criar backup…" : "Criar Backup"}
        </button>
      </div>

      {/* Backup List */}
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
                    onClick={() => handlePreview(file.name)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    title="Restaurar este backup"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Restaurar</span>
                  </button>
                  <button
                    onClick={() => handleDownload(file.name)}
                    className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title="Descarregar ficheiro"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Eliminar este backup?")) deleteBackupMutation.mutate(file.name);
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

      {/* Restore Preview / Confirmation Modal */}
      {restoreTarget && (restorePreview || previewing) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            if (!restoring) {
              setRestoreTarget(null);
              setRestorePreview(null);
              setRestoreResult(null);
            }
          }}
        >
          <div
            className="glass w-full max-w-lg max-h-[85vh] rounded-xl p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {previewing ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">A analisar backup…</span>
              </div>
            ) : restoreResult ? (
              /* Restore Results */
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {restoreResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                  )}
                  <h2 className="text-lg font-semibold">
                    {restoreResult.success ? "Restauração Concluída" : "Restauração Parcial"}
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {restoreResult.total_tables} tabelas processadas
                  {restoreResult.tables_with_errors > 0 &&
                    `, ${restoreResult.tables_with_errors} com erros`}
                </p>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {Object.entries(restoreResult.results || {}).map(([table, info]: [string, any]) => (
                    <div key={table} className="flex items-center justify-between text-xs py-1">
                      <span className="font-mono">{table}</span>
                      <span className="flex items-center gap-2">
                        <span>{info.inserted} registos</span>
                        {info.error ? (
                          <XCircle className="h-3 w-3 text-destructive" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setRestoreTarget(null);
                    setRestorePreview(null);
                    setRestoreResult(null);
                  }}
                  className="w-full rounded-lg bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 transition-colors"
                >
                  Fechar
                </button>
              </div>
            ) : restorePreview ? (
              /* Preview */
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Restaurar Backup</h2>
                </div>
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-600 dark:text-amber-400">
                      <p className="font-semibold">Atenção: Operação destrutiva</p>
                      <p>
                        Esta operação irá <strong>substituir todos os dados atuais</strong> pelos dados deste
                        backup. Esta ação não pode ser revertida.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Ficheiro:</span>{" "}
                    <span className="font-medium">{restoreTarget}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Data do backup:</span>{" "}
                    <span className="font-medium">
                      {restorePreview.backup_date
                        ? formatDate(restorePreview.backup_date)
                        : "—"}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Versão:</span>{" "}
                    <span className="font-medium">v{restorePreview.version ?? 1}</span>
                  </p>
                </div>

                {/* Table counts */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5" /> Tabelas
                  </h3>
                  <div className="space-y-0.5 max-h-40 overflow-y-auto">
                    {Object.entries(restorePreview.tables || {}).map(([table, info]: [string, any]) => (
                      <div key={table} className="flex items-center justify-between text-xs py-0.5">
                        <span className="font-mono text-muted-foreground">{table}</span>
                        <span className="font-medium">{info.backup_rows} registos</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Storage manifest */}
                {restorePreview.storage_manifest && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <FolderArchive className="h-3.5 w-3.5" /> Ficheiros (manifesto)
                    </h3>
                    <div className="space-y-0.5">
                      {Object.entries(restorePreview.storage_manifest).map(([bucket, count]: [string, any]) => (
                        <div key={bucket} className="flex items-center justify-between text-xs py-0.5">
                          <span className="font-mono text-muted-foreground">{bucket}</span>
                          <span className="font-medium">{count} ficheiros</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      ℹ️ O manifesto lista ficheiros existentes no momento do backup. Os ficheiros de storage não são restaurados automaticamente.
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      setRestoreTarget(null);
                      setRestorePreview(null);
                    }}
                    disabled={restoring}
                    className="flex-1 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("ÚLTIMA CONFIRMAÇÃO: Todos os dados atuais serão substituídos. Continuar?")) {
                        handleRestore();
                      }
                    }}
                    disabled={restoring}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                  >
                    {restoring ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        A restaurar…
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4" />
                        Restaurar
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Info Card */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          Backup Automático
        </h3>
        <p className="text-xs text-muted-foreground">
          O sistema cria automaticamente um backup diário às 3h da manhã.
          São mantidos os últimos 30 backups. Backups antigos são eliminados automaticamente.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          <strong>Inclui:</strong> Todas as tabelas da base de dados + manifesto de ficheiros de storage
          (transaction-documents, supplier-documents, partner-extra-documents, cache-extra-documents,
          closing-cost-documents, import-reports).
        </p>
      </div>
    </div>
  );
}
