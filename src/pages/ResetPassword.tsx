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
  const getParam = (key: string) => queryParams.get(key) ?? hashParams.get(key);

  return {
    code: getParam("code"),
    tokenHash: getParam("token_hash"),
    type: getParam("type") as EmailOtpType | null,
    accessToken: getParam("access_token"),
    refreshToken: getParam("refresh_token"),
    errorCode: getParam("error_code"),
    errorDescription: getParam("error_description"),
  };
}

function clearRecoveryParams() {
  window.history.replaceState({}, document.title, "/reset-password");
}

function mapRecoveryError(message?: string | null) {
  const normalized = String(message ?? "").toLowerCase();

  if (/code verifier|both auth code and code verifier|auth code/i.test(normalized)) {
    return "Abra o link no mesmo browser e dispositivo onde pediu a recuperação da senha.";
  }

  if (/expired|invalid|otp|one-time token not found|email link is invalid/i.test(normalized)) {
    return "O link de recuperação expirou, já foi usado, ou ficou inválido. Solicite um novo link.";
  }

  if (/timeout|demor/i.test(normalized)) {
    return "Não foi possível validar o link a tempo. Solicite um novo link e abra-o apenas uma vez.";
  }

  return "Não foi possível validar o link de recuperação. Solicite um novo link.";
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
      console.log("[ResetPassword] auth event", event, { hasSession: !!session });

      if (!isMounted) return;

      if (
        session &&
        (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")
      ) {
        markReady();
      }
    });

    const initializeRecovery = async () => {
      const { code, tokenHash, type, accessToken, refreshToken, errorCode, errorDescription } = recoveryParams;

      console.log("[ResetPassword] init", {
        hasCode: !!code,
        hasTokenHash: !!tokenHash,
        type,
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        errorCode,
        hasErrorDescription: !!errorDescription,
      });

      if (errorCode || errorDescription) {
        markExpired(mapRecoveryError(errorDescription || errorCode));
        return;
      }

      const { data: { session: existingSession } } = await supabase.auth.getSession();
      if (existingSession) {
        console.log("[ResetPassword] existing session found");
        markReady();
        return;
      }

      try {
        if (accessToken && refreshToken) {
          console.log("[ResetPassword] applying session from url tokens");
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (code) {
          console.log("[ResetPassword] exchanging code for session");
          const result = await Promise.race([
            supabase.auth.exchangeCodeForSession(code),
            new Promise<{ error: Error }>((resolve) =>
              window.setTimeout(() => resolve({ error: new Error("exchange timeout") }), 6000)
            ),
          ]);
          if (result.error) throw result.error;
        } else if (tokenHash && type === "recovery") {
          console.log("[ResetPassword] verifying otp from token_hash");
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (error) throw error;
        }

        const delays = [0, 250, 750, 1500, 3000];
        for (const delay of delays) {
          if (delay > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, delay));
          }

          const { data: { session } } = await supabase.auth.getSession();
          console.log("[ResetPassword] poll session", { delay, hasSession: !!session });

          if (session) {
            markReady();
            return;
          }
        }

        if (code || tokenHash || accessToken || refreshToken) {
          markExpired("O link foi consumido mas a sessão de recuperação não ficou disponível. Solicite um novo link e abra-o apenas uma vez.");
          return;
        }

        markExpired("Abra novamente o link recebido no email para redefinir a senha.");
      } catch (error: any) {
        console.log("[ResetPassword] init error", error?.message ?? error);
        markExpired(mapRecoveryError(error?.message));
      }
    };

    void initializeRecovery();

    return () => {
      isMounted = false;
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

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      const mappedMessage = mapRecoveryError(error.message);
      if (/sess|auth|expired|invalid|otp|token/i.test(error.message)) {
        setStatus("expired");
        setStatusDetail(mappedMessage);
      }
      toast({ title: "Erro", description: mappedMessage, variant: "destructive" });
      setLoading(false);
      return;
    }

    toast({ title: "Senha atualizada!", description: "Pode agora entrar com a nova senha." });
    await supabase.auth.signOut();
    navigate("/login");
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
