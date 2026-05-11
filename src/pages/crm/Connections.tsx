import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Facebook, Loader2, Plug, Power, RefreshCw, Search, Music2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const META_APP_ID = "2065507417360931";
const META_REDIRECT_URI =
  "https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/crm-meta-oauth-callback";
const META_SCOPES = "ads_management,ads_read,business_management,pages_show_list";

type Platform = "meta" | "google" | "tiktok";

interface AdAccountOption {
  id?: string;
  account_id?: string;
  name?: string;
  currency?: string | null;
  account_status?: number | null;
  timezone_name?: string | null;
}

interface ConnectionRow {
  id: string;
  company_id: string;
  platform: Platform;
  external_business_id: string | null;
  external_business_name: string | null;
  expires_at: string | null;
  status: string;
  last_validated_at: string | null;
  last_error: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  selected_ad_account_id: string | null;
  selected_ad_account_name: string | null;
  available_ad_accounts: AdAccountOption[] | null;
}

const PLATFORMS: Array<{
  key: Platform;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
  description: string;
}> = [
  {
    key: "meta",
    name: "Meta (Facebook & Instagram)",
    icon: Facebook,
    description: "Conecte sua conta do Business Manager para criar e gerenciar campanhas.",
  },
  {
    key: "google",
    name: "Google Ads",
    icon: Search,
    comingSoon: true,
    description: "Em breve: integração com Google Ads.",
  },
  {
    key: "tiktok",
    name: "TikTok Ads",
    icon: Music2,
    comingSoon: true,
    description: "Em breve: integração com TikTok Ads.",
  },
];

const ERROR_MESSAGES: Record<string, string> = {
  invalid_or_expired_state:
    "Sessão de autorização expirada. Tente conectar novamente.",
  token_exchange_failed:
    "Falha ao trocar código por token de acesso no Facebook.",
  businesses_fetch_failed:
    "Não foi possível obter a lista de Business Managers.",
  no_business_manager:
    "Sua conta Meta não possui Business Manager. Crie um em business.facebook.com e tente novamente.",
  connection_save_failed:
    "Falha ao salvar a conexão no banco de dados.",
  auth_denied: "Autorização negada no Facebook.",
  missing_params: "Parâmetros ausentes no retorno do Facebook.",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "active")
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Ativa</Badge>;
  if (status === "disconnected")
    return <Badge variant="outline">Desconectada</Badge>;
  if (status === "expired")
    return <Badge variant="destructive">Expirada</Badge>;
  if (status === "error")
    return <Badge variant="destructive">Com erro</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export default function CrmConnections() {
  const { user, role, hasPermission, loading: authLoading } = useAuth();
  const { companyId, isLoading: companyLoading } = useCompany();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<ConnectionRow | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const isAuthorized =
    role === "admin" ||
    role === ("platform_admin" as any) ||
    role === ("marketing_manager" as any) ||
    hasPermission("crm.campaign.create");

  const { data: connections, isLoading } = useQuery({
    queryKey: ["crm-connections", companyId],
    enabled: isAuthorized && !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("ad_platform_connections")
        .select("*")
        .order("connected_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConnectionRow[];
    },
  });

  // Handle OAuth redirect feedback
  useEffect(() => {
    const status = searchParams.get("status");
    const platform = searchParams.get("platform") ?? "meta";
    const reason = searchParams.get("reason");
    if (!status) return;

    const platformLabel =
      PLATFORMS.find((p) => p.key === platform)?.name ?? platform;

    if (status === "success") {
      toast.success(`Conexão ${platformLabel} criada com sucesso`);
      qc.invalidateQueries({ queryKey: ["crm-connections"] });
    } else if (status === "error") {
      const msg =
        (reason && ERROR_MESSAGES[reason]) ||
        "Falha ao conectar. Tente novamente.";
      toast.error(`Erro ao conectar ${platformLabel}`, { description: msg });
    }

    // Clean URL
    const url = new URL(window.location.href);
    url.searchParams.delete("status");
    url.searchParams.delete("platform");
    url.searchParams.delete("reason");
    url.searchParams.delete("conn");
    window.history.replaceState({}, "", url.toString());
    setSearchParams(new URLSearchParams(), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectionsByPlatform = useMemo(() => {
    const map = new Map<Platform, ConnectionRow[]>();
    (connections ?? []).forEach((c) => {
      const arr = map.get(c.platform) ?? [];
      arr.push(c);
      map.set(c.platform, arr);
    });
    return map;
  }, [connections]);

  const handleConnectMeta = async () => {
    if (!companyId || !user) {
      toast.error("Empresa ou usuário não disponível.");
      return;
    }
    setConnectingPlatform("meta");
    try {
      const { data: state, error } = await (supabase as any)
        .schema("crm")
        .from("oauth_states")
        .insert({
          company_id: companyId,
          user_id: user.id,
          platform: "meta",
        })
        .select("id")
        .single();

      if (error || !state) throw error ?? new Error("Falha ao criar state");

      const url =
        `https://www.facebook.com/v18.0/dialog/oauth` +
        `?client_id=${META_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}` +
        `&state=${state.id}` +
        `&scope=${encodeURIComponent(META_SCOPES)}` +
        `&response_type=code`;

      window.location.href = url;
    } catch (e: any) {
      console.error("[crm/connections] connect meta failed:", e);
      toast.error("Não foi possível iniciar a conexão", {
        description: e?.message ?? String(e),
      });
      setConnectingPlatform(null);
    }
  };

  const handleDisconnect = async () => {
    if (!confirmDisconnect) return;
    setDisconnecting(true);
    try {
      const { error } = await (supabase as any)
        .schema("crm")
        .from("ad_platform_connections")
        .update({
          status: "disconnected",
          disconnected_at: new Date().toISOString(),
        })
        .eq("id", confirmDisconnect.id);
      if (error) throw error;
      toast.success("Conexão desligada");
      setConfirmDisconnect(null);
      qc.invalidateQueries({ queryKey: ["crm-connections"] });
    } catch (e: any) {
      toast.error("Falha ao desligar", { description: e?.message ?? String(e) });
    } finally {
      setDisconnecting(false);
    }
  };

  if (authLoading || companyLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthorized) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conexões de Mídia</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie integrações com plataformas de anúncios usadas para campanhas e atribuição.
        </p>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {PLATFORMS.map((p) => {
            const conns = (connectionsByPlatform.get(p.key) ?? []).filter(
              (c) => c.status !== "disconnected",
            );
            const Icon = p.icon;

            if (conns.length === 0) {
              return (
                <Card key={p.key} className={p.comingSoon ? "opacity-60" : ""}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-muted p-2">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{p.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {p.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {p.comingSoon ? (
                      <Button disabled variant="outline" className="w-full">
                        Em breve
                      </Button>
                    ) : (
                      <Button
                        onClick={handleConnectMeta}
                        disabled={connectingPlatform === p.key}
                        className="w-full"
                      >
                        {connectingPlatform === p.key ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plug className="mr-2 h-4 w-4" />
                            Conectar {p.name.split(" ")[0]}
                          </>
                        )}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            }

            return conns.map((conn) => {
              const expiresLabel = conn.expires_at
                ? formatDistanceToNow(parseISO(conn.expires_at), {
                    locale: ptBR,
                    addSuffix: true,
                  })
                : "sem expiração";
              return (
                <Card key={conn.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-muted p-2">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{p.name}</CardTitle>
                          <CardDescription className="text-xs">
                            {conn.external_business_name ?? "Sem Business Manager"}
                          </CardDescription>
                        </div>
                      </div>
                      <StatusBadge status={conn.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>Token expira {expiresLabel}</div>
                      {conn.connected_at && (
                        <div>
                          Conectada{" "}
                          {formatDistanceToNow(parseISO(conn.connected_at), {
                            locale: ptBR,
                            addSuffix: true,
                          })}
                        </div>
                      )}
                      {conn.last_error && (
                        <div className="text-destructive">Último erro: {conn.last_error}</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleConnectMeta}
                        disabled={connectingPlatform === p.key}
                        className="flex-1"
                      >
                        {connectingPlatform === p.key ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Reconectar
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDisconnect(conn)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Power className="mr-2 h-4 w-4" />
                        Desligar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            });
          })}
        </div>
      )}

      <AlertDialog
        open={!!confirmDisconnect}
        onOpenChange={(o) => !o && setConfirmDisconnect(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desligar conexão?</AlertDialogTitle>
            <AlertDialogDescription>
              Campanhas ativas vinculadas a{" "}
              <strong>{confirmDisconnect?.external_business_name}</strong> deixarão
              de sincronizar até que você reconecte. Esta ação pode ser revertida
              clicando em "Reconectar".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDisconnect();
              }}
              disabled={disconnecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Desligar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
