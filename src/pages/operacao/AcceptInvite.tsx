import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import logoMP from "@/assets/logo-horizontal.png";

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setState("error"); setErrorMsg("Token em falta no link."); return; }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("accept-staff-invite", { body: { token } });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        const { access_token, refresh_token, redirect_to } = data as any;
        const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
        if (setErr) throw setErr;
        setState("success");
        setTimeout(() => navigate(redirect_to ?? "/operacao/equipa"), 800);
      } catch (e: any) {
        setState("error");
        setErrorMsg(e.message ?? String(e));
      }
    })();
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl text-center space-y-4">
        <img src={logoMP} alt="MP Gestão Eventos" className="h-10 mx-auto object-contain" />
        {state === "loading" && (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">A validar convite…</p>
          </>
        )}
        {state === "success" && (
          <>
            <CheckCircle2 className="h-8 w-8 mx-auto text-green-500" />
            <p className="text-sm">Bem-vindo! A entrar…</p>
          </>
        )}
        {state === "error" && (
          <>
            <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
            <p className="text-sm font-medium">Não foi possível aceitar o convite</p>
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/login")}>Ir para login</Button>
          </>
        )}
      </div>
    </div>
  );
}
