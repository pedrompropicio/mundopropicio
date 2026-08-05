import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { toSlug } from "../lib/slug";
import type { StaticPageRow } from "../types";

type Group = {
  slug: string;
  title: string | null;
  pt: StaticPageRow | null;
  en: StaticPageRow | null;
  updatedAt: string;
};

export default function PaginasList() {
  const { companyId } = useCompany();
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-paginas-list", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<StaticPageRow[]> => {
      const { data, error } = await (supabase as any)
        .from("static_pages")
        .select("*")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StaticPageRow[];
    },
  });

  const groups = useMemo<Group[]>(() => {
    const list = data ?? [];
    const bySlug = new Map<string, Group>();
    for (const r of list) {
      const g =
        bySlug.get(r.slug) ?? {
          slug: r.slug,
          title: null,
          pt: null,
          en: null,
          updatedAt: r.updated_at,
        };
      if (r.locale === "pt") g.pt = r;
      else if (r.locale === "en") g.en = r;
      g.title = g.pt?.title ?? g.en?.title ?? null;
      if (r.updated_at > g.updatedAt) g.updatedAt = r.updated_at;
      bySlug.set(r.slug, g);
    }
    const arr = Array.from(bySlug.values()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    if (!search) return arr;
    const s = search.toLowerCase();
    return arr.filter(
      (g) => g.slug.toLowerCase().includes(s) || (g.title ?? "").toLowerCase().includes(s),
    );
  }, [data, search]);

  const createMutation = useMutation({
    mutationFn: async (slug: string) => {
      const cleanSlug = toSlug(slug);
      if (!cleanSlug) throw new Error("Slug inválido.");
      const rows = [
        {
          company_id: companyId,
          slug: cleanSlug,
          locale: "pt",
          title: "",
          status: "draft",
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        },
        {
          company_id: companyId,
          slug: cleanSlug,
          locale: "en",
          title: "",
          status: "draft",
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        },
      ];
      const { error } = await (supabase as any)
        .from("static_pages")
        .upsert(rows, { onConflict: "company_id,slug,locale" });
      if (error) throw error;
      return cleanSlug;
    },
    onSuccess: (slug) => {
      toast.success("Página criada.");
      qc.invalidateQueries({ queryKey: ["crm-paginas-list"] });
      setNewOpen(false);
      setNewSlug("");
      navigate(`/crm/paginas/${slug}`);
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Páginas estáticas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Páginas institucionais do portal (sobre, contactos, privacidade, …). Cada slug tem
            uma versão PT e uma EN.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> Nova página
        </Button>
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por slug ou título…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Slug</TableHead>
              <TableHead>Título (PT)</TableHead>
              <TableHead>PT</TableHead>
              <TableHead>EN</TableHead>
              <TableHead>Actualizado</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  A carregar…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-destructive">
                  {(error as Error).message}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && groups.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Sem páginas.
                </TableCell>
              </TableRow>
            )}
            {groups.map((g) => (
              <TableRow key={g.slug}>
                <TableCell className="font-mono text-xs">{g.slug}</TableCell>
                <TableCell className="font-medium">{g.title || "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={g.pt?.status} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={g.en?.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(g.updatedAt).toLocaleDateString("pt-PT")}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/crm/paginas/${g.slug}`}>
                      Editar <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova página estática</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="sobre, contacto, privacidade…"
            />
            <p className="text-xs text-muted-foreground">
              Será criado num par (PT + EN) em rascunho.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate(newSlug)}
              disabled={createMutation.isPending || !newSlug.trim()}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string | undefined }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        —
      </span>
    );
  }
  if (status === "published") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">
        Publicado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      Rascunho
    </span>
  );
}
