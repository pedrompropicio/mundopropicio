import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { formatDatePT } from "@/lib/utils";

type Flag = {
  id: string;
  supplier_id: string;
  similar_supplier_id: string;
  motivo: "nif" | "nome";
  source: "sponsors_import" | "apply_coala_bp";
  created_at: string;
};

const SOURCE_LABEL: Record<Flag["source"], string> = {
  sponsors_import: "Importação de patrocinadores",
  apply_coala_bp: "Sync Coala",
};

/** D-ERP201 — pares de fornecedores parecidos criados em lote, por rever. Fusão é manual. */
export default function SimilarSuppliersReview() {
  const { role, user } = useAuth() as any;
  const ok = role === "admin" || role === "platform_admin" || role === "manager";
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["supplier-similarity-flags"],
    enabled: ok,
    queryFn: async () => {
      const { data: flags, error } = await (supabase as any)
        .from("supplier_similarity_flags")
        .select("id, supplier_id, similar_supplier_id, motivo, source, created_at")
        .is("resolved_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((flags as Flag[]).flatMap((f) => [f.supplier_id, f.similar_supplier_id])));
      const names = new Map<string, { name: string; nif: string | null; is_active: boolean }>();
      if (ids.length) {
        const { data: sup, error: sErr } = await supabase.from("suppliers").select("id, name, nif, is_active").in("id", ids);
        if (sErr) throw sErr;
        for (const s of sup ?? []) names.set((s as any).id, s as any);
      }
      return { flags: flags as Flag[], names };
    },
  });

  const resolve = useMutation({
    mutationFn: async ({ id, resolution }: { id: string; resolution: "diferentes" | "resolvido" }) => {
      const { error } = await (supabase as any)
        .from("supplier_similarity_flags")
        .update({ resolved_at: new Date().toISOString(), resolution, resolved_by: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-similarity-flags"] });
      toast.success("Par marcado");
    },
    onError: (e: any) => toast.error("Erro ao marcar", { description: e.message }),
  });

  if (!ok) return <Navigate to="/admin" replace />;
  const label = (id: string) => {
    const s = data?.names.get(id);
    return s ? `${s.name}${s.nif ? ` (NIF ${s.nif})` : ""}${s.is_active ? "" : " · inativo"}` : id;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="h-6 w-6 text-warning" /> Fornecedores parecidos
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Fornecedores criados em lote (importação de patrocinadores, sync Coala) com nome ou NIF parecido a outro.
          A junção das fichas continua manual.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por rever</CardTitle>
          <CardDescription>
            {isLoading ? "A carregar…" : `${data?.flags.length ?? 0} par(es) por rever`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : !data?.flags.length ? (
            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> Nada por rever.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Novo</TableHead>
                  <TableHead>Parecido com</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.flags.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="text-sm">{label(f.supplier_id)}</TableCell>
                    <TableCell className="text-sm">{label(f.similar_supplier_id)}</TableCell>
                    <TableCell><Badge variant="outline">{f.motivo === "nif" ? "mesmo NIF" : "nome parecido"}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {SOURCE_LABEL[f.source]} · {formatDatePT(f.created_at.slice(0, 10))}
                    </TableCell>
                    <TableCell className="text-right space-x-2 whitespace-nowrap">
                      <Button size="sm" variant="outline" disabled title="A junção ainda é manual">Juntar</Button>
                      <Button size="sm" variant="outline" disabled={resolve.isPending}
                        onClick={() => resolve.mutate({ id: f.id, resolution: "diferentes" })}>São diferentes</Button>
                      <Button size="sm" disabled={resolve.isPending}
                        onClick={() => resolve.mutate({ id: f.id, resolution: "resolvido" })}>Resolvido</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
