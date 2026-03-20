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
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const checkReady = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (session) {
        setReady(true);
        return true;
      }
      return false;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (
        event === "PASSWORD_RECOVERY" ||
        event === "SIGNED_IN" ||
        (event === "INITIAL_SESSION" && session)
      ) {
        setReady(true);
      }
    });

    // Check immediately, then retry a few times in case of race condition
    void checkReady();
    const retryTimers = [300, 800, 2000, 4000].map((delay) =>
      window.setTimeout(() => void checkReady(), delay)
    );

    // Ultimate fallback: show the form after 5s so the user isn't stuck forever
    const fallbackTimer = window.setTimeout(() => {
      if (isMounted && !ready) {
        setReady(true);
      }
    }, 5000);

    return () => {
      isMounted = false;
      retryTimers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(fallbackTimer);
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
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      toast({
        title: "Link inválido ou expirado",
        description: "Abra novamente o link do email para definir a senha.",
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary glow-primary">
            <Music2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Definir Nova Senha</h1>
          <p className="text-sm text-muted-foreground">
            {ready ? "Introduza a sua nova senha" : "A verificar link de recuperação…"}
          </p>
        </div>

        {ready && (
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
