import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Music2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryDetected, setRecoveryDetected] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Detect PASSWORD_RECOVERY event specifically
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      console.log("[ResetPassword] auth event:", event);
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryDetected(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Consider ready when we have a session (from AuthContext) — either via recovery or any auth state
  const ready = !authLoading && !!session;

  // Timeout fallback
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTimedOut(true);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, []);

  const showForm = ready;
  const showExpired = !ready && !authLoading && timedOut;
  const showLoading = !ready && !showExpired;

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
