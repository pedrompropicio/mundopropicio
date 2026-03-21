import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Music2 } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { MfaVerify } from "@/components/MfaVerify";
import { PasswordStrengthIndicator, validatePassword } from "@/components/PasswordStrengthIndicator";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot" | "otp" | "new-password" | "mfa">("login");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Erro ao entrar", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    // Check if MFA is required
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasTotp = factors?.totp && factors.totp.length > 0;
    if (hasTotp) {
      setMode("mfa");
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
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setMode("otp");
      toast({ title: "Código enviado", description: "Verifique o seu email para o código de 6 dígitos." });
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      toast({ title: "Erro", description: "Introduza o código de 6 dígitos.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode,
      type: "recovery",
    });
    if (error) {
      toast({ title: "Código inválido", description: "O código está incorreto ou expirou. Tente novamente.", variant: "destructive" });
    } else {
      setMode("new-password");
      toast({ title: "Código verificado", description: "Defina a sua nova senha." });
    }
    setLoading(false);
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Erro", description: "A senha deve ter no mínimo 6 caracteres.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Senha atualizada!", description: "Pode agora entrar com a nova senha." });
      await supabase.auth.signOut();
      setMode("login");
      setOtpCode("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setLoading(false);
  };

  const resetToLogin = () => {
    setMode("login");
    setOtpCode("");
    setNewPassword("");
    setConfirmPassword("");
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
            {mode === "login" && "Entre na sua conta"}
            {mode === "forgot" && "Recuperar senha"}
            {mode === "otp" && "Introduza o código"}
            {mode === "new-password" && "Definir nova senha"}
            {mode === "mfa" && "Verificação de segurança"}
          </p>
        </div>

        {mode === "login" && (
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
              onClick={() => { setMode("forgot"); }}
              className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Esqueceu a senha?
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form onSubmit={handleForgotPassword} className="glass rounded-xl p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Introduza o email associado à sua conta para receber um código de recuperação.
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
              {loading ? "A enviar…" : "Enviar código de recuperação"}
            </button>
            <button
              type="button"
              onClick={resetToLogin}
              className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Voltar ao login
            </button>
          </form>
        )}

        {mode === "otp" && (
          <form onSubmit={handleVerifyOtp} className="glass rounded-xl p-6 space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Introduza o código de 6 dígitos enviado para <strong className="text-foreground">{email}</strong>
            </p>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 glow-primary"
            >
              {loading ? "A verificar…" : "Verificar código"}
            </button>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleForgotPassword as any}
                disabled={loading}
                className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Reenviar código
              </button>
              <button
                type="button"
                onClick={resetToLogin}
                className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Voltar ao login
              </button>
            </div>
          </form>
        )}

        {mode === "new-password" && (
          <form onSubmit={handleSetNewPassword} className="glass rounded-xl p-6 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nova senha</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
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

        {mode === "mfa" && (
          <div className="glass rounded-xl p-6">
            <MfaVerify
              onVerified={() => {
                toast({ title: "Autenticado!", description: "Verificação 2FA concluída." });
              }}
              onCancel={async () => {
                await supabase.auth.signOut();
                resetToLogin();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
