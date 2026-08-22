// GooglePublishPanel — publicador de campanhas de Pesquisa no Google Ads.
//
// Espelha a mecânica do MetaPublishPanel:
//  - Ao abrir, CARREGA o plano existente do evento. Nunca regenera sozinho.
//  - Pré-visualização (dry-run) antes de qualquer escrita no Google.
//  - Publica sempre EM PAUSA; ativar exige modal com checkbox obrigatória.
//  - Kill switch "Pausar campanha" quando ativa.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  Pause,
  Play,
  Plus,
  Rocket,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { lisbonTodayISO } from "@/lib/date-lisbon";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  RSA_LIMITS,
  graphemeLength,
  validatePlan,
  type AdGroupDraft,
  type MatchType,
  type PlanDraft,
} from "@/lib/google-rsa-validation";

const MATCH_TYPES: MatchType[] = ["BROAD", "PHRASE", "EXACT"];

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

interface Props {
  eventId: string;
}

type PlanRow = Record<string, any>;

function novoGrupo(): AdGroupDraft & { uid: string } {
  return {
    uid: uid(),
    nome: "Bilhetes",
    keywords: [{ uid: uid(), text: "", match_type: "PHRASE" }],
    negativas: [],
    ads: [{ uid: uid(), headlines: ["", "", ""], descriptions: ["", ""], path1: "", path2: "" }],
  };
}

export default function GooglePublishPanel({ eventId }: Props) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();

  // Datas de negócio em Europe/Lisbon (nunca `new Date()` cru).
  const hojeLisboa = useMemo(() => lisbonTodayISO(), []);


  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<null | "dry" | "publish" | "activate">(null);
  const [dryRun, setDryRun] = useState<any>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const { data: evento } = useQuery({
    queryKey: ["google-publish-event", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, cities(name, country)")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const cidade = (data as any)?.cities ?? null;
      return {
        id: data.id as string,
        name: data.name as string,
        start_date: null as string | null,
        end_date: (data.date as string | null) ?? null,
        city: (cidade?.name as string | null) ?? null,
        country: (cidade?.country as string | null) ?? null,
      };
    },
  });

  const { data: plano, isLoading } = useQuery({
    queryKey: ["google-publish-plan", eventId, companyId],
    enabled: !!eventId && !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("google_publish_plan")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as PlanRow) ?? null;
    },
  });

  const { data: conn } = useQuery({
    queryKey: ["google-connection", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("ad_platform_connections")
        .select("id, selected_ad_account_id, login_customer_id")
        .eq("platform", "google")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PlanRow | null;
    },
  });

  const { data: metas } = useQuery({
    queryKey: ["google-conversion-actions", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("google_conversion_action")
        .select("resource_name, name, status, category")
        .order("name");
      if (error) throw error;
      return (data ?? []) as PlanRow[];
    },
  });

  // Carrega o plano existente; se não houver, prepara um rascunho a partir do evento.
  useEffect(() => {
    if (isLoading) return;
    if (plano) {
      setForm({ ...plano, ad_groups: plano.ad_groups ?? [] });
      return;
    }
    if (!evento) return;
    setForm({
      id: null,
      nome_campanha: `${evento.name} — Pesquisa`,
      objetivo: "CONVERSIONS",
      estrategia_lance: "MAXIMIZE_CONVERSIONS",
      conversion_action_ref: null,
      orcamento_diario_micros: 10_000_000,
      moeda: "EUR",
      link_destino: "",
      start_date: evento.start_date ?? null,
      end_date: evento.end_date ?? null,
      eu_political_advertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
      geo: { cidade: evento.city ?? null, paises: [evento.country === "Brasil" ? "BR" : "PT"], location_ids: [] },
      idiomas: [evento.country === "Espanha" ? "es" : "pt"],
      ad_groups: [novoGrupo()],
      estado: "rascunho",
    });
  }, [plano, evento, isLoading]);

  const draft: PlanDraft | null = useMemo(() => {
    if (!form) return null;
    return {
      nome_campanha: form.nome_campanha ?? "",
      orcamento_diario_micros: Number(form.orcamento_diario_micros ?? 0),
      link_destino: form.link_destino ?? "",
      objetivo: form.objetivo,
      estrategia_lance: form.estrategia_lance,
      conversion_action_ref: form.conversion_action_ref,
      start_date: form.start_date,
      end_date: form.end_date,
      geo: form.geo ?? {},
      idiomas: form.idiomas ?? [],
      ad_groups: form.ad_groups ?? [],
    };
  }, [form]);

  const erros = useMemo(() => (draft ? validatePlan(draft) : []), [draft]);
  const estado: string = form?.estado ?? "rascunho";
  const bloqueado = estado === "a_publicar";
  const publicado = ["publicado", "ativo", "pausado"].includes(estado);

  const patch = (p: Record<string, unknown>) => setForm((f: any) => ({ ...f, ...p }));
  const patchGroup = (gi: number, p: Record<string, unknown>) =>
    setForm((f: any) => {
      const groups = [...f.ad_groups];
      groups[gi] = { ...groups[gi], ...p };
      return { ...f, ad_groups: groups };
    });

  async function guardar(): Promise<string | null> {
    if (!companyId || !conn?.selected_ad_account_id) {
      toast.error("Não há ligação Google Ads ativa nesta empresa.");
      return null;
    }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        event_id: eventId,
        connection_id: conn.id,
        customer_id: String(conn.selected_ad_account_id),
        login_customer_id: conn.login_customer_id ?? null,
        nome_campanha: form.nome_campanha,
        objetivo: form.objetivo,
        estrategia_lance: form.estrategia_lance,
        conversion_action_ref: form.conversion_action_ref || null,
        orcamento_diario_micros: Number(form.orcamento_diario_micros),
        moeda: form.moeda ?? "EUR",
        link_destino: form.link_destino,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        eu_political_advertising:
          form.eu_political_advertising || "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        geo: form.geo ?? {},
        idiomas: form.idiomas ?? [],
        ad_groups: form.ad_groups ?? [],
        estado: erros.length === 0 ? "pronto_a_publicar" : "rascunho",
      };
      if (form.id) {
        const { error } = await (supabase as any)
          .schema("crm")
          .from("google_publish_plan")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
        return form.id as string;
      }
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("google_publish_plan")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      setForm((f: any) => ({ ...f, id: data.id, estado: payload.estado }));
      return data.id as string;
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível guardar o plano.");
      return null;
    } finally {
      setSaving(false);
      queryClient.invalidateQueries({ queryKey: ["google-publish-plan", eventId, companyId] });
    }
  }

  async function invocar(fn: string, extra: Record<string, unknown>, planId: string) {
    const { data, error } = await supabase.functions.invoke(fn, {
      body: { company_id: companyId, plan_id: planId, ...extra },
    });
    if (error) throw new Error(error.message);
    return data as any;
  }

  async function preVisualizar() {
    const planId = await guardar();
    if (!planId) return;
    setBusy("dry");
    try {
      const res = await invocar("crm-google-publish-execute", { dry_run: true }, planId);
      if (!res?.ok) {
        setDryRun(null);
        toast.error(res?.error_user_msg ?? "A pré-visualização falhou.");
        return;
      }
      setDryRun(res);
      toast.success(`Pré-visualização pronta — ${res.total_passos} passos.`);
    } catch (e: any) {
      toast.error(e?.message ?? "A pré-visualização falhou.");
    } finally {
      setBusy(null);
    }
  }

  async function publicar() {
    const planId = await guardar();
    if (!planId) return;
    setBusy("publish");
    try {
      const res = await invocar("crm-google-publish-execute", { dry_run: false }, planId);
      if (!res?.ok) {
        toast.error(res?.error_user_msg ?? "A publicação falhou.");
      } else {
        toast.success("Campanha criada no Google Ads — EM PAUSA. Nada gasta até ativares.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "A publicação falhou.");
    } finally {
      setBusy(null);
      queryClient.invalidateQueries({ queryKey: ["google-publish-plan", eventId, companyId] });
    }
  }

  async function ativarOuPausar(acao: "ativar" | "pausar") {
    if (!form?.id) return;
    setBusy("activate");
    try {
      const res = await invocar("crm-google-publish-activate", { acao }, form.id);
      if (!res?.ok) toast.error(res?.error_user_msg ?? "A operação falhou.");
      else toast.success(acao === "ativar" ? "Campanha ATIVA no Google Ads." : "Campanha em pausa.");
    } catch (e: any) {
      toast.error(e?.message ?? "A operação falhou.");
    } finally {
      setBusy(null);
      setConfirmOpen(false);
      setConfirmChecked(false);
      queryClient.invalidateQueries({ queryKey: ["google-publish-plan", eventId, companyId] });
    }
  }

  if (isLoading || !form) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> A carregar o plano…
      </div>
    );
  }

  const orcamentoEuros = (Number(form.orcamento_diario_micros ?? 0) / 1_000_000).toFixed(2);

  return (
    <div className="space-y-5">
      {!conn?.selected_ad_account_id && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6 flex items-start gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p>
              Não há uma conta Google Ads ligada e ativa nesta empresa. Podes preparar o
              rascunho, mas a publicação fica indisponível.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Estado */}
      <Card
        className={
          estado === "ativo"
            ? "border-emerald-500/40 bg-emerald-500/5"
            : publicado
              ? "border-amber-500/40 bg-amber-500/5"
              : ""
        }
      >
        <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{estado}</Badge>
              {estado === "ativo" && (
                <span className="text-sm font-medium text-emerald-600">ATIVA — a gastar</span>
              )}
              {estado === "publicado" && (
                <span className="text-sm font-medium text-amber-700">Publicada em PAUSA</span>
              )}
              {estado === "pausado" && (
                <span className="text-sm font-medium text-amber-700">Em pausa</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {form.google_campaign_id
                ? `Campanha Google #${form.google_campaign_id} · ${orcamentoEuros} ${form.moeda}/dia`
                : `Orçamento previsto: ${orcamentoEuros} ${form.moeda}/dia`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(estado === "publicado" || estado === "pausado") && (
              <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)} disabled={!!busy}>
                <Play className="h-3.5 w-3.5 mr-1.5" />
                {estado === "pausado" ? "Reativar campanha" : "Ativar campanha — começa a gastar"}
              </Button>
            )}
            {estado === "ativo" && (
              <Button
                variant="outline"
                size="sm"
                disabled={!!busy}
                onClick={() => {
                  if (confirm("Pausar a campanha no Google Ads agora?")) ativarOuPausar("pausar");
                }}
              >
                <Pause className="h-3.5 w-3.5 mr-1.5" /> Pausar campanha
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Configuração */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campanha de Pesquisa</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Nome da campanha</Label>
            <Input
              value={form.nome_campanha ?? ""}
              disabled={publicado || bloqueado}
              onChange={(e) => patch({ nome_campanha: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Link de destino</Label>
            <Input
              placeholder="https://…"
              value={form.link_destino ?? ""}
              disabled={publicado || bloqueado}
              onChange={(e) => patch({ link_destino: e.target.value })}
            />
          </div>
          <div>
            <Label>Orçamento diário ({form.moeda})</Label>
            <Input
              type="number"
              min={1}
              step="0.5"
              value={orcamentoEuros}
              disabled={publicado || bloqueado}
              onChange={(e) =>
                patch({ orcamento_diario_micros: Math.round(Number(e.target.value || 0) * 1_000_000) })
              }
            />
          </div>
          <div>
            <Label>Estratégia de lance</Label>
            <Select
              value={form.estrategia_lance}
              disabled={publicado || bloqueado}
              onValueChange={(v) => patch({ estrategia_lance: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MAXIMIZE_CONVERSIONS">Maximizar conversões</SelectItem>
                <SelectItem value="MAXIMIZE_CLICKS">Maximizar cliques</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Meta de conversão</Label>
            <Select
              value={form.conversion_action_ref ?? "__none"}
              disabled={publicado || bloqueado}
              onValueChange={(v) => patch({ conversion_action_ref: v === "__none" ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="Sem meta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sem meta (só cliques)</SelectItem>
                {(metas ?? []).map((m) => (
                  <SelectItem key={m.resource_name} value={m.resource_name}>
                    {m.name} {m.status ? `· ${m.status}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(metas ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Ainda não há metas de conversão lidas da conta.
              </p>
            )}
          </div>
          <div>
            <Label>Cidade alvo</Label>
            <Input
              value={form.geo?.cidade ?? ""}
              disabled={publicado || bloqueado}
              onChange={(e) => patch({ geo: { ...(form.geo ?? {}), cidade: e.target.value } })}
            />
          </div>
          <div>
            <Label>Localizações Google (IDs)</Label>
            <Input
              placeholder="ex.: 2620"
              value={(form.geo?.location_ids ?? []).join(", ")}
              disabled={publicado || bloqueado}
              onChange={(e) =>
                patch({
                  geo: {
                    ...(form.geo ?? {}),
                    location_ids: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  },
                })
              }
            />
          </div>
          <div>
            <Label>Idiomas</Label>
            <Input
              value={(form.idiomas ?? []).join(", ")}
              disabled={publicado || bloqueado}
              onChange={(e) =>
                patch({ idiomas: e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) })
              }
            />
          </div>
          <div>
            <Label>Início</Label>
            <DatePicker
              value={form.start_date ?? ""}
              disabled={publicado || bloqueado}
              minDate={hojeLisboa}
              maxDate={form.end_date ?? undefined}
              onChange={(v) => patch({ start_date: v || null })}
            />
          </div>
          <div>
            <Label>Fim</Label>
            <DatePicker
              value={form.end_date ?? ""}
              disabled={publicado || bloqueado}
              minDate={form.start_date ?? hojeLisboa}
              onChange={(v) => patch({ end_date: v || null })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Grupos de anúncios */}
      {(form.ad_groups ?? []).map((g: any, gi: number) => (
        <Card key={g.uid ?? gi}>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Grupo de anúncios</CardTitle>
            {(form.ad_groups ?? []).length > 1 && !publicado && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  patch({ ad_groups: form.ad_groups.filter((_: any, i: number) => i !== gi) })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome do grupo</Label>
              <Input
                value={g.nome ?? ""}
                disabled={publicado || bloqueado}
                onChange={(e) => patchGroup(gi, { nome: e.target.value })}
              />
            </div>

            <div>
              <Label>Palavras-chave (uma por linha)</Label>
              <Textarea
                rows={5}
                value={(g.keywords ?? []).map((k: any) => k.text).join("\n")}
                disabled={publicado || bloqueado}
                onChange={(e) => {
                  const linhas = e.target.value.split("\n");
                  const antigas = g.keywords ?? [];
                  patchGroup(gi, {
                    keywords: linhas.map((t, i) => ({
                      uid: antigas[i]?.uid ?? uid(),
                      text: t,
                      match_type: antigas[i]?.match_type ?? "PHRASE",
                      google_criterion_resource: antigas[i]?.google_criterion_resource,
                    })),
                  });
                }}
              />
              <div className="flex items-center gap-2 mt-2">
                <Label className="text-xs text-muted-foreground">Correspondência</Label>
                <Select
                  value={(g.keywords ?? [])[0]?.match_type ?? "PHRASE"}
                  disabled={publicado || bloqueado}
                  onValueChange={(v) =>
                    patchGroup(gi, {
                      keywords: (g.keywords ?? []).map((k: any) => ({ ...k, match_type: v })),
                    })
                  }
                >
                  <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATCH_TYPES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m === "BROAD" ? "Ampla" : m === "PHRASE" ? "De frase" : "Exata"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Palavras-chave a excluir (uma por linha)</Label>
              <Textarea
                rows={3}
                value={(g.negativas ?? []).map((k: any) => k.text).join("\n")}
                disabled={publicado || bloqueado}
                onChange={(e) => {
                  const linhas = e.target.value.split("\n").filter((l) => l.trim() !== "");
                  const antigas = g.negativas ?? [];
                  patchGroup(gi, {
                    negativas: linhas.map((t, i) => ({
                      uid: antigas[i]?.uid ?? uid(),
                      text: t,
                      match_type: antigas[i]?.match_type ?? "PHRASE",
                      google_criterion_resource: antigas[i]?.google_criterion_resource,
                    })),
                  });
                }}
              />
            </div>

            {(g.ads ?? []).map((a: any, ai: number) => (
              <div key={a.uid ?? ai} className="rounded-md border border-border p-3 space-y-3">
                <p className="text-sm font-medium">Anúncio responsivo</p>
                <div>
                  <Label className="text-xs">
                    Títulos ({RSA_LIMITS.headlineMin}–{RSA_LIMITS.headlineMax}, máx. {RSA_LIMITS.headlineLen} caracteres)
                  </Label>
                  <Textarea
                    rows={5}
                    value={(a.headlines ?? []).join("\n")}
                    disabled={publicado || bloqueado}
                    onChange={(e) => {
                      const ads = [...(g.ads ?? [])];
                      ads[ai] = { ...a, headlines: e.target.value.split("\n") };
                      patchGroup(gi, { ads });
                    }}
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(a.headlines ?? []).filter((h: string) => h.trim()).map((h: string, i: number) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className={graphemeLength(h) > RSA_LIMITS.headlineLen ? "border-destructive text-destructive" : ""}
                      >
                        {graphemeLength(h)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">
                    Descrições ({RSA_LIMITS.descriptionMin}–{RSA_LIMITS.descriptionMax}, máx. {RSA_LIMITS.descriptionLen} caracteres)
                  </Label>
                  <Textarea
                    rows={4}
                    value={(a.descriptions ?? []).join("\n")}
                    disabled={publicado || bloqueado}
                    onChange={(e) => {
                      const ads = [...(g.ads ?? [])];
                      ads[ai] = { ...a, descriptions: e.target.value.split("\n") };
                      patchGroup(gi, { ads });
                    }}
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(a.descriptions ?? []).filter((d: string) => d.trim()).map((d: string, i: number) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className={graphemeLength(d) > RSA_LIMITS.descriptionLen ? "border-destructive text-destructive" : ""}
                      >
                        {graphemeLength(d)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Caminho 1</Label>
                    <Input
                      value={a.path1 ?? ""}
                      disabled={publicado || bloqueado}
                      onChange={(e) => {
                        const ads = [...(g.ads ?? [])];
                        ads[ai] = { ...a, path1: e.target.value };
                        patchGroup(gi, { ads });
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Caminho 2</Label>
                    <Input
                      value={a.path2 ?? ""}
                      disabled={publicado || bloqueado}
                      onChange={(e) => {
                        const ads = [...(g.ads ?? [])];
                        ads[ai] = { ...a, path2: e.target.value };
                        patchGroup(gi, { ads });
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {!publicado && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => patch({ ad_groups: [...(form.ad_groups ?? []), novoGrupo()] })}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar grupo de anúncios
        </Button>
      )}

      {/* Erros de validação */}
      {erros.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6 space-y-1 text-sm">
            <p className="font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {erros.length} ponto(s) a corrigir antes de publicar
            </p>
            <ul className="list-disc pl-5 text-muted-foreground">
              {erros.slice(0, 12).map((e, i) => (
                <li key={i}>
                  <code className="text-xs">{e.caminho}</code> — {e.motivo}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Ações */}
      {!publicado && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => guardar()} disabled={saving || bloqueado}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Guardar rascunho
          </Button>
          <Button variant="outline" onClick={preVisualizar} disabled={!!busy || erros.length > 0 || bloqueado}>
            {busy === "dry" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Eye className="h-4 w-4 mr-1.5" />}
            Pré-visualizar (sem publicar)
          </Button>
          <Button
            onClick={publicar}
            disabled={!!busy || erros.length > 0 || bloqueado || !conn?.selected_ad_account_id}
          >
            {busy === "publish" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Rocket className="h-4 w-4 mr-1.5" />}
            Publicar em pausa
          </Button>
        </div>
      )}

      {form.publish_error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6 text-sm space-y-1">
            <p className="font-medium">Última falha de publicação</p>
            <pre className="text-xs overflow-auto max-h-48">{JSON.stringify(form.publish_error, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      {dryRun && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Pré-visualização — {dryRun.total_passos} passos, nada foi criado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs overflow-auto max-h-80">{JSON.stringify(dryRun.payloads, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ativar “{form.nome_campanha}”?</DialogTitle>
            <DialogDescription>
              Isto ATIVA a campanha no Google Ads agora e vai começar a gastar dinheiro:
              até {orcamentoEuros} {form.moeda} por dia.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={confirmChecked} onCheckedChange={(v) => setConfirmChecked(!!v)} />
            <span>Compreendo que a campanha vai começar a gastar</span>
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!confirmChecked || busy === "activate"}
              onClick={() => ativarOuPausar("ativar")}
            >
              {busy === "activate" && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Ativar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
