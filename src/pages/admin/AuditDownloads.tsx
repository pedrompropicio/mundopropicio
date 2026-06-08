import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

const PAGE = 50;

export default function AuditDownloads() {
  const { isAdmin, role } = useAuth();
  const [page, setPage] = useState(0);
  const [userFilter, setUserFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "transaction_document" | "zip_export" | "supplier_document">("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  if (!isAdmin && role !== ("platform_admin" as any)) {
    return <Navigate to="/" replace />;
  }

  const { data: companies } = useQuery({
    queryKey: ["audit-companies"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("companies").select("id, display_name");
      const map = new Map<string, string>();
      for (const c of data ?? []) map.set(c.id, c.display_name);
      return map;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["audit-downloads", page, userFilter, typeFilter, from, to],
    queryFn: async () => {
      let q = (supabase as any)
        .from("document_download_audit")
        .select("*", { count: "exact" })
        .order("downloaded_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (userFilter.trim()) q = q.ilike("user_email", `%${userFilter.trim()}%`);
      if (typeFilter !== "all") q = q.eq("resource_type", typeFilter);
      if (from) q = q.gte("downloaded_at", from);
      if (to) q = q.lte("downloaded_at", `${to}T23:59:59`);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const total = data?.count ?? 0;
  const maxPage = Math.max(0, Math.ceil(total / PAGE) - 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Auditoria de Descarregamentos</h1>
        <p className="text-sm text-muted-foreground">Registo de descarregamentos de documentos contábeis (individuais e ZIP).</p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border bg-card p-3">
        <Input placeholder="User (email)" value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setPage(0); }} className="w-56 h-9" />
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as any); setPage(0); }}>
          <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tipo: Todos</SelectItem>
            <SelectItem value="transaction_document">Individual</SelectItem>
            <SelectItem value="zip_export">ZIP</SelectItem>
            <SelectItem value="supplier_document">Fornecedor</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="w-44 h-9" />
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="w-44 h-9" />
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-2">Quando</th>
              <th className="p-2">User</th>
              <th className="p-2">Role</th>
              <th className="p-2">Empresa</th>
              <th className="p-2">Tipo</th>
              <th className="p-2">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">A carregar…</td></tr>
            ) : (data?.rows ?? []).length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sem registos.</td></tr>
            ) : (data?.rows ?? []).map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 whitespace-nowrap">{format(new Date(r.downloaded_at), "dd/MM/yyyy HH:mm")}</td>
                <td className="p-2">{r.user_email}</td>
                <td className="p-2"><Badge variant="outline">{r.user_role}</Badge></td>
                <td className="p-2">{companies?.get(r.company_id) ?? r.company_id.slice(0, 8)}</td>
                <td className="p-2">{r.resource_type === "zip_export" ? "ZIP" : r.resource_type === "transaction_document" ? "Individual" : "Fornecedor"}</td>
                <td className="p-2">
                  {r.resource_type === "zip_export"
                    ? `ZIP ${r.period_from ?? "?"} → ${r.period_to ?? "?"} · ${r.extra_metadata?.document_count ?? "?"} anexos`
                    : (r.file_name ?? r.file_path ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{total} registos</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
          <span className="px-2 py-1">{page + 1} / {maxPage + 1}</span>
          <Button size="sm" variant="outline" disabled={page >= maxPage} onClick={() => setPage((p) => p + 1)}>Seguinte</Button>
        </div>
      </div>
    </div>
  );
}
