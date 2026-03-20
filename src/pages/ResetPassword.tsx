import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Music2 } from "lucide-react";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      console.log("[ResetPassword] onAuthStateChange:", event, !!session);
      if (
        event === "PASSWORD_RECOVERY" ||
        event === "SIGNED_IN" ||
        (event === "INITIAL_SESSION" && session)
      ) {
        setReady(true);
      }
    });

    // Also poll getSession for cases where events already fired
    const poll = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      console.log("[ResetPassword] getSession poll:", !!session);
      if (isMounted && session) setReady(true);
    };

    void poll();
    const retryTimers = [500, 1500, 3000].map((d) =>
      window.setTimeout(() => void poll(), d)
    );

    // After 6s with no session, show timeout message instead of staying stuck
    const fallback = window.setTimeout(() => {
      if (isMounted) setTimedOut(true);
    }, 6000);

    return () => {
      isMounted = false;
      retryTimers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }

    setLoading(true);

    // Try getSession with a small retry to handle timing edge cases
    let session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      await new Promise((r) => setTimeout(r, 1000));
      session = (await supabase.auth.getSession()).data.session;
    }

    if (!session) {
      toast({
        title: "Sessão expirada",
        description: "O link pode ter expirado. Solicite um novo link de recuperação.",
        variant: "destructive",
      });
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

  const showForm = ready;
  const showExpired = !ready && timedOut;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary glow-primary">
            <Music2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Definir Nova Senha</h1>
          <p className="text-sm text-muted-foreground">
            {showForm
              ? "Introduza a sua nova senha"
              : showExpired
              ? "O link de recuperação expirou ou é inválido."
              : "A verificar link de recuperação…"}
          </p>
        </div>

        {showExpired && (
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

        {showForm && (
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
