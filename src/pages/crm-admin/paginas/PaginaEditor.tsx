import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ExternalLink, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { marked } from "marked";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/contexts/AuthContext";
import { ImageUploader } from "../components/ImageUploader";
import { PORTAL_PREVIEW_BASE } from "../constants";
import { useCompany } from "@/hooks/useCompany";
import type { StaticPageRow, StaticPageStatus } from "../types";

marked.setOptions({ breaks: true, gfm: true });

type LocaleForm = {
  id?: string;
  title: string;
  content_md: string;
  meta_title: string;
  meta_description: string;
  og_image_url: string | null;
  status: StaticPageStatus;
  published_at: string | null;
};

const emptyLocale = (): LocaleForm => ({
  title: "",
  content_md: "",
  meta_title: "",
  meta_description: "",
  og_image_url: null,
  status: "draft",
  published_at: null,
});

function fromRow(r: StaticPageRow): LocaleForm {
  return {
    id: r.id,
    title: r.title ?? "",
    content_md: r.content_md ?? "",
    meta_title: r.meta_title ?? "",
    meta_description: r.meta_description ?? "",
    og_image_url: r.og_image_url,
    status: r.status,
    published_at: r.published_at,
  };
}

export default function PaginaEditor() {
  const { companyId } = useCompany();
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["crm-pagina", slug],
    queryFn: async (): Promise<StaticPageRow[]> => {
      const { data, error } = await (supabase as any)
        .from("static_pages")
        .select("*")
        .eq("company_id", companyId)
        .eq("slug", slug);
      if (error) throw error;
      return (data ?? []) as StaticPageRow[];
    },
    enabled: !!slug,
  });

  const initial = useMemo(() => {
    const rows = query.data ?? [];
    const pt = rows.find((r) => r.locale === "pt");
    const en = rows.find((r) => r.locale === "en");
    return {
      pt: pt ? fromRow(pt) : emptyLocale(),
      en: en ? fromRow(en) : emptyLocale(),
    };
  }, [query.data]);

  const [pt, setPt] = useState<LocaleForm>(emptyLocale());
  const [en, setEn] = useState<LocaleForm>(emptyLocale());

  useEffect(() => {
    if (query.data) {
      setPt(initial.pt);
      setEn(initial.en);
    }
  }, [query.data, initial.pt, initial.en]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const buildRow = (locale: "pt" | "en", f: LocaleForm, existing: LocaleForm) => {
        const wasPublished = existing.status === "published";
        const becomingPublished = f.status === "published" && !wasPublished;
        const publishedAt =
          becomingPublished && !f.published_at ? new Date().toISOString() : f.published_at;
        return {
          company_id: companyId,
          slug,
          locale,
          title: f.title || null,
          content_md: f.content_md || null,
          meta_title: f.meta_title || null,
          meta_description: f.meta_description || null,
          og_image_url: f.og_image_url,
          status: f.status,
          published_at: publishedAt,
          updated_by: user?.id ?? null,
          created_by: existing.id ? undefined : user?.id ?? null,
        };
      };
      const rows = [
        buildRow("pt", pt, initial.pt),
        buildRow("en", en, initial.en),
      ];
      const { error } = await (supabase as any)
        .from("static_pages")
        .upsert(rows, { onConflict: "company_id,slug,locale" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Página guardada.");
      qc.invalidateQueries({ queryKey: ["crm-pagina", slug] });
      qc.invalidateQueries({ queryKey: ["crm-paginas-list"] });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("static_pages")
        .delete()
        .eq("company_id", companyId)
        .eq("slug", slug);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Página eliminada.");
      qc.invalidateQueries({ queryKey: ["crm-paginas-list"] });
      navigate("/crm/paginas", { replace: true });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> A carregar…
      </div>
    );
  }

  const portalUrl = `${PORTAL_PREVIEW_BASE}/pt/${slug}`;
  const canOpenPortal = pt.status === "published";

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/crm/paginas">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-foreground">
            {pt.title || en.title || slug}
          </h1>
          <p className="text-xs text-muted-foreground font-mono">/{slug}</p>
        </div>
        {canOpenPortal && (
          <Button asChild variant="outline" size="sm">
            <a href={portalUrl} target="_blank" rel="noreferrer">
              Ver no portal <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>

      <Tabs defaultValue="pt">
        <TabsList>
          <TabsTrigger value="pt">Português</TabsTrigger>
          <TabsTrigger value="en">English</TabsTrigger>
        </TabsList>
        <TabsContent value="pt">
          <LocaleEditor value={pt} onChange={setPt} />
        </TabsContent>
        <TabsContent value="en">
          <LocaleEditor value={en} onChange={setEn} />
        </TabsContent>
      </Tabs>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:pl-72">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (
                confirm(
                  `Eliminar página "${slug}" (PT + EN)? Esta acção é irreversível.`,
                )
              ) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4" /> Eliminar
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}

function LocaleEditor({
  value,
  onChange,
}: {
  value: LocaleForm;
  onChange: (next: LocaleForm) => void;
}) {
  const set = <K extends keyof LocaleForm>(key: K, v: LocaleForm[K]) =>
    onChange({ ...value, [key]: v });

  const previewHtml = useMemo(
    () => (value.content_md ? (marked.parse(value.content_md) as string) : ""),
    [value.content_md],
  );

  return (
    <Card className="space-y-4 p-4">
      <Field label="Título">
        <Input value={value.title} onChange={(e) => set("title", e.target.value)} />
      </Field>

      <Field label="Conteúdo" hint="Markdown — GFM + quebras de linha">
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">Editar</TabsTrigger>
            <TabsTrigger value="preview">Pré-visualizar</TabsTrigger>
            <TabsTrigger value="split" className="hidden md:inline-flex">
              Dividido
            </TabsTrigger>
          </TabsList>
          <TabsContent value="edit">
            <Textarea
              className="min-h-[420px] font-mono text-sm"
              value={value.content_md}
              onChange={(e) => set("content_md", e.target.value)}
            />
          </TabsContent>
          <TabsContent value="preview">
            <div
              className="prose prose-sm dark:prose-invert max-w-none min-h-[420px] rounded-md border border-border bg-background p-4 overflow-auto"
              dangerouslySetInnerHTML={{ __html: previewHtml || "<p class='text-muted-foreground'>Sem conteúdo.</p>" }}
            />
          </TabsContent>
          <TabsContent value="split">
            <div className="grid gap-3 md:grid-cols-2">
              <Textarea
                className="min-h-[420px] font-mono text-sm"
                value={value.content_md}
                onChange={(e) => set("content_md", e.target.value)}
              />
              <div
                className="prose prose-sm dark:prose-invert max-w-none min-h-[420px] rounded-md border border-border bg-background p-4 overflow-auto"
                dangerouslySetInnerHTML={{ __html: previewHtml || "<p class='text-muted-foreground'>Sem conteúdo.</p>" }}
              />
            </div>
          </TabsContent>
        </Tabs>
      </Field>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
            <ChevronDown className="h-4 w-4" /> SEO & social (avançado)
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Meta title">
              <Input
                value={value.meta_title}
                onChange={(e) => set("meta_title", e.target.value)}
              />
            </Field>
            <Field
              label="Meta description"
              hint={`${value.meta_description.length}/160`}
            >
              <Textarea
                rows={3}
                maxLength={200}
                value={value.meta_description}
                onChange={(e) => set("meta_description", e.target.value)}
              />
            </Field>
          </div>
          <ImageUploader
            label="OG image"
            value={value.og_image_url}
            onChange={(v) => set("og_image_url", v)}
            aspectRatio="1200/630"
          />
        </CollapsibleContent>
      </Collapsible>

      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <div>
          <div className="text-sm font-medium">Publicado</div>
          <div className="text-xs text-muted-foreground">
            Cada idioma tem o seu próprio estado.
          </div>
        </div>
        <Switch
          checked={value.status === "published"}
          onCheckedChange={(v) => set("status", v ? "published" : "draft")}
        />
      </div>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
