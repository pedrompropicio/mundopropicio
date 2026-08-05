import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Eye, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";

interface SettingRow {
  id: string;
  company_id: string;
  key: string;
  value: any;
  category: string;
  label: string | null;
  description: string | null;
  display_order: number;
}

const CATEGORY_META: Record<string, { title: string; subtitle: string }> = {
  contact: { title: "Contacto", subtitle: "Canais directos com o público" },
  social: { title: "Redes sociais", subtitle: "URLs dos perfis oficiais" },
  stats: { title: "Estatísticas", subtitle: "Números destacados na Home" },
  home: { title: "Quem Somos (homepage)", subtitle: "Texto bilingue da secção \"Quem Somos\" da Home" },
  tracking: { title: "Tracking & Marketing", subtitle: "Pixels e parâmetros de campanhas (site inteiro)" },
  early_bird: { title: "Early Bird", subtitle: "Estado da venda antecipada, link de compra e preço" },
  general: { title: "Geral", subtitle: "Outras configurações" },
};

const CATEGORY_ORDER = ["contact", "social", "stats", "home", "early_bird", "tracking", "general"];

// Datas (YYYY-MM-DD) — usar input type=date
const DATE_KEYS = new Set(["general.vip_coupon_valid_until"]);

const LONG_TEXT_KEYS = new Set(["home.about_pt", "home.about_en"]);

function toInputString(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export default function PortalSettings() {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<SettingRow | null>(null);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [dirty, setDirty] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-portal-settings", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<SettingRow[]> => {
      const { data, error } = await (supabase as any)
        .from("portal_settings")
        .select("*")
        .eq("company_id", companyId)
        .order("category", { ascending: true })
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SettingRow[];
    },
  });

  const settings = useMemo(() => data ?? [], [data]);

  // Reset dirty whenever data refetches
  useEffect(() => {
    setDirty({});
  }, [data]);

  const grouped = useMemo(() => {
    const map = new Map<string, SettingRow[]>();
    for (const s of settings) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    const cats = Array.from(map.keys()).sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
    return cats.map((c) => ({ category: c, items: map.get(c)! }));
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(dirty);
      if (entries.length === 0) return 0;
      const updates = entries.map(([id, val]) =>
        (supabase as any)
          .from("portal_settings")
          .update({ value: val, updated_by: user?.id ?? null })
          .eq("id", id),
      );
      const results = await Promise.all(updates);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
      return entries.length;
    },
    onSuccess: (n) => {
      if (n) toast.success(`${n} configuração(ões) guardada(s).`);
      qc.invalidateQueries({ queryKey: ["crm-portal-settings"] });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("portal_settings")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração removida.");
      qc.invalidateQueries({ queryKey: ["crm-portal-settings"] });
      setToDelete(null);
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const dirtyCount = Object.keys(dirty).length;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações do portal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dados públicos do portal (contactos, redes sociais, estatísticas da Home).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={hideEmpty} onCheckedChange={setHideEmpty} id="hide-empty" />
            <Label htmlFor="hide-empty" className="text-xs text-muted-foreground cursor-pointer">
              {hideEmpty ? (
                <span className="inline-flex items-center gap-1">
                  <EyeOff className="h-3 w-3" /> Esconder vazios
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" /> Mostrar vazios
                </span>
              )}
            </Label>
          </div>
          <Button variant="outline" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Adicionar setting
          </Button>
        </div>
      </div>

      {isLoading && <Card className="p-6 text-center text-muted-foreground">A carregar…</Card>}
      {error && (
        <Card className="p-6 text-center text-destructive">{(error as Error).message}</Card>
      )}
      {!isLoading && settings.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground">
          Sem configurações. Carrega em "Adicionar setting" para começar.
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {grouped.map(({ category, items }) => {
          const visible = hideEmpty
            ? items.filter((s) => {
                const current = dirty[s.id] ?? toInputString(s.value);
                return current.trim() !== "";
              })
            : items;
          if (visible.length === 0 && hideEmpty) return null;
          const meta = CATEGORY_META[category] ?? {
            title: category,
            subtitle: "Configurações personalizadas",
          };
          return (
            <Card key={category} className="p-4 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">{meta.title}</h2>
                <p className="text-xs text-muted-foreground">{meta.subtitle}</p>
              </div>
              <div className="space-y-3">
                {visible.map((s) => {
                  const current = dirty[s.id] ?? toInputString(s.value);
                  const isDirty = dirty[s.id] !== undefined;
                  return (
                    <div key={s.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs font-medium">
                          {s.label || s.key}
                          {isDirty && (
                            <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">
                              modificado
                            </span>
                          )}
                        </Label>
                        <button
                          type="button"
                          onClick={() => setToDelete(s)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Remover setting"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {LONG_TEXT_KEYS.has(s.key) || s.category === "home" ? (
                        <Textarea
                          value={current}
                          onChange={(e) =>
                            setDirty((d) => ({ ...d, [s.id]: e.target.value }))
                          }
                          placeholder={s.description ?? ""}
                          rows={6}
                        />
                      ) : (
                        <Input
                          type={DATE_KEYS.has(s.key) ? "date" : "text"}
                          value={current}
                          onChange={(e) =>
                            setDirty((d) => ({ ...d, [s.id]: e.target.value }))
                          }
                          placeholder={s.description ?? ""}
                        />
                      )}
                      {s.description && (
                        <p className="text-[11px] text-muted-foreground">{s.description}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground font-mono opacity-60">
                        {s.key}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {dirtyCount > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
          <Card className="px-4 py-2 flex items-center gap-3 shadow-lg border-emerald-500/40">
            <span className="text-sm">
              {dirtyCount} configuração(ões) por guardar
            </span>
            <Button variant="outline" size="sm" onClick={() => setDirty({})}>
              Descartar
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Guardar
            </Button>
          </Card>
        </div>
      )}

      {creating && (
        <NewSettingDialog
          open
          onClose={() => setCreating(false)}
          existingKeys={settings.map((s) => s.key)}
          nextOrderByCategory={(cat) =>
            settings.filter((s) => s.category === cat).length + 1
          }
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover setting?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono">{toDelete?.key}</span> será removido. Páginas do
              portal que dependam desta chave deixam de a encontrar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteMutation.mutate(toDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NewSettingDialog({
  open,
  onClose,
  existingKeys,
  nextOrderByCategory,
}: {
  open: boolean;
  onClose: () => void;
  existingKeys: string[];
  nextOrderByCategory: (cat: string) => number;
}) {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("general");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const k = key.trim();
      if (!k) throw new Error("Chave obrigatória.");
      if (existingKeys.includes(k)) throw new Error("Já existe um setting com essa chave.");
      const { error } = await (supabase as any).from("portal_settings").insert({
        company_id: companyId,
        key: k,
        value: value,
        category,
        label: label.trim() || k,
        description: description.trim() || null,
        display_order: nextOrderByCategory(category),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Setting criado.");
      qc.invalidateQueries({ queryKey: ["crm-portal-settings"] });
      onClose();
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo setting personalizado</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Chave * (ex.: contact.phone_office)</Label>
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="categoria.nome_curto"
            />
          </div>
          <div className="space-y-1">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contact">Contacto</SelectItem>
                <SelectItem value="social">Redes sociais</SelectItem>
                <SelectItem value="stats">Estatísticas</SelectItem>
                <SelectItem value="home">Quem Somos (homepage)</SelectItem>
                <SelectItem value="tracking">Tracking &amp; Marketing</SelectItem>
                <SelectItem value="general">Geral</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Etiqueta visível</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Valor</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
