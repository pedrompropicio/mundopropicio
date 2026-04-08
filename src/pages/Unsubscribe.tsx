import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Music2 } from "lucide-react";

type UnsubStatus = "loading" | "valid" | "already_unsubscribed" | "invalid" | "success" | "error";

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<UnsubStatus>("loading");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    const validate = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`,
          { headers: { apikey: anonKey } }
        );
        const data = await res.json();
        if (data.valid === false && data.reason === "already_unsubscribed") {
          setStatus("already_unsubscribed");
        } else if (data.valid) {
          setStatus("valid");
        } else {
          setStatus("invalid");
        }
      } catch {
        setStatus("error");
      }
    };
    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (error) throw error;
      if (data?.success) {
        setStatus("success");
      } else if (data?.reason === "already_unsubscribed") {
        setStatus("already_unsubscribed");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
    setProcessing(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary glow-primary">
            <Music2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">MP Gestão Eventos</h1>
        </div>

        <div className="glass rounded-xl p-6 space-y-4">
          {status === "loading" && (
            <p className="text-sm text-muted-foreground">A verificar…</p>
          )}

          {status === "valid" && (
            <>
              <p className="text-sm text-foreground">
                Tem a certeza que deseja cancelar a subscrição de emails?
              </p>
              <button
                onClick={handleUnsubscribe}
                disabled={processing}
                className="w-full rounded-lg bg-destructive py-2.5 text-sm font-medium text-white transition-all hover:bg-destructive/90 disabled:opacity-50"
              >
                {processing ? "A processar…" : "Confirmar cancelamento"}
              </button>
            </>
          )}

          {status === "success" && (
            <div className="space-y-2">
              <p className="text-lg font-semibold text-foreground">✓ Subscrição cancelada</p>
              <p className="text-sm text-muted-foreground">
                Não receberá mais emails desta plataforma.
              </p>
            </div>
          )}

          {status === "already_unsubscribed" && (
            <div className="space-y-2">
              <p className="text-lg font-semibold text-foreground">Já cancelado</p>
              <p className="text-sm text-muted-foreground">
                A sua subscrição já foi cancelada anteriormente.
              </p>
            </div>
          )}

          {status === "invalid" && (
            <div className="space-y-2">
              <p className="text-lg font-semibold text-destructive">Link inválido</p>
              <p className="text-sm text-muted-foreground">
                Este link de cancelamento é inválido ou expirou.
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-2">
              <p className="text-lg font-semibold text-destructive">Erro</p>
              <p className="text-sm text-muted-foreground">
                Ocorreu um erro ao processar o pedido. Tente novamente mais tarde.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
