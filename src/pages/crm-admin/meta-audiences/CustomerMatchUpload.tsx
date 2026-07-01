import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, ArrowLeft, CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const UI_MAX_MEMBERS = 50_000;
const NONE = "__none__";

type Row = Record<string, unknown>;
type Member = { email?: string; phone_e164?: string };
type UploadResult = {
  ok: boolean;
  audience_local_id: string;
  total_recebido: number;
  total_inserido: number;
  duplicados_ignorados: number;
  total_na_audiencia: number;
};

function slugify(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function guessEmailCol(cols: string[], rows: Row[]): string | null {
  const byName = cols.find((c) => /e-?mail|correio/i.test(c));
  if (byName) return byName;
  for (const c of cols) {
    const sample = rows.slice(0, 20).map((r) => String(r[c] ?? "")).filter(Boolean);
    if (sample.length && sample.filter((v) => v.includes("@")).length / sample.length > 0.5) return c;
  }
  return null;
}
function guessPhoneCol(cols: string[]): string | null {
  return cols.find((c) => /phone|tel(e|é)fon|telem[oó]vel|celular|contact/i.test(c)) ?? null;
}

function cleanEmail(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  return s.includes("@") && s.length <= 254 ? s : null;
}
function cleanPhone(v: unknown): string | null {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  const plus = s.startsWith("+");
  s = s.replace(/[^\d]/g, "");
  if (!s) return null;
  return (plus ? "+" : "") + s;
}

export default function CustomerMatchUpload() {
  const navigate = useNavigate();
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [emailCol, setEmailCol] = useState<string>("");
  const [phoneCol, setPhoneCol] = useState<string>(NONE);
  const [name, setName] = useState<string>("");
  const [sourceLabel, setSourceLabel] = useState<string>("");
  const [sourceEdited, setSourceEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const onFile = async (f: File) => {
    setResult(null);
    setFileName(f.name);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: false });
      const detected = parsed.length ? Object.keys(parsed[0]) : [];
      setRows(parsed);
      setCols(detected);
      const eGuess = guessEmailCol(detected, parsed);
      const pGuess = guessPhoneCol(detected);
      setEmailCol(eGuess ?? "");
      setPhoneCol(pGuess ?? NONE);
    } catch (e) {
      toast.error("Não consegui ler o ficheiro: " + (e as Error).message);
      setRows([]); setCols([]); setFileName("");
    }
  };

  const onNameChange = (v: string) => {
    setName(v);
    if (!sourceEdited) setSourceLabel(slugify(v));
  };

  const { members, duplicatesRemoved, invalidCount } = useMemo(() => {
    if (!emailCol) return { members: [] as Member[], duplicatesRemoved: 0, invalidCount: 0 };
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();
    let dups = 0, invalid = 0;
    const out: Member[] = [];
    for (const r of rows) {
      const email = cleanEmail(r[emailCol]);
      const phone = phoneCol !== NONE && phoneCol ? cleanPhone(r[phoneCol]) : null;
      if (!email && !phone) { invalid += 1; continue; }
      if (email && seenEmails.has(email)) { dups += 1; continue; }
      if (!email && phone && seenPhones.has(phone)) { dups += 1; continue; }
      if (email) seenEmails.add(email);
      if (phone) seenPhones.add(phone);
      const m: Member = {};
      if (email) m.email = email;
      if (phone) m.phone_e164 = phone;
      out.push(m);
    }
    return { members: out, duplicatesRemoved: dups, invalidCount: invalid };
  }, [rows, emailCol, phoneCol]);

  const previewRows = useMemo(() => rows.slice(0, 5), [rows]);
  const tooBig = members.length > UI_MAX_MEMBERS;
  const canSubmit = !!emailCol && !!name.trim() && !!sourceLabel.trim() && members.length > 0 && !tooBig && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-audience-upload", {
        body: { name: name.trim(), source_label: sourceLabel.trim(), members },
      });
      if (error) throw error;
      const res = data as UploadResult;
      setResult(res);
      toast.success(`Audiência local criada com ${res.total_na_audiencia.toLocaleString()} contactos`);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const friendly =
        msg.includes("no_meta_connection") ? "A empresa não tem conexão Meta activa." :
        msg.includes("insufficient_role") ? "Sem permissão para criar audiências." :
        msg.includes("too_many_members") ? "Lista demasiado grande." :
        msg;
      toast.error(friendly);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/crm-admin/meta-audiences"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Link></Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Upload className="h-6 w-6 text-emerald-600" />Carregar lista (Customer Match)</h1>
          <p className="text-sm text-muted-foreground mt-1">Sobe um CSV/XLSX com emails ou telefones. A audiência é preparada na plataforma.</p>
        </div>
      </div>

      <Alert className="border-amber-500/40 bg-amber-500/5">
        <ShieldAlert className="h-4 w-4 text-amber-600" />
        <AlertTitle>Esta acção NÃO envia nada para a Meta</AlertTitle>
        <AlertDescription>
          Só prepara a audiência local (guarda os hashes SHA256 dos contactos). O envio para a Meta é o passo seguinte, feito à parte.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Ficheiro</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          {fileName && (
            <div className="text-sm text-muted-foreground">
              <b>{fileName}</b> · {rows.length.toLocaleString()} linhas · {cols.length} colunas detectadas
            </div>
          )}
        </CardContent>
      </Card>

      {cols.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">2. Mapeamento de colunas</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Coluna de email <span className="text-destructive">*</span></Label>
                <Select value={emailCol} onValueChange={setEmailCol}>
                  <SelectTrigger><SelectValue placeholder="Escolhe a coluna…" /></SelectTrigger>
                  <SelectContent>{cols.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Coluna de telefone (opcional)</Label>
                <Select value={phoneCol} onValueChange={setPhoneCol}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— nenhuma —</SelectItem>
                    {cols.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {emailCol && (
              <div>
                <Label className="text-xs text-muted-foreground">Pré-visualização (5 linhas, só colunas escolhidas)</Label>
                <div className="border rounded-md mt-1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{emailCol}</TableHead>
                        {phoneCol !== NONE && phoneCol && <TableHead>{phoneCol}</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{String(r[emailCol] ?? "")}</TableCell>
                          {phoneCol !== NONE && phoneCol && <TableCell className="font-mono text-xs">{String(r[phoneCol] ?? "")}</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {cols.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">3. Identificação da audiência</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome da audiência <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Ex.: Compradores Ivete (Ticketline)" maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label>Etiqueta de origem (source_label) <span className="text-destructive">*</span></Label>
              <Input value={sourceLabel} onChange={(e) => { setSourceEdited(true); setSourceLabel(e.target.value); }} placeholder="compradores-ivete-ticketline" maxLength={255} />
              <p className="text-xs text-muted-foreground">Sugerida automaticamente a partir do nome. Editável.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {emailCol && members.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">4. Resumo antes de enviar</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><div className="text-muted-foreground text-xs">Linhas no ficheiro</div><div className="text-lg font-semibold">{rows.length.toLocaleString()}</div></div>
              <div><div className="text-muted-foreground text-xs">Contactos válidos</div><div className="text-lg font-semibold text-emerald-600">{members.length.toLocaleString()}</div></div>
              <div><div className="text-muted-foreground text-xs">Duplicados removidos</div><div className="text-lg font-semibold">{duplicatesRemoved.toLocaleString()}</div></div>
              <div><div className="text-muted-foreground text-xs">Sem email/telefone</div><div className="text-lg font-semibold">{invalidCount.toLocaleString()}</div></div>
            </div>
            {tooBig && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Lista demasiado grande para esta versão da UI</AlertTitle>
                <AlertDescription>Máximo: {UI_MAX_MEMBERS.toLocaleString()} contactos. Divide o ficheiro em partes mais pequenas.</AlertDescription>
              </Alert>
            )}
            <div className="pt-2">
              <Button onClick={submit} disabled={!canSubmit} className="gap-2">
                <Upload className="h-4 w-4" />
                {busy ? "A preparar audiência…" : "Criar audiência (só na plataforma)"}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">Repetimos: esta acção <b>não envia nada para a Meta</b>.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Alert className="border-emerald-500/40 bg-emerald-500/5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertTitle>Audiência criada na plataforma</AlertTitle>
          <AlertDescription className="space-y-2">
            <div className="flex flex-wrap gap-2 text-xs mt-1">
              <Badge variant="outline">Recebidos: {result.total_recebido.toLocaleString()}</Badge>
              <Badge variant="outline">Inseridos: {result.total_inserido.toLocaleString()}</Badge>
              <Badge variant="outline">Duplicados ignorados: {result.duplicados_ignorados.toLocaleString()}</Badge>
              <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Na audiência: {result.total_na_audiencia.toLocaleString()}</Badge>
            </div>
            <p>Ainda <b>não foi enviada para a Meta</b> — esse é o passo seguinte (Fase 3).</p>
            <Button size="sm" variant="outline" onClick={() => navigate("/crm-admin/meta-audiences")}>Ver lista de audiências</Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
