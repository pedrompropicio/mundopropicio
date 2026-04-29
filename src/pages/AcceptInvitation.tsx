import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import logoMundoPropicio from "@/assets/logo-horizontal.png";

export default function AcceptInvitation() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<{ email?: string; company_name?: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    // Best-effort: try to fetch invite metadata anonymously; failures are ignored.
    (async () => {
      const { data } = await supabase
        .from("company_invitations" as any)
        .select("email, companies(display_name)")
        .eq("token", token)
        .eq("status", "pending")
        .maybeSingle();
      if (data) {
        setTokenInfo({
          email: (data as any).email,
          company_name: (data as any).companies?.display_name,
        });
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password.length < 8) {
      toast({ title: "Palavra-passe demasiado curta", description: "Mínimo 8 caracteres.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "As palavras-passe não coincidem", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("accept-invitation", {
        body: { token, password, full_name: fullName || undefined },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Conta criada", description: "Já podes iniciar sessão." });
      navigate("/login");
    } catch (e: any) {
      toast({ title: "Erro ao aceitar convite", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center text-muted-foreground">Convite inválido — token em falta.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="flex flex-col items-center gap-3">
          <img src={logoMundoPropicio} alt="MP Gestão Eventos" className="h-10 object-contain" />
          <h1 className="text-xl font-semibold">Aceitar convite</h1>
          {tokenInfo?.company_name && (
            <p className="text-sm text-muted-foreground text-center">
              Convidado para <strong>{tokenInfo.company_name}</strong>
              {tokenInfo.email ? ` — ${tokenInfo.email}` : ""}
            </p>
          )}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="fullName">Nome completo</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Palavra-passe (≥ 8 caracteres)</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="confirm">Confirmar palavra-passe</Label>
            <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "A criar conta…" : "Criar conta e entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
