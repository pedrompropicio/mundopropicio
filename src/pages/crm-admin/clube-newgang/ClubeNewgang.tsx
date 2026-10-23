import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCompany } from "@/hooks/useCompany";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { fetchAllPaged } from "@/lib/supabase-paging";
import { downloadCsv } from "@/lib/crm/csv-export";

import { whatsappSourceLabel } from "@/lib/crm/whatsapp";
import { countryName, displayCity } from "@/lib/crm/countries";

const META = 15000;
const META_DATA = "02/11/2026";
const PAGE = 50;

type Kv = { k: string; n: number; n_declarada?: number; n_estimada?: number };
type Summary = { total: number; today: number; last7: number; by_day: { d: string; n: number }[]; by_city: Kv[]; by_utm: Kv[]; by_age: Kv[] };
type Row = {
  id: string; name: string | null; email: string | null; phone: string | null; birth_date: string | null;
  city: string | null; postal_code: string | null; consent_email: boolean | null; consent_whatsapp: boolean | null;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; created_at: string; total_count: number; submissions: number; member_no: number | null; confirmed_at: string | null; consent_whatsapp_source: string | null; whatsapp_eligible: boolean;
  birth_country: string | null; residence_country: string | null; city_source: string | null; profile_complete: boolean; profile_completed_at: string | null;
  estimated_city: string | null; estimated_region: string | null; estimated_country: string | null;
};

const n = (v: number) => v.toLocaleString("pt-PT");
const rpc = (fn: string, args?: Record<string, unknown>) => (supabase as any).rpc(fn, args);

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Ranked({ title, items, footnote }: { title: string; items: Kv[]; footnote?: string }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  const [open, setOpen] = useState<string | null>(null);
  const origin = (i: Kv) => (i.n_declarada != null && i.n_estimada != null && i.k !== "(sem cidade)" ? `${n(i.n_declarada)} declaradas · ${n(i.n_estimada)} estimadas (IP)` : null);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">0 inscritos</p>}
        {items.map((i) => {
          const o = origin(i);
          return (
            <div key={i.k} className={`space-y-1 ${o ? "cursor-pointer" : ""}`} title={o ?? undefined} onClick={o ? () => setOpen(open === i.k ? null : i.k) : undefined}>
              <div className="flex justify-between gap-2 text-xs"><span className="truncate">{i.k}</span><span className="tabular-nums">{n(i.n)}</span></div>
              <div className="h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{ width: `${(i.n / max) * 100}%` }} /></div>
              {o && open === i.k && <p className="text-xs text-muted-foreground">{o}</p>}
            </div>
          );
        })}
        {footnote && <p className="pt-1 text-[11px] text-muted-foreground">{footnote}</p>}
      </CardContent>
    </Card>
  );
}

export default function ClubeNewgang() {
  const { companyId } = useCompany();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [complete, setComplete] = useState<"all" | "yes" | "no">("all");
  const pc = complete === "all" ? null : complete === "yes";
  const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" }) : null);
  const q = useDebouncedValue(search, 300);

  const summary = useQuery({
    queryKey: ["clube-newgang-summary", companyId],
    queryFn: async () => {
      const { data, error } = await rpc("clube_newgang_summary");
      if (error) throw error;
      return data as Summary;
    },
  });

  const list = useQuery({
    queryKey: ["clube-newgang-list", companyId, q, page, complete],
    queryFn: async () => {
      const { data, error } = await rpc("clube_newgang_list", { p_search: q || null, p_limit: PAGE, p_offset: page * PAGE, p_profile_complete: pc });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const s = summary.data;
  const total = s?.total ?? 0;
  const rows = list.data ?? [];
  const count = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE));

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await fetchAllPaged<Row>((from, to) =>
        rpc("clube_newgang_list", { p_search: null, p_limit: to - from + 1, p_offset: from }), { maxRows: 200000 });
      const header = ["Nome", "Email", "Telemóvel", "Data de nascimento", "País de nascimento", "País de residência", "Cidade declarada", "Origem da cidade", "Cidade estimada (IP) — IP Geolocation by DB-IP (https://db-ip.com)", "Região estimada (IP)", "País estimado (IP)", "Perfil completo", "Perfil completo em", "Código postal", "Consentimento email", "Consentimento WhatsApp", "Data de inscrição", "Submissões", "Nº de membro", "Confirmado", "Origem WhatsApp"];
      const lines = [header.join(","), ...all.map((r) => [
        r.name, r.email, r.whatsapp_eligible ? r.phone : null, r.birth_date, countryName(r.birth_country), countryName(r.residence_country), r.city, r.city_source, r.estimated_city, r.estimated_region, countryName(r.estimated_country), r.profile_complete ? "sim" : "não", fmtDate(r.profile_completed_at), r.postal_code,
        r.consent_email ? "sim" : "não", r.consent_whatsapp ? "sim" : "não",
        new Date(r.created_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }),
        r.submissions, r.member_no, r.confirmed_at, whatsappSourceLabel(r.consent_whatsapp_source),
      ].map(csvCell).join(","))];
      downloadCsv(lines.join("\r\n"), `clube-newgang-fever-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`${n(all.length)} inscritos exportados`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na exportação");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 min-w-0 w-full [contain:inline-size]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clube Newgang</h1>
          <p className="text-sm text-muted-foreground">Inscrições do Clube Newgang Festival 2027</p>
        </div>
        <Button onClick={exportCsv} disabled={exporting}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Exportar CSV (Fever)
        </Button>
      </div>

      {summary.error && <p className="text-sm text-destructive">Erro: {(summary.error as Error).message}</p>}

      <div className="grid gap-4 md:grid-cols-4">
        {[["Total de inscritos", total], ["Hoje", s?.today ?? 0], ["Últimos 7 dias", s?.last7 ?? 0]].map(([l, v]) => (
          <Card key={l as string} className="min-w-0"><CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="text-3xl font-bold tabular-nums">{summary.isLoading ? "…" : n(v as number)}</p>
          </CardContent></Card>
        ))}
        <Card className="min-w-0"><CardContent className="pt-6 space-y-2">
          <p className="text-xs text-muted-foreground">Meta {n(META)} até {META_DATA}</p>
          <p className="text-xl font-bold tabular-nums">{n(total)} / {n(META)}</p>
          <Progress value={Math.min(100, (total / META) * 100)} />
          <p className="text-xs text-muted-foreground">{((total / META) * 100).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Inscritos por dia</CardTitle></CardHeader>
        <CardContent className="h-56">
          {(s?.by_day.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">0 inscritos</p> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s?.by_day ?? []}>
                <XAxis dataKey="d" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="n" name="Inscritos" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Ranked title="Por cidade (top 10)" items={s?.by_city ?? []} footnote="Inclui cidade estimada por IP (DB-IP, CC BY 4.0)" />
        <Ranked title="Por fonte / UTM" items={s?.by_utm ?? []} />
        <Ranked title="Por faixa etária" items={s?.by_age ?? []} />
      </div>

      <Card className="min-w-0">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
          <CardTitle className="text-sm">Inscritos ({n(total)}){complete !== "all" && <span className="ml-2 text-xs font-normal text-muted-foreground">filtro: {n(count)}</span>}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="Perfil completo">
            {([["all", "Todos"], ["yes", "Perfil completo: sim"], ["no", "Perfil completo: não"]] as const).map(([v, l]) => (
              <Button key={v} size="sm" variant={complete === v ? "default" : "outline"} onClick={() => { setComplete(v); setPage(0); }}>{l}</Button>
            ))}
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Pesquisar nome ou email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>Telemóvel</TableHead>
              <TableHead>Data de nascimento</TableHead><TableHead>País de nascimento</TableHead><TableHead>País de residência</TableHead><TableHead>Cidade</TableHead><TableHead>Perfil completo</TableHead><TableHead>Email ok</TableHead>
              <TableHead>WhatsApp ok / origem</TableHead><TableHead>Submissões</TableHead><TableHead>Membro</TableHead><TableHead>Inscrição</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground">{list.isLoading ? "A carregar…" : "0 inscritos"}</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.name ?? "—"}</TableCell><TableCell>{r.email ?? "—"}</TableCell><TableCell>{r.phone ?? "—"}</TableCell>
                  <TableCell>{r.birth_date ?? "—"}</TableCell>
                  <TableCell>{countryName(r.birth_country) ?? "—"}</TableCell><TableCell>{countryName(r.residence_country) ?? "—"}</TableCell>
                  <TableCell>{(() => { const c = displayCity(r); return c.text ? <>{c.text}{c.estimated && <Badge variant="outline" title="IP Geolocation by DB-IP (https://db-ip.com) · CC BY 4.0" className="ml-1 text-xs text-muted-foreground">estimada (IP)</Badge>}</> : "—"; })()}</TableCell>
                  <TableCell><Badge variant={r.profile_complete ? "default" : "outline"}>{r.profile_complete ? "sim" : "não"}</Badge>{r.profile_completed_at && <span className="block text-xs text-muted-foreground">{fmtDate(r.profile_completed_at)}</span>}</TableCell>
                  <TableCell><Badge variant={r.consent_email ? "default" : "outline"}>{r.consent_email ? "sim" : "não"}</Badge></TableCell>
                  <TableCell><Badge variant={r.consent_whatsapp ? "default" : "outline"}>{r.consent_whatsapp ? "sim" : "não"}</Badge><div className="text-xs text-muted-foreground mt-1">{whatsappSourceLabel(r.consent_whatsapp_source)}</div></TableCell>
                  <TableCell><Badge variant="outline" className={r.submissions > 1 ? "text-primary border-primary/40" : "text-muted-foreground"}>{r.submissions}</Badge></TableCell>
                  <TableCell>{r.member_no ?? "—"}{r.confirmed_at && <span className="block text-xs text-muted-foreground">Confirmado</span>}</TableCell>
                  <TableCell>{new Date(r.created_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">Cidade "estimada (IP)": <a href="https://db-ip.com" target="_blank" rel="noreferrer" className="underline">IP Geolocation by DB-IP</a> (DB-IP Lite City, licença CC BY 4.0). Só para análise no CRM.</p>
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <span>Página {page + 1} de {pages}</span>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Seguinte</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
