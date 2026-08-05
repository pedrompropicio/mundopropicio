import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Target, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCompany } from "@/hooks/useCompany";
import { relativeFromNow } from "../lib/relativeTime";

export default function AudiencesList() {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["crm-audiences-list", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("audiences")
        .select("id, name, description, last_preview_count, last_previewed_at, updated_at")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("audiences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Audience eliminada");
      qc.invalidateQueries({ queryKey: ["crm-audiences-list"] });
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return (data ?? []).filter((a: any) => !s || a.name?.toLowerCase().includes(s));
  }, [data, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audiências</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Segmentos dinâmicos de contactos para campanhas e exports.
          </p>
        </div>
        <Button asChild>
          <Link to="/crm/audiences/novo"><Plus className="h-4 w-4" /> Nova audience</Link>
        </Button>
      </div>

      {!isLoading && (data ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <Target className="h-10 w-10 mx-auto text-emerald-600" />
            <h2 className="text-lg font-semibold">Sem audiências ainda</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Cria a tua primeira audiência com filtros como "consente email" + "actividade nos últimos 90 dias" para exportar para Meta Custom Audiences.
            </p>
            <Button asChild>
              <Link to="/crm/audiences/novo"><Plus className="h-4 w-4" /> Criar audience</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </Card>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Último preview</TableHead>
                  <TableHead>Visto há</TableHead>
                  <TableHead>Actualizada</TableHead>
                  <TableHead className="text-right">Acções</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">A carregar…</TableCell></TableRow>
                )}
                {rows.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link to={`/crm/audiences/${a.id}`} className="font-medium hover:text-emerald-600">
                        {a.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.description ?? "—"}</TableCell>
                    <TableCell className="text-sm">{a.last_preview_count?.toLocaleString("pt-PT") ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{relativeFromNow(a.last_previewed_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{relativeFromNow(a.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => setToDelete({ id: a.id, name: a.name })}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar audience?</AlertDialogTitle>
            <AlertDialogDescription>
              Vai eliminar "{toDelete?.name}" e todos os snapshots associados. Esta acção não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && delMut.mutate(toDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
