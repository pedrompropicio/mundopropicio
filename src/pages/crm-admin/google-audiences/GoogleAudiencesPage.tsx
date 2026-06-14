// Google Audiences — MP CRM (/crm/google-audiences).
// Customer Match: lê crm.google_user_list + crm.google_user_list_job, permite
// criar audiência em rascunho (com company_id resolvido do contexto), e
// disparar "Preparar membros" (crm-google-customer-match-sync) e "Criar no
// Google" (crm-google-user-list-ensure). Espelha o estilo Meta Audiences.
// RBAC: admin / marketing_manager / platform_admin.

import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  AlertTriangle,
  CloudUpload,
  Info,
  Loader2,
  Plus,
  UploadCloud,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  fmtNum,
  listStatusBadge,
  jobStatusBadge,
  extractEdgeError,
} from "@/lib/google-ads-format";

interface GoogleUserListRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  member_count: number | null;
  external_user_list_id: string | null;
  last_synced_at: string | null;
  raw: any;
  created_at: string;
}

interface GoogleUserListJobRow {
  id: string;
  user_list_id: string | null;
  operation: string;
  members_submitted: number | null;
  status: string;
  raw: any;
  created_at: string;
}

export default function GoogleAudiencesPage() {
  const { role, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!authLoading && role && !["admin", "marketing_manager", "platform_admin"].includes(role as any)) {
    return <Navigate to="/crm" replace />;
  }

  const listsQ = useQuery({
    queryKey: ["google-ads", "user_lists"],
    queryFn: async (): Promise<GoogleUserListRow[]> => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("google_user_list")
        .select("id, name, description, status, member_count, external_user_list_id, last_synced_at, raw, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GoogleUserListRow[];
    },
  });

  const jobsQ = useQuery({
    queryKey: ["google-ads", "user_list_jobs"],
    queryFn: async (): Promise<GoogleUserListJobRow[]> => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("google_user_list_job")
        .select("id, user_list_id, operation, members_submitted, status, raw, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as GoogleUserListJobRow[];
    },
  });

  const lists = listsQ.data ?? [];
  const jobs = jobsQ.data ?? [];

  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["google-ads", "user_lists"] }),
      qc.invalidateQueries({ queryKey: ["google-ads", "user_list_jobs"] }),
    ]);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Indica um nome para a audiência.");
      return;
    }
    if (!companyId) {
      toast.error("Empresa ativa não resolvida — recarrega a página.");
      return;
    }
    setCreating(true);
    try {
      const { error } = await (supabase as any)
        .schema("crm")
        .from("google_user_list")
        .insert({
          company_id: companyId,
          name,
          description: newDesc.trim() || null,
          status: "draft",
        });
      if (error) throw error;
      toast.success("Audiência criada em rascunho", {
        description: `"${name}" está pronta para preparar membros / criar no Google.`,
      });
      setNewName("");
      setNewDesc("");
      setShowForm(false);
      await refreshAll();
    } catch (e: any) {
      toast.error("Falha ao criar audiência", { description: e?.message ?? String(e) });
    } finally {
      setCreating(false);
    }
  };

  const handleEnsure = async (row: GoogleUserListRow) => {
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "crm-google-user-list-ensure",
        { body: { user_list_id: row.id } },
      );
      if (error) throw new Error(await extractEdgeError(error));
      const s: any = data ?? {};
      const created = Number(s.created ?? 0);
      const errs = Array.isArray(s.errors) ? s.errors : [];
      if (created > 0) {
        toast.success(`Audiência "${row.name}" criada no Google`, {
          description: `external_id: ${s.results?.[0]?.external_user_list_id ?? "—"}`,
        });
      } else if (errs.length > 0) {
        toast.warning("Google rejeitou a criação (gate de acesso)", {
          description: String(errs[0]).slice(0, 240),
        });
      } else {
        toast.info("Nada a criar", { description: "Linha já tinha external_user_list_id." });
      }
      await refreshAll();
    } catch (e: any) {
      toast.error("Falha ao criar no Google", { description: e?.message ?? String(e) });
    } finally {
      setBusyId(null);
    }
  };

  const handlePrepare = async (row: GoogleUserListRow) => {
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "crm-google-customer-match-sync",
        { body: { user_list_id: row.id } },
      );
      if (error) throw new Error(await extractEdgeError(error));
      const s: any = data ?? {};
      toast.success(`Membros preparados (${s.prepared ?? 0})`, {
        description: `Elegíveis: ${s.eligible ?? 0} · Hashed: ${s.hashed ?? 0} · Deduplicados: ${s.deduped ?? 0} · Transporte: ${s.transport ?? "—"}`,
      });
      await refreshAll();
    } catch (e: any) {
      toast.error("Falha a preparar membros", { description: e?.message ?? String(e) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header da página */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-emerald-600" />
          Google Audiences
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customer Match — listas de audiência sincronizadas para o Google Ads.
        </p>
      </div>

      {/* Banner de estado */}
      <Card className="border-sky-500/30 bg-sky-500/5">
        <CardContent className="pt-6 flex items-start gap-3 text-sm">
          <Info className="h-5 w-5 text-sky-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Estado actual do Customer Match</p>
            <p className="text-muted-foreground">
              A preparação de membros (elegibilidade + hashing) já funciona. A
              criação da lista no Google e o envio de membros estão pendentes
              de aprovação do acesso Basic à Google Ads API; o Customer Match
              depende ainda da Data Manager API e da elegibilidade da conta
              (histórico de gasto).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Acções topo */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Listas em <code className="text-xs bg-muted px-1 rounded">crm.google_user_list</code> + jobs em <code className="text-xs bg-muted px-1 rounded">crm.google_user_list_job</code>.
        </div>
        <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? "outline" : "default"} className="gap-2">
          <Plus className="h-4 w-4" />
          {showForm ? "Cancelar" : "Criar audiência"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova audiência (rascunho)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Nome</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Leads MP — consent_email"
                disabled={creating}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Descrição (opcional)</label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
                placeholder="Para que serve esta audiência?"
                disabled={creating}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleCreate} disabled={creating} className="gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creating ? "A criar…" : "Criar rascunho"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabela de listas */}
      {listsQ.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : listsQ.error ? (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-6 flex items-start gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Erro ao carregar audiências</p>
              <p className="text-muted-foreground">{(listsQ.error as any)?.message ?? String(listsQ.error)}</p>
            </div>
          </CardContent>
        </Card>
      ) : lists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Users className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Ainda não existem audiências. Carrega em <strong>Criar audiência</strong> para
              começar com um rascunho.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audiências Customer Match</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Membros</TableHead>
                    <TableHead>External ID</TableHead>
                    <TableHead>Última sync</TableHead>
                    <TableHead className="text-right">Acções</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lists.map((r) => {
                    const isBusy = busyId === r.id;
                    const errMsg = r.status === "error"
                      ? String(r.raw?.error ?? "").slice(0, 240)
                      : null;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          <div>{r.name}</div>
                          {r.description && (
                            <div className="text-xs text-muted-foreground">{r.description}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {errMsg ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">
                                  <Badge className={listStatusBadge(r.status)}>{r.status}</Badge>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md break-words">{errMsg}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Badge className={listStatusBadge(r.status)}>{r.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(r.member_count)}</TableCell>
                        <TableCell className="text-xs">
                          {r.external_user_list_id ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.last_synced_at
                            ? formatDistanceToNow(new Date(r.last_synced_at), { addSuffix: true, locale: ptBR })
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              disabled={isBusy}
                              onClick={() => handlePrepare(r)}
                            >
                              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                              Preparar membros
                            </Button>
                            <Button
                              size="sm"
                              className="gap-1.5"
                              disabled={isBusy || !!r.external_user_list_id}
                              onClick={() => handleEnsure(r)}
                            >
                              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                              Criar no Google
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          </CardContent>
        </Card>
      )}

      {/* Jobs recentes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jobs recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {jobsQ.isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Sem jobs até ao momento.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Operação</TableHead>
                  <TableHead className="text-right">Submetidos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Transporte</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="text-xs tabular-nums">
                      {format(new Date(j.created_at), "yyyy-MM-dd HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs">{j.operation}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(j.members_submitted)}</TableCell>
                    <TableCell><Badge className={jobStatusBadge(j.status)}>{j.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {j.raw?.transport ?? "—"}
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
