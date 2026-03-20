import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Music2 } from "lucide-react";
import type { EmailOtpType } from "@supabase/supabase-js";

type ResetStatus = "loading" | "ready" | "expired";

function getRecoveryParams() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(window.location.search);

  return {
    code: queryParams.get("code"),
    tokenHash: queryParams.get("token_hash"),
    type: (queryParams.get("type") || hashParams.get("type")) as EmailOtpType | null,
    accessToken: hashParams.get("access_token"),
    refreshToken: hashParams.get("refresh_token"),
  };
}

function clearRecoveryParams() {
  window.history.replaceState({}, document.title, "/reset-password");
}

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ResetStatus>("loading");
  const [statusDetail, setStatusDetail] = useState("A verificar link de recuperação…");
  const navigate = useNavigate();

  const recoveryParams = useMemo(() => getRecoveryParams(), []);

  useEffect(() => {
    let isMounted = true;

    const markReady = () => {
      if (!isMounted) return;
      clearRecoveryParams();
      setStatus("ready");
      setStatusDetail("Introduza a sua nova senha");
    };

    const markExpired = (message?: string) => {
      if (!isMounted) return;
      setStatus("expired");
      setStatusDetail(message ?? "O link de recuperação expirou ou é inválido.");
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (
        (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
        session
      ) {
        markReady();
      }
    });

    const initializeRecovery = async () => {
      const { data: { session: existingSession } } = await supabase.auth.getSession();
      if (existingSession) {
        markReady();
        return;
      }

      const { code, tokenHash, type, accessToken, refreshToken } = recoveryParams;
      const hasRecoveryPayload = Boolean(code || tokenHash || (accessToken && refreshToken));

      if (!hasRecoveryPayload) {
        markExpired("Abra novamente o link recebido no email para redefinir a senha.");
        return;
      }

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type === "recovery") {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else {
          markExpired("O link de recuperação está incompleto ou inválido.");
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          markReady();
          return;
        }

        markExpired("Não foi possível validar o link de recuperação.");
      } catch (error: any) {
        const message = String(error?.message ?? "");
        const openedInDifferentBrowser = /code verifier|auth code|both auth code and code verifier/i.test(message);
        const expiredToken = /expired|invalid|otp/i.test(message);

        if (openedInDifferentBrowser) {
          markExpired("Abra o link no mesmo browser e dispositivo onde pediu a recuperação da senha.");
          return;
        }

        if (expiredToken) {
          markExpired("O link de recuperação expirou ou já foi usado. Solicite um novo link.");
          return;
        }

        markExpired("Não foi possível validar o link de recuperação. Solicite um novo link.");
      }
    };

    void initializeRecovery();

    const timeout = window.setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        markExpired("A validação do link demorou demasiado. Solicite um novo link.");
      }
    }, 10000);

    return () => {
      isMounted = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [recoveryParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }

    if (password.length < 6) {
      toast({ title: "Erro", description: "A senha deve ter no mínimo 6 caracteres.", variant: "destructive" });
      return;
    }

    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setStatus("expired");
      setStatusDetail("A sessão de recuperação expirou. Solicite um novo link.");
      toast({ title: "Sessão expirada", description: "Solicite um novo link de recuperação.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Senha atualizada!", description: "Pode agora entrar com a nova senha." });
      await supabase.auth.signOut();
      navigate("/login");
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary glow-primary">
            <Music2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Definir Nova Senha</h1>
          <p className="text-center text-sm text-muted-foreground">{statusDetail}</p>
        </div>

        {status === "expired" && (
          <div className="glass rounded-xl p-6 space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Solicite um novo link na página de login.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
            >
              Voltar ao login
            </button>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit} className="glass rounded-xl p-6 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nova senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Confirmar senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 glow-primary"
            >
              {loading ? "A processar…" : "Definir senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
