import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Loader2, Save, Trash2, Wand2 } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import { ImageUploader } from "../components/ImageUploader";
import { PORTAL_PREVIEW_BASE } from "../constants";
import { useCompany } from "@/hooks/useCompany";
import { toSlug } from "../lib/slug";
import type { BlogPostRow } from "../types";

marked.setOptions({ breaks: true, gfm: true });

type FormState = Omit<BlogPostRow, "id" | "created_at" | "updated_at" | "author_id"> & {
  id?: string;
};

const emptyForm = (companyId: string): FormState => ({
  company_id: companyId,
  slug: "",
  title_pt: "",
  title_en: "",
  content_pt: "",
  content_en: "",
  excerpt_pt: null,
  excerpt_en: null,
  cover_image: null,
  published: false,
  portal_visible: true,
  published_at: null,
});

interface Props {
  mode: "new" | "edit";
}

export default function BlogEditor({ mode }: Props) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { companyId } = useCompany();

  const postQuery = useQuery({
    queryKey: ["crm-blog-post", id],
    queryFn: async (): Promise<BlogPostRow | null> => {
      const { data, error } = await (supabase as any)
        .from("blog_posts")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: mode === "edit" && !!id,
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (mode === "new" && companyId) {
      setForm(emptyForm(companyId));
      setSlugTouched(false);
    } else if (postQuery.data) {
      const { author_id, created_at, updated_at, ...rest } = postQuery.data;
      setForm(rest);
      setSlugTouched(true);
    }
  }, [mode, postQuery.data, companyId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const onTitlePtChange = (v: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, title_pt: v };
      if (!slugTouched) next.slug = toSlug(v);
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (next: FormState) => {
      if (!next.slug) throw new Error("Slug obrigatório.");
      if (!next.title_pt) throw new Error("Título PT obrigatório.");

      const wasPublished = postQuery.data?.published ?? false;
      const becomingPublished = next.published && !wasPublished;
      const publishedAt =
        becomingPublished && !next.published_at ? new Date().toISOString() : next.published_at;

      const payload: any = {
        ...next,
        published_at: publishedAt,
        content_en: next.content_en || next.content_pt,
        title_en: next.title_en || next.title_pt,
        author_id: user?.id ?? null,
      };

      if (mode === "new") {
        const { data, error } = await (supabase as any)
          .from("blog_posts")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      } else {
        delete payload.id;
        const { error } = await (supabase as any).from("blog_posts").update(payload).eq("id", id);
        if (error) throw error;
        return id;
      }
    },
    onSuccess: (newId) => {
      toast.success("Post guardado.");
      qc.invalidateQueries({ queryKey: ["crm-blog-list"] });
      qc.invalidateQueries({ queryKey: ["crm-blog-post", newId] });
      if (mode === "new") navigate(`/crm/blog/${newId}`, { replace: true });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("blog_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Post eliminado.");
      qc.invalidateQueries({ queryKey: ["crm-blog-list"] });
      navigate("/crm/blog", { replace: true });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  if (mode === "edit" && postQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> A carregar…
      </div>
    );
  }
  if (mode === "edit" && !postQuery.data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/crm/blog">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
        <Card className="p-6 text-sm text-muted-foreground">Post não encontrado.</Card>
      </div>
    );
  }
  if (!form) return null;

  const portalPtUrl = `${PORTAL_PREVIEW_BASE}/pt/blog/${form.slug}`;
  const portalEnUrl = `${PORTAL_PREVIEW_BASE}/en/blog/${form.slug}`;
  const canOpenPortal = mode === "edit" && form.published && form.portal_visible && !!form.slug;

  // datetime-local input expects "YYYY-MM-DDTHH:mm"
  const publishedAtLocal = useMemo(() => {
    if (!form.published_at) return "";
    const d = new Date(form.published_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [form.published_at]);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/crm/blog">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-foreground">
            {mode === "new" ? "Novo post" : form.title_pt || "(sem título)"}
          </h1>
          {form.slug && (
            <p className="text-xs text-muted-foreground font-mono">/{form.slug}</p>
          )}
        </div>
        {canOpenPortal && (
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={portalPtUrl} target="_blank" rel="noreferrer">
                PT <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={portalEnUrl} target="_blank" rel="noreferrer">
                EN <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        )}
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <Field label="Slug">
            <div className="flex gap-2">
              <Input
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", toSlug(e.target.value));
                }}
                placeholder="ex.: novidades-coala-2026"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSlugTouched(false);
                  set("slug", toSlug(form.title_pt));
                }}
              >
                <Wand2 className="h-4 w-4" /> Auto
              </Button>
            </div>
          </Field>
          <Field label="Data de publicação" hint="Mostrado no portal">
            <Input
              type="datetime-local"
              value={publishedAtLocal}
              onChange={(e) =>
                set(
                  "published_at",
                  e.target.value ? new Date(e.target.value).toISOString() : null,
                )
              }
              className="w-full md:w-64"
            />
          </Field>
        </div>

        <ImageUploader
          label="Cover (16:9)"
          value={form.cover_image}
          onChange={(v) => set("cover_image", v)}
          aspectRatio="16/9"
        />

        <Tabs defaultValue="pt">
          <TabsList>
            <TabsTrigger value="pt">Português</TabsTrigger>
            <TabsTrigger value="en">English</TabsTrigger>
          </TabsList>
          <TabsContent value="pt">
            <LocaleFields
              title={form.title_pt}
              onTitle={onTitlePtChange}
              excerpt={form.excerpt_pt}
              onExcerpt={(v) => set("excerpt_pt", v)}
              content={form.content_pt}
              onContent={(v) => set("content_pt", v)}
            />
          </TabsContent>
          <TabsContent value="en">
            <LocaleFields
              title={form.title_en}
              onTitle={(v) => set("title_en", v)}
              titlePlaceholder="Se vazio → usa PT"
              excerpt={form.excerpt_en}
              onExcerpt={(v) => set("excerpt_en", v)}
              content={form.content_en}
              onContent={(v) => set("content_en", v)}
              contentHint="Se vazio → usa PT"
            />
          </TabsContent>
        </Tabs>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">Publicado</div>
              <div className="text-xs text-muted-foreground">
                Marca o post como pronto. Define data automaticamente.
              </div>
            </div>
            <Switch checked={form.published} onCheckedChange={(v) => set("published", v)} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">Visível no portal</div>
              <div className="text-xs text-muted-foreground">
                Oculta temporariamente sem despublicar.
              </div>
            </div>
            <Switch
              checked={form.portal_visible}
              onCheckedChange={(v) => set("portal_visible", v)}
            />
          </div>
        </div>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:pl-72">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
          {mode === "edit" ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm("Eliminar este post? Esta acção é irreversível.")) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            onClick={() => saveMutation.mutate(form)}
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

function LocaleFields({
  title,
  onTitle,
  titlePlaceholder,
  excerpt,
  onExcerpt,
  content,
  onContent,
  contentHint,
}: {
  title: string;
  onTitle: (v: string) => void;
  titlePlaceholder?: string;
  excerpt: string | null;
  onExcerpt: (v: string | null) => void;
  content: string;
  onContent: (v: string) => void;
  contentHint?: string;
}) {
  const previewHtml = useMemo(
    () => (content ? (marked.parse(content) as string) : ""),
    [content],
  );
  const excerptVal = excerpt ?? "";

  return (
    <div className="space-y-4 pt-4">
      <Field label="Título">
        <Input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder={titlePlaceholder}
        />
      </Field>
      <Field label="Excerpt" hint={`${excerptVal.length} caracteres · 2-3 linhas`}>
        <Textarea
          rows={3}
          value={excerptVal}
          onChange={(e) => onExcerpt(e.target.value || null)}
        />
      </Field>
      <Field label="Conteúdo" hint={contentHint ?? "Markdown — GFM + quebras de linha"}>
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
              value={content}
              onChange={(e) => onContent(e.target.value)}
            />
          </TabsContent>
          <TabsContent value="preview">
            <div
              className="prose prose-sm dark:prose-invert max-w-none min-h-[420px] rounded-md border border-border bg-background p-4 overflow-auto"
              dangerouslySetInnerHTML={{
                __html: previewHtml || "<p class='text-muted-foreground'>Sem conteúdo.</p>",
              }}
            />
          </TabsContent>
          <TabsContent value="split">
            <div className="grid gap-3 md:grid-cols-2">
              <Textarea
                className="min-h-[420px] font-mono text-sm"
                value={content}
                onChange={(e) => onContent(e.target.value)}
              />
              <div
                className="prose prose-sm dark:prose-invert max-w-none min-h-[420px] rounded-md border border-border bg-background p-4 overflow-auto"
                dangerouslySetInnerHTML={{
                  __html: previewHtml || "<p class='text-muted-foreground'>Sem conteúdo.</p>",
                }}
              />
            </div>
          </TabsContent>
        </Tabs>
      </Field>
    </div>
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
