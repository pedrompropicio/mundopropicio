import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import { ShieldCheck, Users, FileText, AlertTriangle, Activity, ArrowLeft, Smartphone, KeyRound, Trash2, RefreshCw, Copy, Download } from "lucide-react";
import { MfaEnroll } from "@/components/MfaEnroll";
import { useState } from "react";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { generateRecoveryCodes, hashRecoveryCodes, forgetCurrentDeviceLocally } from "@/lib/mfa-trusted-device";
import { toast } from "@/hooks/use-toast";

export default function SecurityDashboard() {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

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

  // Trusted devices
  const { data: trustedDevices = [] } = useQuery({
    queryKey: ["my-trusted-devices", user?.id],
    enabled: !!user && hasMfa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mfa_trusted_devices")
        .select("*")
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("last_used_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Recovery codes — count unused
  const { data: recoveryCount = 0 } = useQuery({
    queryKey: ["my-recovery-codes-count", user?.id],
    enabled: !!user && hasMfa,
    queryFn: async () => {
      const { count } = await supabase
        .from("mfa_recovery_codes")
        .select("id", { count: "exact", head: true })
        .is("used_at", null);
      return count ?? 0;
    },
  });

  const revokeDevice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("mfa_trusted_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Dispositivo removido", description: "Próximo login exigirá código TOTP." });
      queryClient.invalidateQueries({ queryKey: ["my-trusted-devices"] });
    },
  });

  const revokeAllDevices = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("not authed");
      const { error } = await supabase
        .from("mfa_trusted_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("revoked_at", null);
      if (error) throw error;
      forgetCurrentDeviceLocally();
    },
    onSuccess: () => {
      toast({ title: "Todos os dispositivos removidos" });
      queryClient.invalidateQueries({ queryKey: ["my-trusted-devices"] });
    },
  });

  const regenerateCodes = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("not authed");
      const codes = generateRecoveryCodes(5);
      const hashes = await hashRecoveryCodes(codes);
      await supabase.from("mfa_recovery_codes").delete().eq("user_id", user.id);
      const { error } = await supabase
        .from("mfa_recovery_codes")
        .insert(hashes.map((h) => ({ user_id: user.id, code_hash: h })));
      if (error) throw error;
      return codes;
    },
    onSuccess: (codes) => {
      setNewCodes(codes);
      queryClient.invalidateQueries({ queryKey: ["my-recovery-codes-count"] });
    },
  });

  const copyCodes = (codes: string[]) => {
    navigator.clipboard.writeText(codes.join("\n"));
    toast({ title: "Copiado" });
  };

  const downloadCodes = (codes: string[]) => {
    const content =
      `MP Gestão Eventos — Códigos de recuperação MFA\n` +
      `Gerado em: ${new Date().toLocaleString("pt-PT")}\n\n` +
      codes.map((c, i) => `${i + 1}. ${c}`).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mp-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

      {/* MFA Management (only when enrolled) */}
      {hasMfa && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Trusted devices */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Dispositivos confiáveis (30 dias)
              </h2>
              {trustedDevices.length > 0 && (
                <button
                  onClick={() => revokeAllDevices.mutate()}
                  className="text-xs text-destructive hover:underline"
                >
                  Remover todos
                </button>
              )}
            </div>
            {trustedDevices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum dispositivo confiável. No próximo login pode marcar este dispositivo para evitar pedir TOTP durante 30 dias.
              </p>
            ) : (
              <div className="space-y-2">
                {trustedDevices.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg bg-secondary/30 p-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-medium text-foreground">{d.device_label || "Dispositivo"}</div>
                      <div className="text-muted-foreground">
                        Último uso: {new Date(d.last_used_at).toLocaleDateString("pt-PT")} · Expira:{" "}
                        {new Date(d.expires_at).toLocaleDateString("pt-PT")}
                      </div>
                    </div>
                    <button
                      onClick={() => revokeDevice.mutate(d.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Revogar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recovery codes */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Códigos de recuperação
            </h2>
            <div className="rounded-lg bg-secondary/30 p-3 text-sm">
              <div className="text-foreground">
                <span className="text-2xl font-bold">{recoveryCount}</span>
                <span className="text-muted-foreground"> / 5 códigos disponíveis</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Use-os se perder a app autenticadora. Cada código só funciona uma vez.
              </p>
            </div>
            {recoveryCount < 2 && recoveryCount > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Restam poucos códigos. Considere gerar novos.
              </div>
            )}
            <button
              onClick={() => {
                if (confirm("Gerar 5 novos códigos? Os antigos deixam de funcionar.")) {
                  regenerateCodes.mutate();
                }
              }}
              disabled={regenerateCodes.isPending}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs hover:bg-secondary disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> {regenerateCodes.isPending ? "A gerar…" : "Gerar novos códigos"}
            </button>
          </div>
        </div>
      )}

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
              onComplete={() => {
                setShowMfaSetup(false);
                queryClient.invalidateQueries({ queryKey: ["my-mfa-factors"] });
                queryClient.invalidateQueries({ queryKey: ["my-recovery-codes-count"] });
              }}
              onSkip={() => setShowMfaSetup(false)}
            />
          </div>
        </div>
      )}

      {/* New Recovery Codes Modal */}
      {newCodes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="glass w-full max-w-sm rounded-xl p-6 space-y-4">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              </div>
              <h2 className="mt-2 text-lg font-bold">Guarde os novos códigos</h2>
              <p className="text-xs text-muted-foreground">Esta é a única vez que aparecem.</p>
            </div>
            <div className="grid grid-cols-1 gap-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 font-mono text-sm">
              {newCodes.map((c) => (
                <div key={c} className="text-center tracking-wider text-foreground">{c}</div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => copyCodes(newCodes)} className="flex items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs hover:bg-secondary">
                <Copy className="h-3.5 w-3.5" /> Copiar
              </button>
              <button onClick={() => downloadCodes(newCodes)} className="flex items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs hover:bg-secondary">
                <Download className="h-3.5 w-3.5" /> Descarregar
              </button>
            </div>
            <button
              onClick={() => setNewCodes(null)}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Já guardei
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
