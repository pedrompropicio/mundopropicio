/**
 * E2b (#417): travas determinísticas do executor, antes de qualquer IA.
 * Lê os comentários da Issue e decide se um "## Despacho" pode arrancar.
 * Formatos lidos: os que o painel grava (mp-painel src/lib/e2/textos.ts) e a D-ERP345.
 */

export interface Comentario {
  id: number;
  autor: string;
  criadoEm: string; // ISO
  corpo: string;
}

export interface Decisao {
  ok: boolean;
  motivos: string[];
  /** Texto da tarefa (corpo do despacho sem o cabeçalho). */
  tarefa: string;
}

/** Únicos autores aceites para Despacho, Autorização e Reserva (o Pedro; conectores escrevem como ele). */
export const AUTORES = ["pedrompropicio"];
/** Executor que a E2b lança. */
export const EXECUTOR = "claude code";
/** Capacidades do molde; na E2b só `codigo+testes` pode estar a "sim". */
const CAPACIDADES = ["codigo+testes", "DDL", "DML", "edge functions", "crons", "envios externos", "Publish"];

/** Caminhos que um PR do executor nunca pode tocar (R2 ou fora do âmbito R1). */
export const CAMINHOS_PROIBIDOS = [
  /^\.github\//,
  /^supabase\//,
  /^drizzle\//,
  /^\.lovable\//,
  /(^|\/)\.env/,
  /^scripts\/.*-live\.txt$/,
];

const BULLET = /^[ \t]*[-*][ \t]+\*\*(.+?):?\*\*:?[ \t]*(.*)$/;

function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function campos(corpo: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const linha of corpo.split(/\r?\n/)) {
    const b = linha.match(BULLET);
    if (b) m.set(norm(b[1]).replace(/\s*\(utc\)\s*$/, ""), b[2].trim());
  }
  return m;
}

const comeca = (corpo: string, re: RegExp) => re.test(corpo.trimStart());
export const isDespacho = (c: string) => comeca(c, /^##[ \t]+Despacho\b(?![ \t]+recusado)/);
const isAutorizacao = (c: string) => comeca(c, /^##[ \t]+Autoriza[cç][aã]o\b/);
const isReserva = (c: string) => comeca(c, /^##[ \t]+Reserva\b(?![ \t]+libertada)/);
const isLibertacao = (c: string) => comeca(c, /^##[ \t]+Reserva[ \t]+libertada\b/);

/** `x` = sim/não, como no painel. */
export function capacidadesDe(texto: string): Record<string, boolean> {
  const caps: Record<string, boolean> = {};
  for (const m of texto.matchAll(/`([^`]+)`\s*=\s*(sim|não|nao)\b/gi)) caps[m[1].trim()] = norm(m[2]) === "sim";
  return caps;
}

/** Primeira data ISO (AAAA-MM-DD, com hora opcional) do texto de validade; sem hora = fim desse dia UTC. */
export function limiteDaValidade(validade: string | undefined): Date | null {
  if (!validade) return null;
  const m = validade.match(/(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2] ?? "23:59"}:59Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function avaliarDespacho(issue: number, comentarios: Comentario[], despachoId: number, agora: Date): Decisao {
  const motivos: string[] = [];
  const ordem = [...comentarios].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  const despacho = ordem.find((c) => c.id === despachoId);
  if (!despacho || !isDespacho(despacho.corpo)) {
    return { ok: false, motivos: ["comentário de despacho não encontrado"], tarefa: "" };
  }
  if (!AUTORES.includes(despacho.autor)) motivos.push(`autor do despacho não autorizado (${despacho.autor})`);
  const cab = despacho.corpo.trimStart().split(/\r?\n/)[0];
  if (!new RegExp(`#${issue}\\b`).test(cab)) motivos.push(`o cabeçalho do despacho não refere #${issue}`);
  const tarefa = despacho.corpo.trimStart().split(/\r?\n/).slice(1).join("\n").trim();
  if (tarefa.length < 20) motivos.push("despacho sem texto de tarefa");

  const anteriores = ordem.filter((c) => c.criadoEm <= despacho.criadoEm && AUTORES.includes(c.autor));

  // Autorização: a mais recente antes do despacho.
  const aut = [...anteriores].reverse().find((c) => isAutorizacao(c.corpo));
  if (!aut) motivos.push("não há «## Autorização» do Pedro nesta Issue");
  else {
    const f = campos(aut.corpo);
    const executor = norm(f.get("executor atual") ?? f.get("executor") ?? "");
    if (!executor.startsWith(EXECUTOR)) motivos.push(`a autorização não designa o Claude Code como executor (${executor || "vazio"})`);
    const classe = (f.get("classe") ?? "").match(/\bR[0-2]\b/)?.[0];
    if (classe !== "R1") motivos.push(`a E2b só corre R1 (classe da autorização: ${classe ?? "ausente"})`);
    const caps = capacidadesDe(f.get("capacidades libertadas") ?? f.get("capacidades") ?? "");
    if (caps["codigo+testes"] !== true) motivos.push("`codigo+testes` não está a sim");
    const extra = Object.entries(caps).filter(([k, v]) => v && k !== "codigo+testes").map(([k]) => k);
    if (extra.length) motivos.push(`capacidades além de codigo+testes: ${extra.join(", ")}`);
    const desconhecidas = Object.keys(caps).filter((k) => !CAPACIDADES.includes(k));
    if (desconhecidas.some((k) => caps[k])) motivos.push(`capacidade desconhecida a sim: ${desconhecidas.join(", ")}`);
    const ambiente = norm(f.get("ambiente") ?? "");
    if (ambiente.includes("live")) motivos.push("a autorização refere o ambiente Live");
    const limite = limiteDaValidade(f.get("validade"));
    if (!limite) motivos.push("a autorização não tem validade com data (AAAA-MM-DD)");
    else if (agora > limite) motivos.push(`autorização expirada (${limite.toISOString()})`);
  }

  // Reservas activas (D-ERP345): reserva sem libertação posterior.
  const ativas = anteriores.filter(
    (r) => isReserva(r.corpo) && !anteriores.some((l) => isLibertacao(l.corpo) && l.criadoEm > r.criadoEm),
  );
  if (ativas.length === 0) motivos.push("não há «## Reserva» activa nesta Issue");
  else if (ativas.length > 1) motivos.push(`há ${ativas.length} reservas activas nesta Issue`);
  else {
    const exec = norm(campos(ativas[0].corpo).get("executor") ?? "");
    if (!exec.startsWith(EXECUTOR)) motivos.push(`a reserva activa não é do Claude Code (${exec || "vazio"})`);
  }

  return { ok: motivos.length === 0, motivos, tarefa };
}

/** Verifica a lista de ficheiros alterados pelo executor. */
export function caminhosProibidos(ficheiros: string[]): string[] {
  return ficheiros.filter((f) => CAMINHOS_PROIBIDOS.some((re) => re.test(f)));
}

export function textoRecusa(issue: number, motivos: string[], runUrl: string): string {
  return [
    `## Despacho recusado — #${issue}`,
    "",
    "As travas da E2b (#417) recusaram este despacho antes de qualquer IA correr:",
    ...motivos.map((m) => `- ${m}`),
    "",
    `Run: ${runUrl}`,
  ].join("\n");
}
