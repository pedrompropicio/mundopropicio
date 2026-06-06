import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Loader2, Save, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { ImageUploader } from "../components/ImageUploader";
import { MP_COMPANY_ID, PORTAL_PREVIEW_BASE } from "../constants";
import { toSlug } from "../lib/slug";
import type { BlogPostRow } from "../types";

type FormState = Omit<BlogPostRow, "id" | "created_at" | "updated_at" | "author_id"> & {
  id?: string;
};

const emptyForm = (): FormState => ({
  company_id: MP_COMPANY_ID,
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
    if (mode === "new") {
      setForm(emptyForm());
      setSlugTouched(false);
    } else if (postQuery.data) {
      const { author_id, created_at, updated_at, ...rest } = postQuery.data;
      setForm(rest);
      setSlugTouched(true);
    }
  }, [mode, postQuery.data]);

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

  const portalUrl = `${PORTAL_PREVIEW_BASE}/pt/blog/${form.slug}`;

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
        </div>
        {mode === "edit" && form.published && form.portal_visible && (
          <Button asChild variant="outline" size="sm">
            <a href={portalUrl} target="_blank" rel="noreferrer">
              Ver no portal <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>

      <Card className="space-y-4 p-4">
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Título (PT)">
            <Input value={form.title_pt} onChange={(e) => onTitlePtChange(e.target.value)} />
          </Field>
          <Field label="Título (EN)">
            <Input
              value={form.title_en}
              onChange={(e) => set("title_en", e.target.value)}
              placeholder="Se vazio → usa PT"
            />
          </Field>
          <Field label="Excerpt (PT)">
            <Textarea
              rows={2}
              value={form.excerpt_pt ?? ""}
              onChange={(e) => set("excerpt_pt", e.target.value || null)}
            />
          </Field>
          <Field label="Excerpt (EN)">
            <Textarea
              rows={2}
              value={form.excerpt_en ?? ""}
              onChange={(e) => set("excerpt_en", e.target.value || null)}
            />
          </Field>
        </div>

        <ImageUploader
          label="Cover"
          value={form.cover_image}
          onChange={(v) => set("cover_image", v)}
          aspectRatio="16/9"
        />

        <Field label="Conteúdo (PT)" hint="Markdown suportado">
          <Textarea
            className="h-96 font-mono text-sm"
            value={form.content_pt}
            onChange={(e) => set("content_pt", e.target.value)}
          />
        </Field>
        <Field label="Conteúdo (EN)" hint="Markdown suportado · Se vazio → usa PT">
          <Textarea
            className="h-96 font-mono text-sm"
            value={form.content_en}
            onChange={(e) => set("content_en", e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">Publicado</div>
              <div className="text-xs text-muted-foreground">Marca o post como pronto.</div>
            </div>
            <Switch checked={form.published} onCheckedChange={(v) => set("published", v)} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">Visível no portal</div>
              <div className="text-xs text-muted-foreground">
                Permite ocultar temporariamente sem despublicar.
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
