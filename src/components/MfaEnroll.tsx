import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  ShieldCheck,
  Copy,
  Smartphone,
  QrCode,
  KeyRound,
  Check,
  Apple,
  Download,
  AlertTriangle,
} from "lucide-react";
import { generateRecoveryCodes, hashRecoveryCodes } from "@/lib/mfa-trusted-device";

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
}

type Step = "intro" | "install" | "scan" | "verify" | "recovery" | "done";

export function MfaEnroll({ onComplete, onSkip }: Props) {
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [step, setStep] = useState<Step>("intro");
  const [loading, setLoading] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [savedConfirmed, setSavedConfirmed] = useState(false);

  const startEnroll = async () => {
    setLoading(true);
    // Limpar fator não verificado anterior, se existir
    try {
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const unverified = (existing?.totp ?? []).find((f: any) => f.status !== "verified");
      if (unverified) {
        await supabase.auth.mfa.unenroll({ factorId: unverified.id });
      }
    } catch {}

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `MP Gestão Eventos · ${new Date().toLocaleDateString("pt-PT")}`,
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

    // Gerar e guardar recovery codes
    const codes = generateRecoveryCodes(5);
    const hashes = await hashRecoveryCodes(codes);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) {
      // Apagar códigos antigos
      await supabase.from("mfa_recovery_codes").delete().eq("user_id", userId);
      // Inserir novos
      const rows = hashes.map((h) => ({ user_id: userId, code_hash: h }));
      await supabase.from("mfa_recovery_codes").insert(rows);
    }
    setRecoveryCodes(codes);
    setStep("recovery");
    setLoading(false);
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    toast({ title: "Copiado", description: "Chave secreta copiada." });
  };

  const copyAllCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    toast({ title: "Copiado", description: "5 códigos copiados." });
  };

  const downloadCodes = () => {
    const content =
      `MP Gestão Eventos — Códigos de recuperação MFA\n` +
      `Gerado em: ${new Date().toLocaleString("pt-PT")}\n\n` +
      `Cada código só pode ser usado UMA vez. Guarde num local seguro.\n\n` +
      recoveryCodes.map((c, i) => `${i + 1}. ${c}`).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mp-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const finish = () => {
    toast({
      title: "MFA ativado!",
      description: "A sua conta está protegida. Guardou os códigos em local seguro?",
    });
    onComplete();
  };

  // ===================== UI =====================
  return (
    <div className="space-y-4">
      {/* INTRO ----------------------------------------- */}
      {step === "intro" && (
        <>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-bold">Ativar 2FA em 3 passos</h2>
            <p className="text-sm text-muted-foreground">
              Demora menos de 2 minutos. Vamos guiá-lo passo a passo.
            </p>
          </div>
          <div className="space-y-2 rounded-lg bg-secondary/30 p-3 text-sm">
            <div className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">1</span> Instalar app autenticadora</div>
            <div className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">2</span> Ler QR Code</div>
            <div className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">3</span> Guardar 5 códigos de recuperação</div>
          </div>
          <button
            onClick={() => setStep("install")}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
          >
            Começar
          </button>
          {onSkip && (
            <button onClick={onSkip} className="w-full text-center text-xs text-muted-foreground hover:text-primary">
              Cancelar
            </button>
          )}
        </>
      )}

      {/* INSTALL APP ----------------------------------- */}
      {step === "install" && (
        <>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
              <Smartphone className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-bold">Passo 1 · Instalar app no telemóvel</h2>
            <p className="text-xs text-muted-foreground">Já tem uma instalada? Salte este passo.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a
              href="https://apps.apple.com/app/google-authenticator/id388497605"
              target="_blank" rel="noopener noreferrer"
              className="flex flex-col items-center gap-1 rounded-lg border border-border p-3 text-xs hover:border-primary hover:bg-primary/5"
            >
              <Apple className="h-5 w-5" />
              <span className="font-medium">App Store</span>
              <span className="text-muted-foreground">iPhone / iPad</span>
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2"
              target="_blank" rel="noopener noreferrer"
              className="flex flex-col items-center gap-1 rounded-lg border border-border p-3 text-xs hover:border-primary hover:bg-primary/5"
            >
              <Smartphone className="h-5 w-5" />
              <span className="font-medium">Play Store</span>
              <span className="text-muted-foreground">Android</span>
            </a>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Apps suportadas: Google Authenticator, Microsoft Authenticator, Authy, 1Password.
          </p>
          <button
            onClick={startEnroll}
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "A preparar…" : "Já tenho a app · Continuar"}
          </button>
        </>
      )}

      {/* SCAN QR --------------------------------------- */}
      {step === "scan" && (
        <>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
              <QrCode className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-bold">Passo 2 · Ler QR Code</h2>
            <p className="text-xs text-muted-foreground">
              Abra a app, escolha "+" → "Ler QR Code" e aponte ao ecrã.
            </p>
          </div>
          <div className="flex justify-center rounded-lg bg-white p-3">
            <img src={qrCode} alt="QR Code MFA" className="h-44 w-44" />
          </div>
          <details className="rounded-lg bg-secondary/30 p-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Não consegue ler? Inserir chave manualmente
            </summary>
            <div className="mt-2 flex items-center gap-2 rounded bg-background p-2">
              <code className="flex-1 break-all text-foreground">{secret}</code>
              <button onClick={copySecret} className="shrink-0 rounded p-1 hover:bg-secondary">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </details>
          <button
            onClick={() => setStep("verify")}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Já adicionei · Continuar
          </button>
        </>
      )}

      {/* VERIFY ---------------------------------------- */}
      {step === "verify" && (
        <>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-bold">Passo 3 · Confirmar código</h2>
            <p className="text-xs text-muted-foreground">
              Introduza o código de 6 dígitos que aparece na sua app (renova a cada 30s).
            </p>
          </div>
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
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "A verificar…" : "Confirmar e ativar"}
          </button>
        </>
      )}

      {/* RECOVERY CODES -------------------------------- */}
      {step === "recovery" && (
        <>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            </div>
            <h2 className="text-lg font-bold">Guarde estes 5 códigos</h2>
            <p className="text-xs text-muted-foreground">
              Use-os para entrar se perder o telemóvel. Cada código só funciona <strong>uma vez</strong>.
              <br />Esta é a <strong>única vez</strong> que aparecem.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 font-mono text-sm">
            {recoveryCodes.map((c) => (
              <div key={c} className="text-center tracking-wider text-foreground">{c}</div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={copyAllCodes} className="flex items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs hover:bg-secondary">
              <Copy className="h-3.5 w-3.5" /> Copiar
            </button>
            <button onClick={downloadCodes} className="flex items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs hover:bg-secondary">
              <Download className="h-3.5 w-3.5" /> Descarregar
            </button>
          </div>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={savedConfirmed}
              onChange={(e) => setSavedConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-border"
            />
            <span className="text-muted-foreground">
              Confirmo que guardei os códigos num local seguro (gestor de passwords, papel, etc.).
            </span>
          </label>
          <button
            onClick={finish}
            disabled={!savedConfirmed}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Check className="mr-1 inline h-4 w-4" /> Concluir
          </button>
        </>
      )}
    </div>
  );
}
