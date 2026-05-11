import { useEffect, useMemo, useRef, useState } from "react";
import { Rocket, CheckCircle2, Circle, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useAdAccountSelection } from "@/hooks/useAdAccountSelection";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 8;
const lsKey = (n: number) => `mp_audience_setup_step_${n}`;
const PILOT_KEY = "mp_audience_setup_pilot_events";

type AutoStatus = "idle" | "loading" | "ok" | "warn" | "error";

function useStepDone(n: number) {
  const [done, setDone] = useState<boolean>(() => {
    try { return localStorage.getItem(lsKey(n)) === "1"; } catch { return false; }
  });
  const toggle = (v: boolean) => {
    setDone(v);
    try { localStorage.setItem(lsKey(n), v ? "1" : "0"); } catch {}
  };
  return [done, toggle] as const;
}

function StepCard({
  n, title, description, done, onToggle, auto, children,
}: {
  n: number;
  title: string;
  description: string;
  done: boolean;
  onToggle: (v: boolean) => void;
  auto?: { status: AutoStatus; message?: string };
  children?: React.ReactNode;
}) {
  return (
    <Card className={cn(
      "p-5 border-l-4 transition-colors",
      done ? "border-l-cyan-500 bg-cyan-500/5" : "border-l-muted-foreground/30",
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
            done ? "bg-cyan-500 text-background" : "bg-muted text-muted-foreground",
          )}>
            {done ? <CheckCircle2 className="h-5 w-5" /> : n}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
            {auto && (
              <div className="flex items-center gap-2 mt-2 text-xs">
                {auto.status === "loading" && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> A verificar…</>}
                {auto.status === "ok" && <span className="text-cyan-400 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> {auto.message || "Detetado automaticamente"}</span>}
                {auto.status === "warn" && <span className="text-amber-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {auto.message}</span>}
                {auto.status === "error" && <span className="text-destructive flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {auto.message}</span>}
                {auto.status === "idle" && auto.message && <span className="text-muted-foreground flex items-center gap-1.5"><Circle className="h-3.5 w-3.5" /> {auto.message}</span>}
              </div>
            )}
            {children}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:inline">Feito</span>
          <Switch checked={done} onCheckedChange={onToggle} />
        </div>
      </div>
    </Card>
  );
}

export default function Setup() {
  const { links, isLoading } = useAdAccountSelection();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);

  // Auto-refresh ad account links every 15s to detect MP Audience as soon as it appears
  useEffect(() => {
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["ad-account-links"] });
    }, 15000);
    return () => clearInterval(id);
  }, [queryClient]);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ad-account-links"] }),
        queryClient.invalidateQueries({ predicate: (q) => {
          const k = q.queryKey?.[0];
          return typeof k === "string" && k.startsWith("meta-connection");
        }}),
      ]);
      toast.success("Sincronizado");
    } catch (e: any) {
      toast.error(e?.message || "Erro a sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  const mpAudience = useMemo(() => {
    if (!links?.length) return null;
    return links.find(l =>
      (l.display_label || "").toLowerCase().includes("audience") ||
      (l.ad_account_name || "").toLowerCase().includes("audience"),
    ) ?? null;
  }, [links]);

  const [pixelStatus, setPixelStatus] = useState<{ status: AutoStatus; message?: string }>({ status: "idle" });
  const [audStatus, setAudStatus] = useState<{ status: AutoStatus; message?: string }>({ status: "idle" });

  useEffect(() => {
    if (!mpAudience) {
      setPixelStatus({ status: "idle", message: "Completa o passo 1 primeiro" });
      setAudStatus({ status: "idle", message: "Completa o passo 1 primeiro" });
      return;
    }
    setPixelStatus({ status: "loading" });
    setAudStatus({ status: "loading" });

    supabase.functions
      .invoke("crm-meta-pixel-health", {
        body: { connection_id: mpAudience.connection_id, ad_account_id: mpAudience.ad_account_id },
      })
      .then(({ data, error }) => {
        if (error) { setPixelStatus({ status: "error", message: error.message }); return; }
        if (data?.error) { setPixelStatus({ status: "error", message: data.message || data.error }); return; }
        const count = Array.isArray(data?.pixels) ? data.pixels.length : 0;
        if (count >= 1) setPixelStatus({ status: "ok", message: `${count} pixel(s) partilhado(s)` });
        else setPixelStatus({ status: "warn", message: "Nenhum pixel detetado nesta ad account" });
      })
      .catch((e) => setPixelStatus({ status: "error", message: e?.message || "Erro" }));

    supabase.functions
      .invoke("crm-meta-list-custom-audiences", {
        body: { connection_id: mpAudience.connection_id, ad_account_id: mpAudience.ad_account_id },
      })
      .then(({ data, error }) => {
        if (error) { setAudStatus({ status: "error", message: error.message }); return; }
        if (data?.error) { setAudStatus({ status: "error", message: data.message || data.error }); return; }
        const count = Array.isArray(data?.audiences) ? data.audiences.length : 0;
        if (count >= 3) setAudStatus({ status: "ok", message: `${count} Custom Audience(s) acessível(eis)` });
        else if (count > 0) setAudStatus({ status: "warn", message: `Apenas ${count} audience(s) — recomendado >=3` });
        else setAudStatus({ status: "warn", message: "Nenhuma Custom Audience partilhada ainda" });
      })
      .catch((e) => setAudStatus({ status: "error", message: e?.message || "Erro" }));
  }, [mpAudience?.connection_id, mpAudience?.ad_account_id]);

  const [s1, set1] = useStepDone(1);
  const [s2, set2] = useStepDone(2);
  const [s3, set3] = useStepDone(3);
  const [s4, set4] = useStepDone(4);
  const [s5, set5] = useStepDone(5);
  const [s6, set6] = useStepDone(6);
  const [s7, set7] = useStepDone(7);
  const [s8, set8] = useStepDone(8);

  const [pilots, setPilots] = useState<string>(() => {
    try { return localStorage.getItem(PILOT_KEY) || ""; } catch { return ""; }
  });
  const savePilots = (v: string) => {
    setPilots(v);
    try { localStorage.setItem(PILOT_KEY, v); } catch {}
  };

  const completed = [s1, s2, s3, s4, s5, s6, s7, s8].filter(Boolean).length;
  const pct = Math.round((completed / TOTAL_STEPS) * 100);

  const mpAudienceAuto: { status: AutoStatus; message?: string } = isLoading
    ? { status: "loading" }
    : mpAudience
      ? { status: "ok", message: `Detetada: ${mpAudience.display_label}` }
      : { status: "warn", message: "Ainda não detetada na conta Business" };

  const connectedAuto: { status: AutoStatus; message?: string } = isLoading
    ? { status: "loading" }
    : mpAudience?.enabled
      ? { status: "ok", message: "MP Audience conectada e ativa" }
      : mpAudience
        ? { status: "warn", message: "Detetada mas desativada — ativa em Ad Accounts" }
        : { status: "warn", message: "Ainda não conectada" };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
          <Rocket className="h-5 w-5 text-cyan-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Setup MP Audience</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configura uma ad account Meta dedicada exclusivamente a esta plataforma, em paralelo à conta da equipa de tráfego.
          </p>
        </div>
      </div>

      <Card className="p-5 bg-cyan-500/5 border-cyan-500/30">
        <h2 className="font-semibold mb-2 text-cyan-400">Porquê uma ad account paralela?</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Criar a "MP Audience" como ad account separada permite testar audiências, públicos personalizados e campanhas piloto sem interferir
          com o trabalho da equipa de tráfego. Como o pixel é partilhado entre ad accounts, herdas <strong>~95% do valor</strong> de todo o
          tracking e audiências já existentes — sem refazer nada. A "MP Geral" continua como sempre.
        </p>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Progresso</span>
          <span className="text-sm text-muted-foreground">{completed}/{TOTAL_STEPS} concluídos</span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      <div className="space-y-3">
        <StepCard
          n={1} title='Criar ad account "MP Audience" no Business Manager'
          description="No Meta Business Suite → Configurações de Negócios → Contas → Contas de Anúncios → Criar nova. Nome sugerido: MP Audience."
          done={s1} onToggle={set1} auto={mpAudienceAuto}
        />
        <StepCard
          n={2} title="Adicionar método de pagamento à MP Audience"
          description="Indispensável para a ad account ficar utilizável. No próprio Business Manager."
          done={s2} onToggle={set2}
        />
        <StepCard
          n={3} title="Partilhar pixel principal com MP Audience"
          description="Eventos do Negócio → Pixel → Atribuir Recursos → adiciona a ad account MP Audience com permissão total."
          done={s3} onToggle={set3} auto={pixelStatus}
        />
        <StepCard
          n={4} title="Partilhar Custom Audiences com MP Audience"
          description="Públicos → seleciona os principais → Partilhar → ad account MP Audience. Recomendado: pelo menos 3."
          done={s4} onToggle={set4} auto={audStatus}
        />
        <StepCard
          n={5} title="Ligar Página FB e conta IG à MP Audience"
          description="Para correr campanhas de Engagement e Lead Ads. Configurações de Negócios → Contas → Páginas/IG → Atribuir."
          done={s5} onToggle={set5}
        />
        <StepCard
          n={6} title="Verificar domínios da bilheteira"
          description="Em Segurança da Marca → Domínios. Confirma que mundopropicio.com / bilheteira está verificado para iOS 14+ tracking."
          done={s6} onToggle={set6}
        />
        <StepCard
          n={7} title="Selecionar 3 eventos piloto"
          description="Escolhe 3 eventos onde queres correr o piloto MP Audience (sem mexer nos restantes)."
          done={s7} onToggle={set7}
        >
          <Textarea
            value={pilots}
            onChange={(e) => savePilots(e.target.value)}
            placeholder="Um evento por linha…"
            className="mt-3 min-h-[80px]"
          />
        </StepCard>
        <StepCard
          n={8} title="Conectar a nova ad account no MP Audience"
          description="Em Conexões → Reconectar Meta → autoriza a MP Audience. Aparece automaticamente em Ad Accounts."
          done={s8} onToggle={set8} auto={connectedAuto}
        />
      </div>

      {completed === TOTAL_STEPS && (
        <Card className="p-6 bg-cyan-500/10 border-cyan-500/40 text-center">
          <CheckCircle2 className="h-10 w-10 text-cyan-400 mx-auto mb-2" />
          <h3 className="font-bold text-lg text-cyan-400">Setup completo!</h3>
          <p className="text-sm text-muted-foreground mt-1">A MP Audience está pronta para receber as primeiras campanhas piloto.</p>
          <Button className="mt-4" onClick={() => window.location.assign("/audience/dashboard")}>Ir para Dashboard</Button>
        </Card>
      )}
    </div>
  );
}
