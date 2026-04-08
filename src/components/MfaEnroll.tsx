import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ShieldCheck, Copy } from "lucide-react";

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
}

export function MfaEnroll({ onComplete, onSkip }: Props) {
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [step, setStep] = useState<"intro" | "scan" | "verify">("intro");
  const [loading, setLoading] = useState(false);

  const startEnroll = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "MP Gestão Eventos App",
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setFactorId(data.id);
    setStep("scan");
    setLoading(false);
  };

  const verifyEnrollment = async () => {
    if (verifyCode.length !== 6) return;
    setLoading(true);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      toast({ title: "Erro", description: challengeError.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: verifyCode,
    });
    if (verifyError) {
      toast({ title: "Código inválido", description: "Tente novamente.", variant: "destructive" });
      setVerifyCode("");
      setLoading(false);
      return;
    }
    toast({ title: "MFA ativado!", description: "A sua conta está agora protegida com autenticação de dois fatores." });
    onComplete();
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    toast({ title: "Copiado", description: "Chave secreta copiada." });
  };

  return (
    <div className="space-y-4">
      {step === "intro" && (
        <>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-bold">Ativar Autenticação 2FA</h2>
            <p className="text-sm text-muted-foreground">
              Proteja a sua conta com um código gerado pela sua app autenticadora (Google Authenticator, Authy, etc.).
            </p>
          </div>
          <button
            onClick={startEnroll}
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "A configurar…" : "Configurar 2FA"}
          </button>
          {onSkip && (
            <button
              onClick={onSkip}
              className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Configurar mais tarde
            </button>
          )}
        </>
      )}

      {step === "scan" && (
        <>
          <p className="text-sm text-muted-foreground text-center">
            Digitalize o código QR com a sua app autenticadora
          </p>
          <div className="flex justify-center">
            <img src={qrCode} alt="QR Code MFA" className="rounded-lg border border-border" />
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-secondary/50 p-2">
            <code className="flex-1 text-xs break-all text-muted-foreground">{secret}</code>
            <button onClick={copySecret} className="shrink-0 rounded p-1 hover:bg-secondary">
              <Copy className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <button
            onClick={() => setStep("verify")}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
          >
            Já digitalizei
          </button>
        </>
      )}

      {step === "verify" && (
        <>
          <p className="text-sm text-muted-foreground text-center">
            Introduza o código de 6 dígitos da sua app autenticadora
          </p>
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={verifyCode} onChange={setVerifyCode}>
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
            onClick={verifyEnrollment}
            disabled={loading || verifyCode.length !== 6}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "A verificar…" : "Verificar e ativar"}
          </button>
        </>
      )}
    </div>
  );
}
