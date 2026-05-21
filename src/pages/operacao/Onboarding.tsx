import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";


type Phase = "loading" | "ready" | "submitting" | "consumed" | "invalid" | "error";

function scorePassword(pw: string): { score: 0 | 1 | 2 | 3; label: string; color: string } {
  if (pw.length < 8) return { score: 0, label: "Demasiado curta", color: "bg-destructive" };
  const types = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length < 12) return { score: 1, label: "Fraca", color: "bg-orange-500" };
  if (types >= 3) return { score: 3, label: "Forte", color: "bg-green-500" };
  if (types >= 2) return { score: 2, label: "Razoável", color: "bg-yellow-500" };
  return { score: 1, label: "Fraca", color: "bg-orange-500" };
}

export default function Onboarding() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [emailMasked, setEmailMasked] = useState("");
  const [company, setCompany] = useState<{ display_name: string | null; logo_url: string | null } | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (!token) {
      setPhase("invalid");
      setErrorMsg("Link inválido — falta o token.");
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("onboarding-preview", { body: { token } });
        if (error) {
          // Supabase devolve FunctionsHttpError com context.response
          const status = (error as any)?.context?.response?.status;
          const body = await (error as any)?.context?.response?.json?.().catch(() => null);
          if (status === 410 || body?.error === "token_consumed") {
            setPhase("consumed");
            return;
          }
          if (status === 404 || body?.error === "invalid_token") {
            setPhase("invalid");
            setErrorMsg("Link não encontrado. Pede um novo link a quem te convidou.");
            return;
          }
          throw new Error(body?.error ?? error.message);
        }
        const d = data as { full_name: string; email_masked: string; company: { display_name: string | null; logo_url: string | null } | null };
        setFullName(d.full_name ?? "");
        setEmailMasked(d.email_masked ?? "");
        setCompany(d.company ?? null);
        setPhase("ready");
      } catch (e: any) {
        setPhase("error");
        setErrorMsg(e?.message ?? "Algo correu mal. Tenta de novo.");
      }
    })();
  }, [token]);

  const strength = useMemo(() => scorePassword(password), [password]);
  const passwordsMatch = password.length > 0 && password === confirm;
  const submitting = phase === "submitting";
  const canSubmit = password.length >= 8 && passwordsMatch && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPhase("submitting");
    try {
      const { data, error } = await supabase.functions.invoke("onboarding-complete", {
        body: { token, password },
      });
      if (error) {
        const status = (error as any)?.context?.response?.status;
        const body = await (error as any)?.context?.response?.json?.().catch(() => null);
        if (status === 410 || body?.error === "token_consumed") {
          setPhase("consumed");
          return;
        }
        if (status === 429) {
          toast.error("Aguarda alguns segundos e tenta de novo.");
          setPhase("ready");
          return;
        }
        if (status === 422 || body?.error === "weak_password") {
          toast.error(body?.message ?? "Password demasiado fraca. Escolhe outra.");
          setPhase("ready");
          return;
        }
        throw new Error(body?.message ?? body?.error ?? error.message);
      }
      const { access_token, refresh_token, redirect_to } = data as any;
      const { error: sErr } = await supabase.auth.setSession({ access_token, refresh_token });
      if (sErr) throw sErr;
      toast.success("Conta activada!");
      navigate(redirect_to ?? "/operacao/campo", { replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro inesperado.");
      setPhase("ready");
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background px-5"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 1.5rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)",
      }}
    >
      <div className="w-full max-w-sm space-y-6">
        {company?.logo_url ? (
          <img
            src={company.logo_url}
            alt={company.display_name ?? ""}
            className="h-12 mx-auto object-contain"
          />
        ) : (
          <p className="text-center text-lg font-semibold text-muted-foreground">
            {company?.display_name ?? "MP Gestão Eventos"}
          </p>
        )}

        {phase === "loading" && (
          <div className="text-center space-y-3 py-8">
            <Loader2 className="h-7 w-7 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">A validar link…</p>
          </div>
        )}

        {phase === "invalid" && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
            <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
            <p className="text-sm">{errorMsg}</p>
          </div>
        )}

        {phase === "error" && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
            <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
            <p className="text-sm">{errorMsg}</p>
            <Button variant="outline" onClick={() => window.location.reload()} className="w-full h-11">
              Tentar de novo
            </Button>
          </div>
        )}

        {phase === "consumed" && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-4">
            <p className="text-sm">Esta conta já foi activada.</p>
            <Button onClick={() => navigate("/login")} className="w-full h-11">
              Ir para login
            </Button>
          </div>
        )}

        {(phase === "ready" || phase === "submitting") && (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-6 space-y-5">
            <div className="text-center space-y-1">
              <p className="text-lg font-semibold">Bem-vindo, {fullName.split(" ")[0]}</p>
              <p className="text-xs text-muted-foreground">{emailMasked}</p>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Define a tua password</p>
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres. Recomendamos 12+.</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pw">Password</Label>
                <Input
                  id="pw"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 text-base"
                  disabled={phase === "submitting"}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cpw">Confirmar password</Label>
                <Input
                  id="cpw"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-12 text-base"
                  disabled={phase === "submitting"}
                />
                {confirm.length > 0 && !passwordsMatch && (
                  <p className="text-xs text-destructive">As passwords não coincidem.</p>
                )}
              </div>

              {password.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1 h-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-colors ${
                          i <= strength.score ? strength.color : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Força: {strength.label}</p>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <Checkbox
                  checked={showPw}
                  onCheckedChange={(v) => setShowPw(v === true)}
                />
                <span className="flex items-center gap-1">
                  {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  Mostrar password
                </span>
              </label>
            </div>

            <Button type="submit" disabled={!canSubmit} className="w-full h-12 text-base">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  A activar…
                </>
              ) : (
                "Criar conta"
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
