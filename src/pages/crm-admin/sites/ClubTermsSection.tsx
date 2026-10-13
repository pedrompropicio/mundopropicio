import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import HelpMarkdown from "@/components/help/HelpMarkdown";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const db = supabase as any;
type Term = { id: string; version: number; body_md: string; status: string; published_at: string | null; published_by: string | null; created_at: string };

/** Regulamento do Clube (D-ERP271): rascunho editável, publicação por versões, aceitação por membro. */
export function ClubTermsSection({ siteId, companyId }: { siteId: string; companyId: string }) {
  const qc = useQueryClient();
  const terms = useQuery({
    queryKey: ["club-terms", siteId],
    queryFn: async () => {
      const { data, error } = await db.from("club_terms").select("id, version, body_md, status, published_at, published_by, created_at")
        .eq("site_id", siteId).order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Term[];
    },
  });
  const accepted = useQuery({
    queryKey: ["club-terms-accepted", siteId],
    queryFn: async () => {
      const { data, error } = await db.from("club_members").select("terms_version").eq("site_id", siteId).not("terms_version", "is", null);
      if (error) throw error;
      const m: Record<number, number> = {};
      for (const r of data ?? []) m[r.terms_version] = (m[r.terms_version] ?? 0) + 1;
      return m;
    },
  });
  const publishedBy = useQuery({
    queryKey: ["club-terms-publishers", (terms.data ?? []).map((t) => t.published_by).join(",")],
    enabled: (terms.data ?? []).some((t) => t.published_by),
    queryFn: async () => {
      const ids = [...new Set((terms.data ?? []).map((t) => t.published_by).filter(Boolean))];
      const { data } = await db.from("profiles").select("id, full_name, email").in("id", ids);
      return Object.fromEntries((data ?? []).map((p: any) => [p.id, p.full_name || p.email])) as Record<string, string>;
    },
  });

  const draft = useMemo(() => (terms.data ?? []).find((t) => t.status === "rascunho") ?? null, [terms.data]);
  const latestPub = useMemo(() => (terms.data ?? []).find((t) => t.status === "publicada") ?? null, [terms.data]);
  const [body, setBody] = useState("");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (terms.data) setBody(draft?.body_md ?? latestPub?.body_md ?? ""); }, [terms.data, draft, latestPub]);
  const nextVersion = draft?.version ?? ((terms.data ?? [])[0]?.version ?? 0) + 1;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["club-terms", siteId] }); qc.invalidateQueries({ queryKey: ["club-terms-accepted", siteId] }); };

  const saveDraft = useMutation({
    mutationFn: async () => {
      if (draft) {
        const { error } = await db.from("club_terms").update({ body_md: body, updated_at: new Date().toISOString() }).eq("id", draft.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("club_terms").insert({ company_id: companyId, site_id: siteId, version: nextVersion, body_md: body, status: "rascunho" });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Rascunho guardado"); refresh(); },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? e}`),
  });
  const publish = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("club_terms_publish", { p_site: siteId, p_body: body });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (v) => { toast.success(`Versão ${v} publicada`); setConfirm(false); refresh(); },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? e}`),
  });
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }) : "—");

  return (
    <Card className="space-y-3 p-4 lg:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Regulamento</h3>
        {latestPub ? <Badge variant="secondary">Em vigor: v{latestPub.version}</Badge> : <Badge variant="outline">Nenhuma versão publicada</Badge>}
        {draft && <Badge variant="outline">Rascunho v{draft.version}</Badge>}
      </div>
      {terms.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Texto (títulos com #, listas com 1. ou -, negrito com **texto**)</p>
            <Textarea name="club_terms_body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[360px] font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Pré-visualização</p>
            <div className="max-h-[400px] min-h-[360px] overflow-y-auto rounded-md border border-border p-3 text-sm">
              <HelpMarkdown>{body || "_Sem texto._"}</HelpMarkdown>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={saveDraft.isPending || !body.trim()} onClick={() => saveDraft.mutate()}>
          <Save className="mr-1 h-4 w-4" /> Guardar rascunho
        </Button>
        <Button type="button" size="sm" disabled={publish.isPending || !body.trim()} onClick={() => setConfirm(true)}>
          <Send className="mr-1 h-4 w-4" /> Publicar versão
        </Button>
      </div>

      <div className="space-y-1">
        <h4 className="text-xs font-semibold text-muted-foreground">Histórico</h4>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground"><tr><th className="text-left">Versão</th><th className="text-left">Estado</th><th className="text-left">Publicada em</th><th className="text-left">Por</th><th className="text-right">Membros que aceitaram</th></tr></thead>
          <tbody>
            {(terms.data ?? []).map((t) => (
              <tr key={t.id} className="border-t border-border/50">
                <td>v{t.version}</td>
                <td>{t.status === "publicada" ? "Publicada" : "Rascunho"}</td>
                <td>{fmt(t.published_at)}</td>
                <td>{t.published_by ? publishedBy.data?.[t.published_by] ?? "—" : "—"}</td>
                <td className="text-right font-mono">{t.status === "publicada" ? accepted.data?.[t.version] ?? 0 : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publicar a versão {nextVersion}?</AlertDialogTitle>
            <AlertDialogDescription>
              Fica em vigor no site a partir de agora, com a data de hoje. As versões publicadas não se alteram; mudanças futuras criam uma versão nova.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); publish.mutate(); }} disabled={publish.isPending}>Publicar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
