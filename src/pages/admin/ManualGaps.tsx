import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircleQuestion } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QueryErrorState from "@/components/QueryErrorState";
import { toast } from "sonner";

type Status = "aberta" | "coberta" | "ignorada";
type Question = { id: string; question: string; route: string | null; created_at: string; status: Status; confidence: string | null };

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

export default function ManualGaps() {
  const { role, user } = useAuth();
  const authorized = role === "admin" || role === "platform_admin";
  const client = useQueryClient();
  const [status, setStatus] = useState<Status | "todas">("aberta");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [coverIds, setCoverIds] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const query = useQuery({
    queryKey: ["manual-gaps", status, from, to], enabled: authorized,
    queryFn: async () => {
      let request = (supabase as any).from("help_questions").select("id,question,route,created_at,status,confidence").or("answered.eq.false,confidence.eq.baixa").order("created_at", { ascending: false });
      if (status !== "todas") request = request.eq("status", status);
      if (from) request = request.gte("created_at", `${from}T00:00:00`);
      if (to) request = request.lte("created_at", `${to}T23:59:59.999`);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as Question[];
    },
  });

  const groups = useMemo(() => {
    const map = new Map<string, { question: string; ids: string[]; routes: Set<string>; last: string; status: Status }>();
    for (const row of query.data ?? []) {
      const key = normalize(row.question);
      const current = map.get(key) ?? { question: row.question, ids: [], routes: new Set<string>(), last: row.created_at, status: row.status };
      current.ids.push(row.id); if (row.route) current.routes.add(row.route);
      if (row.created_at > current.last) { current.last = row.created_at; current.status = row.status; current.question = row.question; }
      map.set(key, current);
    }
    return [...map.values()];
  }, [query.data]);

  const update = async (ids: string[], nextStatus: Status, resolvedNote?: string) => {
    const { error } = await (supabase as any).from("help_questions").update({ status: nextStatus, resolved_note: resolvedNote ?? null, resolved_at: new Date().toISOString(), resolved_by: user?.id }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(nextStatus === "coberta" ? "Pergunta marcada como coberta." : "Pergunta ignorada.");
    setCoverIds([]); setNote(""); void client.invalidateQueries({ queryKey: ["manual-gaps"] });
  };

  if (!authorized) return <Navigate to="/" replace />;
  return <div className="space-y-6">
    <div><h1 className="flex items-center gap-2 text-2xl font-bold"><MessageCircleQuestion className="h-6 w-6 text-primary" />Lacunas do manual</h1><p className="mt-1 text-sm text-muted-foreground">Perguntas sem resposta ou com baixa confiança, agrupadas por texto normalizado.</p></div>
    <Card><CardContent className="grid gap-3 pt-6 sm:grid-cols-3"><div><Label>Estado</Label><Select value={status} onValueChange={(value) => setStatus(value as Status | "todas")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todos</SelectItem><SelectItem value="aberta">Aberta</SelectItem><SelectItem value="coberta">Coberta</SelectItem><SelectItem value="ignorada">Ignorada</SelectItem></SelectContent></Select></div><div><Label htmlFor="gap-from">Desde</Label><Input id="gap-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div><Label htmlFor="gap-to">Até</Label><Input id="gap-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></CardContent></Card>
    {query.isError && <QueryErrorState error={query.error} context="Lacunas do manual" onRetry={() => query.refetch()} />}
    {!query.isLoading && !query.isError && groups.length === 0 && <p className="text-sm text-muted-foreground">Sem lacunas para os filtros escolhidos.</p>}
    <div className="space-y-3">{groups.map((group) => <Card key={`${normalize(group.question)}-${group.status}`}><CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><CardTitle className="text-base">{group.question}</CardTitle><Badge variant="outline">{group.status}</Badge></div></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{group.ids.length} vez(es)</span><span>Rotas: {[...group.routes].join(", ") || "—"}</span><span>Última: {new Date(group.last).toLocaleString("pt-PT")}</span></div><div className="flex gap-2"><Button size="sm" onClick={() => setCoverIds(group.ids)}>Marcar coberta</Button><Button size="sm" variant="outline" onClick={() => void update(group.ids, "ignorada")}>Ignorar</Button></div></CardContent></Card>)}</div>
    <Dialog open={coverIds.length > 0} onOpenChange={(open) => { if (!open) { setCoverIds([]); setNote(""); } }}><DialogContent><DialogHeader><DialogTitle>Marcar pergunta como coberta</DialogTitle><DialogDescription>Indique como a lacuna foi resolvida no manual.</DialogDescription></DialogHeader><div><Label htmlFor="resolution-note">Nota</Label><Input id="resolution-note" value={note} onChange={(e) => setNote(e.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setCoverIds([])}>Cancelar</Button><Button disabled={!note.trim()} onClick={() => void update(coverIds, "coberta", note.trim())}>Confirmar</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
