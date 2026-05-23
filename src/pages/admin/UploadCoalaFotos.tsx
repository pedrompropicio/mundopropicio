import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Upload, CheckCircle2, AlertCircle, FileImage } from "lucide-react";
import { toast } from "sonner";

type MapRow = { source_filename: string; bucket_path: string };
type Status = "pending" | "uploading" | "done" | "skipped" | "error";
type RowState = MapRow & { status: Status; message?: string };

export default function UploadCoalaFotos() {
  const { user } = useAuth();
  const [mapping, setMapping] = useState<RowState[]>([]);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fetch("/coala-fotos-mapping.csv")
      .then((r) => r.text())
      .then((txt) => {
        const lines = txt.trim().split("\n").slice(1);
        setMapping(
          lines.map((l) => {
            const [source_filename, bucket_path] = l.split(",");
            return { source_filename: source_filename.trim(), bucket_path: bucket_path.trim(), status: "pending" as Status };
          })
        );
      })
      .catch(() => toast.error("Não consegui carregar o mapeamento CSV."));
  }, []);

  const stats = useMemo(() => {
    const matched = mapping.filter((m) => files.has(m.source_filename)).length;
    const done = mapping.filter((m) => m.status === "done").length;
    const errors = mapping.filter((m) => m.status === "error").length;
    return { matched, done, errors, total: mapping.length };
  }, [mapping, files]);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const m = new Map(files);
    for (const f of Array.from(list)) m.set(f.name, f);
    setFiles(m);
  };

  const run = async () => {
    if (!user) {
      toast.error("Sem sessão.");
      return;
    }
    setRunning(true);
    setProgress(0);
    const next = [...mapping];
    let done = 0;
    for (let i = 0; i < next.length; i++) {
      const row = next[i];
      const file = files.get(row.source_filename);
      if (!file) {
        next[i] = { ...row, status: "skipped", message: "Ficheiro não selecionado" };
        setMapping([...next]);
        continue;
      }
      next[i] = { ...row, status: "uploading" };
      setMapping([...next]);
      const { error } = await supabase.storage
        .from("operacao-media")
        .upload(row.bucket_path, file, { contentType: "image/jpeg", upsert: true });
      if (error) {
        next[i] = { ...row, status: "error", message: error.message };
      } else {
        next[i] = { ...row, status: "done" };
        done++;
      }
      setMapping([...next]);
      setProgress(Math.round(((i + 1) / next.length) * 100));
    }
    setRunning(false);
    toast.success(`Upload concluído: ${done}/${next.length}`);
  };

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Upload em massa — Fotos Coala</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Seleciona os 68 ficheiros .jpg. O mapeamento por nome para os paths do bucket é automático.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline">
            <label className="cursor-pointer">
              <FileImage className="h-4 w-4 mr-2" />
              Selecionar ficheiros
              <input
                type="file"
                multiple
                accept="image/jpeg"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>
          </Button>
          <div className="text-sm text-muted-foreground">
            {stats.matched}/{stats.total} ficheiros emparelhados
          </div>
        </div>
        <Button onClick={run} disabled={running || stats.matched === 0} className="w-full">
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          Enviar {stats.matched} ficheiros para o Storage
        </Button>
        {running && <Progress value={progress} />}
        {(stats.done > 0 || stats.errors > 0) && (
          <div className="text-sm flex gap-4">
            <span className="text-green-600">✓ {stats.done} enviados</span>
            {stats.errors > 0 && <span className="text-destructive">✗ {stats.errors} erros</span>}
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="max-h-[500px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="text-left p-2">Ficheiro</th>
                <th className="text-left p-2 w-32">Estado</th>
              </tr>
            </thead>
            <tbody>
              {mapping.map((row) => {
                const hasFile = files.has(row.source_filename);
                return (
                  <tr key={row.source_filename} className="border-t">
                    <td className="p-2 font-mono text-xs">{row.source_filename}</td>
                    <td className="p-2">
                      {row.status === "done" && (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="h-3 w-3" /> OK
                        </span>
                      )}
                      {row.status === "error" && (
                        <span className="flex items-center gap-1 text-destructive" title={row.message}>
                          <AlertCircle className="h-3 w-3" /> Erro
                        </span>
                      )}
                      {row.status === "uploading" && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      {row.status === "pending" && (
                        <span className="text-muted-foreground">{hasFile ? "Pronto" : "Falta ficheiro"}</span>
                      )}
                      {row.status === "skipped" && (
                        <span className="text-muted-foreground">Saltado</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
