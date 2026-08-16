import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Play, RefreshCw, AlertTriangle, CheckCircle2, KeyRound, ShieldCheck, Globe, Copy } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useHasFeature } from "@/hooks/useCompanyFeatures";
import { FEATURES } from "@/lib/features";
import { FeatureNotEnabledCard } from "@/components/FeatureNotEnabledCard";

type Cfg = {
  id: string;
  event_id: string;
  vault_secret_name: string;
  plan_id: string;
  venue_id: string;
  city_id: string;
  partner_id: string;
  dashboard_id: string;
  client_version: string | null;
  ingest_secret: string | null;
  organization_name: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_token_refresh_at: string | null;
};


type Run = {
  id: string;
  config_id: string;
  status: string;
  mode: string;
  triggered_by: string | null;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  files_downloaded: any;
  import_audit: any;
};

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "success") return "default";
  if (s === "started") return "outline";
  if (s.endsWith("_failed")) return "destructive";
  return "secondary";
};

const SUPABASE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fever-ingest-browser`;
const FEVER_APPLICATION_ID = "84a4434b-d722-47dd-a247-9a073055e023";

function buildBookmarklet(cfg: Cfg): string {
  const clientVersion = cfg.client_version || "w.12.1.0";
  const code = `(async function(){
function show(t,ok){var d=document.getElementById('mpFeverOv');if(!d){d=document.createElement('div');d.id='mpFeverOv';document.body.appendChild(d);}d.style.cssText='position:fixed;z-index:2147483647;top:16px;right:16px;max-width:380px;padding:14px 16px;border-radius:10px;font:13px/1.45 system-ui,sans-serif;color:#fff;white-space:pre-wrap;box-shadow:0 8px 24px rgba(0,0,0,.35);cursor:pointer;background:'+(ok?'#166534':'#991b1b');d.textContent=t;d.onclick=function(){d.remove()};}
try{
if(location.hostname!=='partners.feverup.com'){show('Abre primeiro partners.feverup.com com sessao iniciada. A abrir...',false);setTimeout(function(){window.open('https://partners.feverup.com','_blank')},900);return;}
var tk=localStorage.getItem('token');
if(!tk){show('Sem token no browser. Entra na organizacao no FeverZone e clica outra vez.',false);return;}
show('A obter o dashboard do Metabase...',true);
var g=await fetch('https://services.feverup.com/b2b-partners/1.0/partners/${cfg.partner_id}/graphs',{method:'POST',headers:{'Authorization':'B2bToken '+tk,'Content-Type':'application/json','Accept':'application/json, text/plain, */*','Accept-Language':'pt-BR','X-Client-Version':'${clientVersion}','X-Application-Id':'${FEVER_APPLICATION_ID}'},body:JSON.stringify({plan_id:Number(${cfg.plan_id}),group_name:'analytics'})});
if(!g.ok){show('Fever /graphs devolveu '+g.status+'. Se for 401, faz logout/login no FeverZone.',false);return;}
var j=await g.json();
var arr=(j&&j.data&&j.data.graphs)||j.graphs||[];
var dash=arr.filter(function(x){return Number(x.external_id)===Number(${cfg.dashboard_id})})[0];
if(!dash){show('Dashboard ${cfg.dashboard_id} nao encontrado (recebidos: '+arr.map(function(x){return x.external_id}).join(',')+').',false);return;}
var m=String(dash.url||'').match(/\\/embed\\/dashboard\\/([^#?\\/]+)/);
if(!m){show('Nao consegui extrair o JWT do Metabase do URL do dashboard.',false);return;}
show('JWT obtido. A enviar para o ERP...',true);
var r=await fetch('${SUPABASE_FN_URL}',{method:'POST',headers:{'Content-Type':'application/json','x-ingest-secret':'${cfg.ingest_secret || ""}'},body:JSON.stringify({configId:'${cfg.id}',metabaseJwt:m[1]})});
var out=null;try{out=await r.json()}catch(e){}
if(r.ok&&out&&out.ok){show(out.skipped?('Importacao ignorada: '+out.reason):('Importacao Fever concluida. Run '+out.runId),true);}
else{show('Erro do ERP ('+r.status+'): '+((out&&(out.error||out.phase))||'sem detalhe'),false);}
}catch(e){show('Erro inesperado: '+(e&&e.message?e.message:e),false);}
})();`;
  return "javascript:" + encodeURIComponent(code.replace(/\n/g, ""));
}


export default function FeverSync() {
  const qc = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [credsModal, setCredsModal] = useState<Cfg | null>(null);
  const [credsForm, setCredsForm] = useState({ username: "", password: "" });
  const [tokenModal, setTokenModal] = useState<Cfg | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenInfo, setTokenInfo] = useState<{ exp: number; user_email?: string; hoursRemaining: number } | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [browserModal, setBrowserModal] = useState<Cfg | null>(null);
  const hasFeature = useHasFeature(FEATURES.SYNC_FEVER);


  function decodeToken(raw: string) {
    setTokenError(null); setTokenInfo(null);
    const t = raw.trim();
    if (!t) { setTokenError("Cola o token primeiro."); return; }
    const parts = t.split(".");
    if (parts.length !== 3) { setTokenError("Não parece um JWT (≠3 segmentos)."); return; }
    try {
      let p = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (p.length % 4) p += "=";
      const payload = JSON.parse(atob(p));
      const now = Math.floor(Date.now() / 1000);
      if (!payload?.exp) { setTokenError("Token sem campo exp."); return; }
      const hoursRemaining = Math.round(((payload.exp - now) / 3600) * 10) / 10;
      setTokenInfo({ exp: payload.exp, user_email: payload.user_email, hoursRemaining });
      if (payload.exp <= now) setTokenError(`Token já expirou em ${new Date(payload.exp * 1000).toLocaleString("pt-PT")}.`);
    } catch (e: any) { setTokenError(`Falha a descodificar: ${e?.message || e}`); }
  }

  const cfgQ = useQuery({
    queryKey: ["fever-sync-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fever_sync_config" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Cfg[];
    },
  });

  const runsQ = useQuery({
    queryKey: ["fever-sync-runs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fever_sync_runs" as any).select("*").order("started_at", { ascending: false }).limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Run[];
    },
  });

  const runMut = useMutation({
    mutationFn: async (configId: string) => {
      const { data, error } = await supabase.functions.invoke("fetch-fever-reports", {
        body: { configId, mode: "manual", triggeredBy: "ui" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.ok) toast.success("Sync Fever concluída.");
      else toast.error(`Falhou: ${data?.phase || "erro desconhecido"} — ${data?.error || ""}`);
      qc.invalidateQueries({ queryKey: ["fever-sync-runs"] });
      qc.invalidateQueries({ queryKey: ["fever-sync-config"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro a invocar função"),
  });

  const credsMut = useMutation({
    mutationFn: async () => {
      if (!credsModal) throw new Error("sem config");
      const { data, error } = await supabase.functions.invoke("update-fever-credentials", {
        body: { configId: credsModal.id, username: credsForm.username, password: credsForm.password },
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error || "falhou");
      return data;
    },
    onSuccess: () => {
      toast.success("Credenciais guardadas.");
      setCredsModal(null);
      setCredsForm({ username: "", password: "" });
    },
    onError: (e: any) => toast.error(e?.message || "Erro"),
  });

  const tokenMut = useMutation({
    mutationFn: async () => {
      if (!tokenModal) throw new Error("sem config");
      const { data, error } = await supabase.functions.invoke("update-fever-b2b-token", {
        body: { configId: tokenModal.id, token: tokenInput.trim() },
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error || "falhou");
      return data as { ok: true; exp: number; hoursRemaining: number };
    },
    onSuccess: (data) => {
      const expDate = new Date(data.exp * 1000).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      toast.success(`Token guardado. Válido até ${expDate} (faltam ~${data.hoursRemaining}h). Sync automático activo.`);
      setTimeout(() => {
        setTokenModal(null);
        setTokenInput(""); setTokenInfo(null); setTokenError(null);
      }, 2000);
    },
    onError: (e: any) => toast.error(e?.message || "Erro"),
  });

  const refreshTokenMut = useMutation({
    mutationFn: async () => {
      if (!tokenModal) throw new Error("sem config");
      const { data, error } = await supabase.functions.invoke("refresh-fever-token", {
        body: { configId: tokenModal.id, triggeredBy: "ui" },
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error || "falhou");
      return data as { ok: true; exp: number; hoursRemaining: number; user_email: string | null };
    },
    onSuccess: (data) => {
      toast.success(`Token renovado. Expira em ~${data.hoursRemaining}h.`);
      qc.invalidateQueries({ queryKey: ["fever-sync-config"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro a renovar token"),
  });

  const enableMut = useMutation({
    mutationFn: async (args: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("fever_sync_config" as any).update({ enabled: args.enabled }).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fever-sync-config"] }),
  });

  const rotateSecretMut = useMutation({
    mutationFn: async (id: string) => {
      const next = crypto.randomUUID();
      const { error } = await supabase.from("fever_sync_config" as any).update({ ingest_secret: next }).eq("id", id);
      if (error) throw error;
      return next;
    },
    onSuccess: async (next) => {
      await qc.invalidateQueries({ queryKey: ["fever-sync-config"] });
      setBrowserModal((b) => (b ? { ...b, ingest_secret: next } : b));
      toast.success("Segredo rotacionado. Arrasta o bookmarklet novo (o antigo deixou de funcionar).");
    },
    onError: (e: any) => toast.error(e?.message || "Erro a rotacionar segredo"),
  });

  const cfgs = cfgQ.data || [];
  const runs = runsQ.data || [];


  if (!hasFeature) return <FeatureNotEnabledCard featureKey={FEATURES.SYNC_FEVER} />;

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sync Fever</h1>
        <p className="text-muted-foreground mt-1">Importação automática diária dos relatórios Fever.</p>
      </div>

      {cfgQ.isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : cfgs.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Sem configurações. Insira via SQL/migration.</CardContent></Card>
      ) : (
        cfgs.map((cfg) => (
          <Card key={cfg.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {cfg.organization_name}
                    <Badge variant={cfg.enabled ? "default" : "secondary"}>{cfg.enabled ? "Ativo" : "Desativado"}</Badge>
                    {cfg.last_run_status && (
                      <Badge variant={statusVariant(cfg.last_run_status)}>{cfg.last_run_status}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1 font-mono text-xs">
                    plan={cfg.plan_id} • venue={cfg.venue_id} • city={cfg.city_id}
                  </CardDescription>
                  {cfg.last_run_at && (
                    <CardDescription className="mt-1">
                      Última execução: {new Date(cfg.last_run_at).toLocaleString("pt-PT")}
                    </CardDescription>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={cfg.enabled}
                    onCheckedChange={(v) => enableMut.mutate({ id: cfg.id, enabled: v })}
                  />
                  <Button variant="default" size="sm" onClick={() => setBrowserModal(cfg)}>
                    <Globe className="h-4 w-4 mr-2" /> Importar pelo browser
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setTokenModal(cfg); setTokenInput(""); setTokenInfo(null); setTokenError(null); }}>
                    <ShieldCheck className="h-4 w-4 mr-2" /> Token Fever
                  </Button>

                  <Button variant="outline" size="sm" onClick={() => { setCredsModal(cfg); setCredsForm({ username: "", password: "" }); }}>
                    <KeyRound className="h-4 w-4 mr-2" /> Credenciais
                  </Button>
                  <Button size="sm" disabled={runMut.isPending} onClick={() => runMut.mutate(cfg.id)}>
                    {runMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                    Correr agora
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">Vault: <code>{cfg.vault_secret_name}</code></div>
            </CardContent>
          </Card>
        ))
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Últimas execuções</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["fever-sync-runs"] })}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Sem execuções registadas.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Início</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Ficheiros</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => {
                  const dur = r.finished_at ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000) : null;
                  const filesCount = Array.isArray(r.files_downloaded) ? r.files_downloaded.length : 0;
                  return (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedRun(r)}>
                      <TableCell className="font-mono text-xs">{new Date(r.started_at).toLocaleString("pt-PT")}</TableCell>
                      <TableCell><Badge variant="outline">{r.mode}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(r.status)}>
                          {r.status === "success" ? <CheckCircle2 className="h-3 w-3 mr-1" /> :
                           r.status.endsWith("_failed") ? <AlertTriangle className="h-3 w-3 mr-1" /> : null}
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{dur !== null ? `${dur}s` : "—"}</TableCell>
                      <TableCell>{filesCount}</TableCell>
                      <TableCell><Button variant="ghost" size="sm">Ver</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRun} onOpenChange={(o) => !o && setSelectedRun(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Detalhes da execução</DialogTitle></DialogHeader>
          {selectedRun && (
            <div className="space-y-4 text-sm">
              <div><b>Estado:</b> <Badge variant={statusVariant(selectedRun.status)}>{selectedRun.status}</Badge></div>
              <div><b>Início:</b> {new Date(selectedRun.started_at).toLocaleString("pt-PT")}</div>
              {selectedRun.finished_at && <div><b>Fim:</b> {new Date(selectedRun.finished_at).toLocaleString("pt-PT")}</div>}
              {selectedRun.triggered_by && <div><b>Trigger:</b> {selectedRun.triggered_by}</div>}
              {selectedRun.error_message && (
                <div className="bg-destructive/10 border border-destructive/30 rounded p-3">
                  <b>Erro:</b> <pre className="whitespace-pre-wrap text-xs mt-1">{selectedRun.error_message}</pre>
                </div>
              )}
              {selectedRun.files_downloaded && (
                <div>
                  <b>Ficheiros:</b>
                  <pre className="bg-muted rounded p-2 text-xs overflow-auto mt-1">{JSON.stringify(selectedRun.files_downloaded, null, 2)}</pre>
                </div>
              )}
              {selectedRun.import_audit && (
                <div>
                  <b>Auditoria do importador:</b>
                  <pre className="bg-muted rounded p-2 text-xs overflow-auto mt-1">{JSON.stringify(selectedRun.import_audit, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!credsModal} onOpenChange={(o) => !o && setCredsModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Credenciais Fever</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email / utilizador</Label>
              <Input value={credsForm.username} onChange={(e) => setCredsForm((s) => ({ ...s, username: e.target.value }))} placeholder="email@dominio.com" />
            </div>
            <div>
              <Label>Senha</Label>
              <Input type="password" value={credsForm.password} onChange={(e) => setCredsForm((s) => ({ ...s, password: e.target.value }))} />
            </div>
            <p className="text-xs text-muted-foreground">As credenciais ficam guardadas encriptadas no Vault. Só são acedidas pelo backend ao correr a sync.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredsModal(null)}>Cancelar</Button>
            <Button disabled={credsMut.isPending || !credsForm.username || !credsForm.password} onClick={() => credsMut.mutate()}>
              {credsMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tokenModal} onOpenChange={(o) => { if (!o) { setTokenModal(null); setTokenInput(""); setTokenInfo(null); setTokenError(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
          <DialogHeader><DialogTitle>Token Fever (B2bToken)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Refresh automático</p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={refreshTokenMut.isPending}
                  onClick={() => refreshTokenMut.mutate()}
                >
                  {refreshTokenMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Refrescar agora
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                O token é renovado automaticamente 2× por dia (00:00 e 12:00 UTC) usando as credenciais guardadas. Só precisas de colar manualmente se a password mudar ou se quiseres forçar.
              </p>
              <p className="text-xs">
                <span className="text-muted-foreground">Último refresh automático: </span>
                <span className="font-mono">
                  {tokenModal?.last_token_refresh_at
                    ? new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(tokenModal.last_token_refresh_at))
                    : "ainda nunca foi feito"}
                </span>
              </p>
            </div>

            <div>
              <Label>B2bToken (JWT)</Label>
              <Textarea
                value={tokenInput}
                onChange={(e) => { setTokenInput(e.target.value); setTokenInfo(null); setTokenError(null); }}
                placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
                className="font-mono text-xs min-h-[120px]"
                autoFocus
              />
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => decodeToken(tokenInput)} disabled={!tokenInput.trim()}>
                Descodificar e validar
              </Button>
              {tokenInfo && (
                <Badge
                  variant="outline"
                  className={
                    tokenInfo.hoursRemaining <= 0 ? "bg-destructive/15 text-destructive border-destructive/30" :
                    tokenInfo.hoursRemaining < 2 ? "bg-destructive/15 text-destructive border-destructive/30" :
                    tokenInfo.hoursRemaining < 12 ? "bg-yellow-500/15 text-yellow-600 border-yellow-500/30" :
                    "bg-green-500/15 text-green-600 border-green-500/30"
                  }
                >
                  Expira em {new Date(tokenInfo.exp * 1000).toLocaleString("pt-PT")} (~{tokenInfo.hoursRemaining}h)
                </Badge>
              )}
            </div>
            {tokenInfo?.user_email && (
              <p className="text-xs text-muted-foreground">Utilizador: <code>{tokenInfo.user_email}</code></p>
            )}
            {tokenError && <p className="text-xs text-destructive">{tokenError}</p>}

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Como obter o token</p>
              <Tabs defaultValue="mobile">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="mobile">📱 iPhone (recomendado)</TabsTrigger>
                  <TabsTrigger value="desktop">💻 Mac</TabsTrigger>
                </TabsList>
                <TabsContent value="mobile" className="text-xs space-y-2 mt-3">
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Activa "Web Inspector": <b>Ajustes → Apps → Safari → Avançado → Web Inspector</b></li>
                    <li>Liga o iPhone ao Mac por USB</li>
                    <li>No Mac, abre Safari → menu <b>Desenvolver</b> → escolhe o teu iPhone → escolhe a aba <code>partners.feverup.com</code></li>
                    <li>No DevTools, vai à aba <b>Console</b> e cola: <code className="bg-muted px-1 rounded">copy(localStorage.getItem('token'))</code></li>
                    <li>O token fica na clipboard do <b>iPhone</b>. Volta aqui e cola no campo acima.</li>
                  </ol>
                </TabsContent>
                <TabsContent value="desktop" className="text-xs space-y-2 mt-3">
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Abre <code>partners.feverup.com</code> no Mac com sessão iniciada</li>
                    <li>DevTools → <b>Console</b> → cola: <code className="bg-muted px-1 rounded">copy(localStorage.getItem('token'))</code></li>
                    <li>Cola aqui no campo acima.</li>
                  </ol>
                </TabsContent>
              </Tabs>
              <p className="text-xs text-muted-foreground mt-3">
                O token expira em ~21h. Renova quando esta página avisar (faltam &lt;2h → vermelho).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTokenModal(null); setTokenInput(""); setTokenInfo(null); setTokenError(null); }}>Cancelar</Button>
            <Button
              disabled={tokenMut.isPending || !tokenInput.trim() || !tokenInfo || tokenInfo.hoursRemaining <= 0}
              onClick={() => tokenMut.mutate()}
            >
              {tokenMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
