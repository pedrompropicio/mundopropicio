import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ShieldAlert } from "lucide-react";
// Note: trusted-device skip aplica-se ao desafio de login (Auth.tsx).
// Aqui apenas verificamos se o utilizador tem MFA registado.

/**
 * Bloqueia admin / platform_admin sem MFA TOTP registado.
 * Redireciona para /admin/seguranca onde podem registar.
 * Permite acesso à própria página de segurança e à página de auth.
 */
export function MfaRequiredGate({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [hasMfa, setHasMfa] = useState(true); // assume true para não piscar

  const isAdminRole = role === "admin" || role === "platform_admin";
  const isOnSecurityPage = location.pathname.startsWith("/admin/seguranca");

  useEffect(() => {
    if (loading || !user || !isAdminRole) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (cancelled) return;
        if (error) {
          // falha silenciosa: não bloqueia
          setHasMfa(true);
        } else {
          const verified = (data?.totp ?? []).some((f: any) => f.status === "verified");
          setHasMfa(verified);
        }
      } catch {
        if (!cancelled) setHasMfa(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loading, user, isAdminRole]);

  if (loading || checking || !isAdminRole || hasMfa || isOnSecurityPage) {
    return <>{children}</>;
  }

  // Admin sem MFA → ecrã obrigatório com redirect
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15">
        <ShieldAlert className="h-8 w-8 text-destructive" />
      </div>
      <h1 className="text-2xl font-semibold">Autenticação de dois fatores obrigatória</h1>
      <p className="max-w-md text-center text-muted-foreground">
        Como administrador, precisa configurar um segundo fator (app autenticadora) antes de continuar a usar o MP Gestão Eventos.
      </p>
      <Navigate to="/admin/seguranca" replace />
    </div>
  );
}
