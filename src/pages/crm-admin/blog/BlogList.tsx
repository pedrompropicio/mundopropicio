import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MP_COMPANY_ID } from "../constants";
import type { BlogPostRow } from "../types";

export default function BlogList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-blog-list", MP_COMPANY_ID],
    queryFn: async (): Promise<BlogPostRow[]> => {
      const { data, error } = await (supabase as any)
        .from("blog_posts")
        .select(
          "id, company_id, slug, title_pt, title_en, content_pt, content_en, excerpt_pt, excerpt_en, cover_image, published, portal_visible, author_id, published_at, created_at, updated_at",
        )
        .eq("company_id", MP_COMPANY_ID)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BlogPostRow[];
    },
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    const filtered = list.filter((p) => {
      if (search) {
        const s = search.toLowerCase();
        if (
          !p.title_pt?.toLowerCase().includes(s) &&
          !p.title_en?.toLowerCase().includes(s) &&
          !p.slug.toLowerCase().includes(s)
        )
          return false;
      }
      if (statusFilter === "published" && !p.published) return false;
      if (statusFilter === "draft" && p.published) return false;
      return true;
    });
    // Published first (by published_at desc), then drafts by updated_at desc
    return filtered.sort((a, b) => {
      if (a.published !== b.published) return a.published ? -1 : 1;
      const ak = a.published ? a.published_at ?? a.updated_at : a.updated_at;
      const bk = b.published ? b.published_at ?? b.updated_at : b.updated_at;
      return (bk ?? "").localeCompare(ak ?? "");
    });
  }, [data, search, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Blog</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Editor de posts do portal público (bilingue).
          </p>
        </div>
        <Button asChild>
          <Link to="/crm/blog/novo">
            <Plus className="h-4 w-4" /> Novo post
          </Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por título ou slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="published">Publicado</SelectItem>
              <SelectItem value="draft">Rascunho</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Cover</TableHead>
              <TableHead>Título (PT)</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Portal</TableHead>
              <TableHead>Actualizado</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  A carregar…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-destructive">
                  {(error as Error).message}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Sem posts.
                </TableCell>
              </TableRow>
            )}
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  {p.cover_image ? (
                    <img
                      src={p.cover_image}
                      alt=""
                      className="h-12 w-16 rounded object-cover"
                    />
                  ) : (
                    <div className="h-12 w-16 rounded bg-muted" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{p.title_pt}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{p.slug}</TableCell>
                <TableCell>
                  {p.published ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">
                      Publicado
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Rascunho
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.portal_visible ? "Visível" : "Oculto"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(p.updated_at).toLocaleDateString("pt-PT")}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/crm/blog/${p.id}`}>
                      Editar <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
