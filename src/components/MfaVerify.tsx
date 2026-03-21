import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ShieldCheck } from "lucide-react";

interface Props {
  onVerified: () => void;
  onCancel: () => void;
}

export function MfaVerify({ onVerified, onCancel }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
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
      toast({ title: "Código inválido", description: "O código está incorreto. Tente novamente.", variant: "destructive" });
      setCode("");
      setLoading(false);
      return;
    }

    onVerified();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-bold">Verificação 2FA</h2>
        <p className="text-sm text-muted-foreground">
          Introduza o código de 6 dígitos da sua app autenticadora
        </p>
      </div>
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
        onClick={handleVerify}
        disabled={loading || code.length !== 6}
        className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "A verificar…" : "Verificar"}
      </button>
      <button
        onClick={onCancel}
        className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        Voltar
      </button>
    </div>
  );
}
