import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ShieldCheck, KeyRound } from "lucide-react";
import { trustCurrentDevice, consumeRecoveryCode } from "@/lib/mfa-trusted-device";

interface Props {
  onVerified: () => void;
  onCancel: () => void;
}

export function MfaVerify({ onVerified, onCancel }: Props) {
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [trustDevice, setTrustDevice] = useState(true);
  const [mode, setMode] = useState<"totp" | "recovery">("totp");

  const completeWithTrust = async () => {
    if (trustDevice) {
      try {
        await trustCurrentDevice();
      } catch {
        // não bloqueia login se trust falhar
      }
    }
    onVerified();
  };

  const handleVerifyTotp = async () => {
    if (code.length !== 6) return;
    setLoading(true);

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (!totp) {
      toast({ title: "Erro", description: "Fator MFA não encontrado.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (challengeError) {
      toast({ title: "Erro", description: challengeError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: totp.id,
      challengeId: challenge.id,
      code,
    });

    if (verifyError) {
      toast({ title: "Código inválido", description: "Tente novamente ou use um código de recuperação.", variant: "destructive" });
      setCode("");
      setLoading(false);
      return;
    }

    await completeWithTrust();
    setLoading(false);
  };

  const handleVerifyRecovery = async () => {
    const trimmed = recoveryCode.trim();
    if (trimmed.length < 8) return;
    setLoading(true);
    const ok = await consumeRecoveryCode(trimmed);
    if (!ok) {
      toast({ title: "Código inválido", description: "O código está errado ou já foi usado.", variant: "destructive" });
      setLoading(false);
      return;
    }
    toast({
      title: "Código aceite",
      description: "Recomendamos gerar novos códigos em Segurança após entrar.",
    });
    await completeWithTrust();
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
          {mode === "totp" ? <ShieldCheck className="h-6 w-6 text-primary" /> : <KeyRound className="h-6 w-6 text-primary" />}
        </div>
        <h2 className="text-lg font-bold">
          {mode === "totp" ? "Verificação 2FA" : "Código de recuperação"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {mode === "totp"
            ? "Introduza o código de 6 dígitos da sua app autenticadora"
            : "Introduza um dos 5 códigos que guardou ao ativar 2FA"}
        </p>
      </div>

      {mode === "totp" ? (
        <>
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={code} onChange={setCode}>
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
            onClick={handleVerifyTotp}
            disabled={loading || code.length !== 6}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "A verificar…" : "Verificar"}
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX"
            autoComplete="off"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center font-mono text-sm tracking-wider text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={handleVerifyRecovery}
            disabled={loading || recoveryCode.trim().length < 8}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "A verificar…" : "Usar código"}
          </button>
        </>
      )}

      <label className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={trustDevice}
          onChange={(e) => setTrustDevice(e.target.checked)}
          className="rounded border-border"
        />
        Confiar neste dispositivo durante 30 dias
      </label>

      <div className="flex items-center justify-between text-xs">
        <button
          onClick={() => setMode(mode === "totp" ? "recovery" : "totp")}
          className="text-primary hover:underline"
        >
          {mode === "totp" ? "Perdi acesso à app" : "Voltar ao código TOTP"}
        </button>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          Cancelar
        </button>
      </div>
    </div>
  );
}
