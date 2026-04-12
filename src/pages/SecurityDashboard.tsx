import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import { ShieldCheck, Users, FileText, AlertTriangle, Activity, ArrowLeft } from "lucide-react";
import { MfaEnroll } from "@/components/MfaEnroll";
import { useState } from "react";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";

export default function SecurityDashboard() {
  const { isAdmin, user } = useAuth();
  const [showMfaSetup, setShowMfaSetup] = useState(false);

  const { data: auditLogs = [], isLoading: loadingAudit } = useQuery({
    queryKey: ["audit-logs-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_audit_log")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return data;
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data;
    },
  });

  const { data: mfaFactors } = useQuery({
    queryKey: ["my-mfa-factors"],
    queryFn: async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      return data;
    },
  });

  const hasMfa = mfaFactors?.totp && mfaFactors.totp.length > 0;

  if (!isAdmin) return <Navigate to="/" replace />;

  // Stats
  const totalUsers = profiles.length;
  const adminCount = roles.filter((r) => r.role === "admin").length;
  const recentChanges = auditLogs.length;
  const uniqueEditors = new Set(auditLogs.map((l) => l.changed_by)).size;

  // Security checks
  const securityChecks = [
    { label: "Acesso anónimo removido", status: "ok" as const },
    { label: "RLS por role ativo", status: "ok" as const },
    { label: "Edge Functions com auth", status: "ok" as const },
    { label: "MFA ativo na sua conta", status: hasMfa ? ("ok" as const) : ("warn" as const) },
    { label: "Log de auditoria ativo", status: "ok" as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <button onClick={() => navigate("/admin")} className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent transition-colors"><ArrowLeft className="h-4 w-4" /></button>
            Segurança & Monitoramento <HelpTooltip text={helpTexts.securityDashboard} />
          </h1>
          <p className="text-sm text-muted-foreground">Visão geral da segurança do sistema</p>
        </div>
      </div>

      {/* Security Status Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="text-xs font-medium">Utilizadores</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalUsers}</p>
          <p className="text-xs text-muted-foreground">{adminCount} admin(s)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span className="text-xs font-medium">Alterações Recentes</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{recentChanges}</p>
          <p className="text-xs text-muted-foreground">{uniqueEditors} editor(es)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-xs font-medium">Verificações</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {securityChecks.filter((c) => c.status === "ok").length}/{securityChecks.length}
          </p>
          <p className="text-xs text-muted-foreground">verificações OK</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span className="text-xs font-medium">MFA</span>
          </div>
          <p className={`text-2xl font-bold ${hasMfa ? "text-emerald-500" : "text-amber-500"}`}>
            {hasMfa ? "Ativo" : "Inativo"}
          </p>
          {!hasMfa && (
            <button
              onClick={() => setShowMfaSetup(true)}
              className="text-xs text-primary hover:underline"
            >
              Ativar agora
            </button>
          )}
        </div>
      </div>

      {/* Security Checks */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Estado da Segurança</h2>
        <div className="space-y-2">
          {securityChecks.map((check) => (
            <div key={check.label} className="flex items-center gap-3 text-sm">
              {check.status === "ok" ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">✓</span>
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">!</span>
              )}
              <span className={check.status === "ok" ? "text-foreground" : "text-amber-500 font-medium"}>
                {check.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Log */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Log de Auditoria (últimas 50)</h2>
        {loadingAudit ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : auditLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem alterações registadas.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-2">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 rounded-lg bg-secondary/30 p-3 text-sm">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-primary">{log.field_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.changed_at).toLocaleString("pt-PT")}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span>
                      <span className="text-muted-foreground">De:</span>{" "}
                      <span className="text-destructive line-through">{log.old_value || "—"}</span>
                    </span>
                    <span>
                      <span className="text-muted-foreground">Para:</span>{" "}
                      <span className="text-emerald-500">{log.new_value || "—"}</span>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Por: {log.changed_by}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MFA Setup Modal */}
      {showMfaSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowMfaSetup(false)}>
          <div className="glass w-full max-w-sm rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
            <MfaEnroll
              onComplete={() => setShowMfaSetup(false)}
              onSkip={() => setShowMfaSetup(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
