import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Music2 } from "lucide-react";

type ResetStatus = "loading" | "ready" | "expired";

function getErrorFromUrl() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(window.location.search);
  const getParam = (key: string) => queryParams.get(key) ?? hashParams.get(key);
  return {
    errorCode: getParam("error_code") ?? getParam("error"),
    errorDescription: getParam("error_description"),
  };
}

function mapRecoveryError(message?: string | null) {
  const normalized = String(message ?? "").toLowerCase();
  if (/code verifier|auth code/i.test(normalized)) {
    return "Abra o link no mesmo browser e dispositivo onde pediu a recuperação da senha.";
  }
  if (/expired|invalid|otp|one-time token not found|email link is invalid/i.test(normalized)) {
    return "O link de recuperação expirou, já foi usado, ou ficou inválido. Solicite um novo link.";
  }
  return "Não foi possível validar o link de recuperação. Solicite um novo link.";
}

export function LinkResetForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ResetStatus>("loading");
  const [statusDetail, setStatusDetail] = useState("A verificar link de recuperação…");
  const navigate = useNavigate();
  const resolvedRef = useRef(false);

  useEffect(() => {
    const { errorCode, errorDescription } = getErrorFromUrl();
    if (errorCode || errorDescription) {
      setStatus("expired");
      setStatusDetail(mapRecoveryError(errorDescription || errorCode));
      window.history.replaceState({}, document.title, "/reset-password");
      return;
    }

    const markReady = () => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      window.history.replaceState({}, document.title, "/reset-password");
      setStatus("ready");
      setStatusDetail("Introduza a sua nova senha");
    };

    const markExpired = (message: string) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setStatus("expired");
      setStatusDetail(message);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
        markReady();
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) markReady();
    });

    const timeout = window.setTimeout(() => {
      if (!resolvedRef.current) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            markReady();
          } else {
            markExpired("A validação do link demorou demasiado. Solicite um novo link.");
          }
        });
      }
    }, 20000);

    return () => {
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

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
      setStatusDetail("A sessão de recuperação já não está ativa. Solicite um novo link.");
      toast({ title: "Erro", description: "Sessão expirada. Solicite um novo link.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ title: "Erro", description: mapRecoveryError(error.message), variant: "destructive" });
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

        {status === "loading" && (
          <div className="glass rounded-xl p-6 text-center">
            <div className="animate-pulse text-sm text-muted-foreground">A processar link de recuperação…</div>
          </div>
        )}

        {status === "expired" && (
          <div className="glass rounded-xl p-6 space-y-4 text-center">
            <p className="text-sm text-muted-foreground">Solicite um novo código na página de login.</p>
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
