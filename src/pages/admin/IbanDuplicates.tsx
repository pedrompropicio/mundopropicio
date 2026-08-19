import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { SUPPLIER_BASE_COLUMNS, fetchSupplierBankMap, fetchSupplierBankRows, mergeSupplierBank } from "@/lib/supplier-bank";


type SupplierRow = {
  id: string;
  name: string;
  nif: string | null;
  iban: string | null;
  iban_2: string | null;
  iban_3: string | null;
};

type DupGroup = {
  iban: string;
  count: number;
  suppliers: { id: string; name: string; nif: string | null }[];
};

function normalize(v: string | null) {
  return (v ?? "").replace(/\s+/g, "").toUpperCase();
}

export default function IbanDuplicatesPage() {
  const { role } = useAuth();
  const isAuthorized =
    role === "admin" || role === ("platform_admin" as any) || role === ("manager" as any);

  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ["iban-duplicates-source"],
    enabled: isAuthorized,
    queryFn: async () => {
      const rows = await fetchSupplierBankRows(null);
      return rows.filter((r) => r.iban || r.iban_2 || r.iban_3) as unknown as SupplierRow[];
    },
  });

  const { data: editing } = useQuery({
    queryKey: ["supplier-edit", editingId],
    enabled: !!editingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select(SUPPLIER_BASE_COLUMNS)
        .eq("id", editingId!)
        .single();
      if (error) throw error;
      const bank = await fetchSupplierBankMap([editingId!]);
      return mergeSupplierBank([data as any], bank)[0] as any;
    },
  });


  const groups: DupGroup[] = useMemo(() => {
    if (!suppliers) return [];
    const map = new Map<string, Map<string, { name: string; nif: string | null }>>();
    for (const s of suppliers) {
      for (const raw of [s.iban, s.iban_2, s.iban_3]) {
        const n = normalize(raw);
        if (!n) continue;
        if (!map.has(n)) map.set(n, new Map());
        map.get(n)!.set(s.id, { name: s.name, nif: s.nif });
      }
    }
    const result: DupGroup[] = [];
    for (const [iban, sup] of map.entries()) {
      if (sup.size > 1) {
        result.push({
          iban,
          count: sup.size,
          suppliers: Array.from(sup.entries())
            .map(([id, v]) => ({ id, name: v.name, nif: v.nif }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
    }
    return result.sort((a, b) => b.count - a.count);
  }, [suppliers]);

  if (!isAuthorized) return <Navigate to="/admin" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-warning" />
          IBANs Duplicados
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          IBANs partilhados por múltiplos fornecedores na empresa ativa. Pode ser
          legítimo (mesma pessoa singular com várias entidades) ou erro de cadastro
          que conduz a pagamentos para a entidade errada. Reveja caso a caso.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultados</CardTitle>
          <CardDescription>
            {isLoading
              ? "A analisar fornecedores…"
              : groups.length === 0
                ? "Não foram detetados IBANs duplicados ✓"
                : `${groups.length} IBAN(s) partilhado(s) por mais de um fornecedor`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
            </div>
          ) : groups.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> Sem duplicados na empresa ativa.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IBAN</TableHead>
                  <TableHead className="w-24">Nº</TableHead>
                  <TableHead>Fornecedores</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.iban}>
                    <TableCell className="font-mono text-xs">{g.iban}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{g.count}</Badge>
                    </TableCell>
                    <TableCell>
                      <ul className="space-y-1">
                        {g.suppliers.map((s) => (
                          <li
                            key={s.id}
                            className="flex flex-wrap items-center gap-2 text-sm"
                          >
                            <span className="font-medium">{s.name}</span>
                            <span className="text-muted-foreground text-xs">
                              NIF: {s.nif ?? "—"}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(s.id)}
                            >
                              Abrir fornecedor
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editingId && editing && (
        <SupplierFormModal
          open={!!editingId}
          onOpenChange={(o) => !o && setEditingId(null)}
          editingSupplier={editing}
        />
      )}
    </div>
  );
}
