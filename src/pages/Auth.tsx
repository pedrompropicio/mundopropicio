import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Music2 } from "lucide-react";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Erro ao entrar", description: error.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: "Erro", description: "Introduza o seu email.", variant: "destructive" });
      return;
    }
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setForgotSent(true);
      toast({ title: "Email enviado", description: "Verifique a sua caixa de entrada para redefinir a senha." });
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
          <h1 className="text-2xl font-bold text-foreground">Mundo Propício</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? "Entre na sua conta" : "Recuperar senha"}
          </p>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleSubmit} className="glass rounded-xl p-6 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Palavra-passe</label>
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
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 glow-primary"
            >
              {loading ? "A processar…" : "Entrar"}
            </button>
            <button
              type="button"
              onClick={() => { setMode("forgot"); setForgotSent(false); }}
              className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Esqueceu a senha?
            </button>
          </form>
        ) : (
          <div className="glass rounded-xl p-6 space-y-4">
            {forgotSent ? (
              <div className="text-center space-y-3">
                <p className="text-sm text-foreground">
                  Foi enviado um email para <strong>{email}</strong> com instruções para redefinir a sua senha.
                </p>
                <p className="text-xs text-muted-foreground">
                  Verifique também a pasta de spam.
                </p>
                <button
                  onClick={() => { setMode("login"); setForgotSent(false); }}
                  className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
                >
                  Voltar ao login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Introduza o email associado à sua conta para receber um link de recuperação.
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="email@exemplo.com"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 glow-primary"
                >
                  {loading ? "A enviar…" : "Enviar link de recuperação"}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Voltar ao login
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
