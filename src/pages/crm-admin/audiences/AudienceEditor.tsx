import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AudienceBuilder from "./AudienceBuilder";
import AudiencePreviewCount from "./AudiencePreviewCount";
import { previewCount, createSnapshot, exportSnapshotCSV } from "./audienceSnapshot";
import { EMPTY_CRITERION, type Criterion } from "./audienceCriterion";
import { formatDateTime, relativeFromNow } from "../lib/relativeTime";
import { useCompany } from "@/hooks/useCompany";

export default function AudienceEditor() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { companyId } = useCompany();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [criterion, setCriterion] = useState<Criterion>(EMPTY_CRITERION);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureCount, setCaptureCount] = useState<number | null>(null);
  const [snapshotToDelete, setSnapshotToDelete] = useState<string | null>(null);

  const { data: audience, isLoading } = useQuery({
    enabled: !!id,
    queryKey: ["crm-audience", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("audiences")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (audience) {
      setName(audience.name ?? "");
      setDescription(audience.description ?? "");
      setCriterion((audience.criterion as Criterion) ?? EMPTY_CRITERION);
    }
  }, [audience]);

  const { data: snapshots } = useQuery({
    enabled: !!id,
    queryKey: ["crm-audience-snapshots", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("audience_snapshots")
        .select("id, captured_at, member_count, exported_at")
        .eq("audience_id", id)
        .order("captured_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nome obrigatório");
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("audiences")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          criterion,
          updated_by: userData?.user?.id,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Audience guardada");
      qc.invalidateQueries({ queryKey: ["crm-audience", id] });
      qc.invalidateQueries({ queryKey: ["crm-audiences-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const captureMut = useMutation({
    mutationFn: async () => createSnapshot(id!, criterion, companyId!),
    onSuccess: (r) => {
      toast.success(`Snapshot capturada (${r.member_count} contactos)`);
      qc.invalidateQueries({ queryKey: ["crm-audience-snapshots", id] });
      qc.invalidateQueries({ queryKey: ["crm-audience", id] });
      setCaptureOpen(false);
      setCaptureCount(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const exportMut = useMutation({
    mutationFn: async (snapshotId: string) => exportSnapshotCSV(snapshotId, name),
    onSuccess: (n) => {
      toast.success(`CSV exportado (${n} linhas)`);
      qc.invalidateQueries({ queryKey: ["crm-audience-snapshots", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delSnapMut = useMutation({
    mutationFn: async (snapshotId: string) => {
      const { error } = await (supabase as any)
        .from("audience_snapshots")
        .delete()
        .eq("id", snapshotId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Snapshot eliminada");
      qc.invalidateQueries({ queryKey: ["crm-audience-snapshots", id] });
      setSnapshotToDelete(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCapture = async () => {
    setCaptureOpen(true);
    setCaptureCount(null);
    try {
      const n = await previewCount(criterion, companyId!);
      setCaptureCount(n);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">A carregar…</p>;
  if (!audience) return <p className="text-sm text-destructive">Audience não encontrada.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{audience.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Editor e snapshots desta audiência.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Editor */}
        <div className="space-y-4">
          <Card className="p-4 space-y-4">
            <h2 className="text-sm font-semibold">Editor</h2>
            <div>
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="desc">Descrição</Label>
              <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <AudienceBuilder criterion={criterion} onChange={setCriterion} />
            <AudiencePreviewCount criterion={criterion} />
            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => nav("/crm/audiences")}>Voltar</Button>
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {saveMut.isPending ? "A guardar…" : "Guardar"}
              </Button>
              <Button
                variant="outline"
                onClick={openCapture}
                className="border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10"
              >
                <Camera className="h-4 w-4" /> Capturar snapshot
              </Button>
            </div>
          </Card>
        </div>

        {/* Snapshots */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Snapshots</h2>
          {(snapshots ?? []).length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Sem snapshots ainda. Captura um para exportar.
            </Card>
          )}
          {(snapshots ?? []).map((s: any) => (
            <Card key={s.id} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">
                    {s.member_count.toLocaleString("pt-PT")} contactos
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(s.captured_at)} · {relativeFromNow(s.captured_at)}
                  </div>
                </div>
                {s.exported_at && (
                  <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                    Exportado {formatDateTime(s.exported_at)}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={s.member_count === 0 || exportMut.isPending}
                  onClick={() => exportMut.mutate(s.id)}
                >
                  <Download className="h-3 w-3" /> Export CSV
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSnapshotToDelete(s.id)}
                >
                  <Trash2 className="h-3 w-3 text-destructive" /> Apagar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={captureOpen} onOpenChange={setCaptureOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Capturar snapshot?</DialogTitle>
            <DialogDescription>
              Vai gravar um snapshot imutável da lista actual de contactos que correspondem aos filtros.
            </DialogDescription>
          </DialogHeader>
          <div className="text-center py-4">
            <div className="text-4xl font-bold text-emerald-600">
              {captureCount == null ? "…" : captureCount.toLocaleString("pt-PT")}
            </div>
            <div className="text-sm text-muted-foreground">contactos</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCaptureOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => captureMut.mutate()}
              disabled={captureMut.isPending || captureCount == null}
            >
              {captureMut.isPending ? "A capturar…" : "Capturar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!snapshotToDelete} onOpenChange={(v) => !v && setSnapshotToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acção não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => snapshotToDelete && delSnapMut.mutate(snapshotToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
