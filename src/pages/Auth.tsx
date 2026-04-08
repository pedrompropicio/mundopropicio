import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/audit";
import { Music2, Lock } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { MfaVerify } from "@/components/MfaVerify";
import { PasswordStrengthIndicator, validatePassword } from "@/components/PasswordStrengthIndicator";

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATIONS = [30, 60, 120, 300]; // seconds – escalating
const RECOVERY_OTP_LENGTH = 8;

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot" | "otp" | "new-password" | "mfa">("login");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Brute-force protection
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutCount, setLockoutCount] = useState(0);
  const lockoutTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  const startLockout = useCallback(() => {
    const duration = LOCKOUT_DURATIONS[Math.min(lockoutCount, LOCKOUT_DURATIONS.length - 1)];
    const until = Date.now() + duration * 1000;
    setLockoutUntil(until);
    setLockoutCount((c) => c + 1);
    setLockoutRemaining(duration);

    if (lockoutTimer.current) clearInterval(lockoutTimer.current);
    lockoutTimer.current = setInterval(() => {
      const remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutUntil(null);
        setLockoutRemaining(0);
        setFailedAttempts(0);
        if (lockoutTimer.current) clearInterval(lockoutTimer.current);
      } else {
        setLockoutRemaining(remaining);
      }
    }, 1000);
  }, [lockoutCount]);

  const isLocked = lockoutUntil !== null && Date.now() < lockoutUntil;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      toast({ title: "Conta bloqueada", description: `Aguarde ${lockoutRemaining}s antes de tentar novamente.`, variant: "destructive" });
      return;
    }
    setLoading(true);

    // Server-side rate limit check
    try {
      const { data: rateCheck } = await supabase.functions.invoke("check-login-rate", {
        body: { email, action: "check" },
      });
      if (rateCheck?.blocked) {
        toast({
          title: "Acesso bloqueado",
          description: "Demasiadas tentativas. Aguarde 15 minutos antes de tentar novamente.",
          variant: "destructive",
        });
        startLockout();
        setLoading(false);
        return;
      }
    } catch {
      // If rate-limit check fails, continue with client-side protection
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);

      // Record failure server-side (also triggers alerts if threshold reached)
      try {
        await supabase.functions.invoke("check-login-rate", {
          body: { email, action: "record_failure" },
        });
      } catch {
        // Silently fail - client-side protection still active
      }

      // Log failed attempt to audit
      logAudit({
        entity_type: "auth",
        entity_id: email,
        action: "login_failed",
        changed_by: email,
        metadata: { attempt: newAttempts, error: error.message },
      });

      if (newAttempts >= MAX_ATTEMPTS) {
        startLockout();

        logAudit({
          entity_type: "auth",
          entity_id: email,
          action: "account_locked",
          changed_by: email,
          metadata: { attempts: newAttempts, lockout_count: lockoutCount + 1 },
        });

        toast({
          title: "Conta bloqueada temporariamente",
          description: `Demasiadas tentativas falhadas. Aguarde antes de tentar novamente.`,
          variant: "destructive",
        });
      } else {
        const remaining = MAX_ATTEMPTS - newAttempts;
        toast({
          title: "Erro ao entrar",
          description: `Credenciais inválidas. ${remaining} tentativa(s) restante(s).`,
          variant: "destructive",
        });
      }
      setLoading(false);
      return;
    }

    // Record success server-side
    try {
      await supabase.functions.invoke("check-login-rate", {
        body: { email, action: "record_success" },
      });
    } catch {
      // Silently fail
    }

    // Reset on success
    setFailedAttempts(0);
    setLockoutCount(0);
    // Check if MFA is required
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasTotp = factors?.totp && factors.totp.length > 0;
    if (hasTotp) {
      setMode("mfa");
    }
    setLoading(false);
  };

  const sendRecoveryCode = async () => {
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
      toast({ title: "Código enviado", description: `Verifique o seu email para o código de ${RECOVERY_OTP_LENGTH} dígitos.` });
    }

    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendRecoveryCode();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== RECOVERY_OTP_LENGTH) {
      toast({ title: "Erro", description: `Introduza o código de ${RECOVERY_OTP_LENGTH} dígitos.`, variant: "destructive" });
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
    const pwError = validatePassword(newPassword);
    if (pwError) {
      toast({ title: "Erro", description: pwError, variant: "destructive" });
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
          <h1 className="text-2xl font-bold text-foreground">MP Gestão Eventos</h1>
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
            {isLocked && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                <Lock className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-xs text-destructive font-medium">
                  Conta bloqueada. Tente novamente em {lockoutRemaining}s
                </p>
              </div>
            )}
            {!isLocked && failedAttempts > 0 && failedAttempts < MAX_ATTEMPTS && (
              <p className="text-xs text-amber-500 text-center">
                {MAX_ATTEMPTS - failedAttempts} tentativa(s) restante(s)
              </p>
            )}
            <button
              type="submit"
              disabled={loading || isLocked}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 glow-primary"
            >
              {loading ? "A processar…" : isLocked ? `Bloqueado (${lockoutRemaining}s)` : "Entrar"}
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
              Introduza o código de {RECOVERY_OTP_LENGTH} dígitos enviado para <strong className="text-foreground">{email}</strong>
            </p>
            <div className="flex justify-center overflow-x-auto">
              <InputOTP maxLength={RECOVERY_OTP_LENGTH} value={otpCode} onChange={setOtpCode}>
                <InputOTPGroup>
                  {Array.from({ length: RECOVERY_OTP_LENGTH }, (_, index) => (
                    <InputOTPSlot key={index} index={index} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <button
              type="submit"
              disabled={loading || otpCode.length !== RECOVERY_OTP_LENGTH}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 glow-primary"
            >
              {loading ? "A verificar…" : "Verificar código"}
            </button>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void sendRecoveryCode()}
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
                minLength={8}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="••••••••"
              />
              <PasswordStrengthIndicator password={newPassword} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Confirmar senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
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
