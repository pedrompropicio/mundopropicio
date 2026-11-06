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
  preparacaoR2: boolean;
  motivos: string[];
  executor: Executor | null;
  /** Texto da tarefa (corpo do despacho sem o cabeçalho). */
  tarefa: string;
  /** Merge automático do PR quando o CI fica verde. Por defeito sim; só "não" explícito na autorização desliga. Sempre não no replay (#753). */
  mergeAutomatico: boolean;
  /** Repositório onde o executor trabalha e abre o PR (#753). Sem campo na Autorização: mundopropicio. */
  repoAlvo: RepoAlvo;
  /** Só no replay: caminhos exactos em .github/workflows/ que o Despacho autoriza (#753). */
  caminhosGithub: string[];
}

/** #753: lista fechada de repositórios-alvo da E2b. Qualquer outro valor é recusado. */
export const REPOS_ALVO = ["mundopropicio", "mundopropicio-replay"] as const;
export type RepoAlvo = (typeof REPOS_ALVO)[number];
export const REPO_REPLAY: RepoAlvo = "mundopropicio-replay";

/** Campo «Repositório» da Autorização: ausente → mundopropicio; fora da lista → null (recusa). */
export function repoAlvoDe(valor: string | undefined): RepoAlvo | null {
  if (valor === undefined) return "mundopropicio";
  const v = valor.replace(/`/g, "").trim();
  return (REPOS_ALVO as readonly string[]).includes(v) ? (v as RepoAlvo) : null;
}

/** Caminho .github aceite no replay: só um ficheiro YAML directamente em .github/workflows/. */
const CAMINHO_GITHUB_REPLAY = /^\.github\/workflows\/[A-Za-z0-9][A-Za-z0-9._-]*\.ya?ml$/;

/** Campo «Caminhos .github do replay» do Despacho: caminhos entre crases (ou separados por vírgula/espaço). */
export function caminhosGithubDe(valor: string | undefined): { caminhos: string[]; invalidos: string[] } {
  if (valor === undefined) return { caminhos: [], invalidos: [] };
  const entreCrases = [...valor.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
  const lista = (entreCrases.length ? entreCrases : valor.split(/[,\s]+/)).map((c) => c.trim()).filter(Boolean);
  const caminhos = [...new Set(lista)];
  const invalidos = caminhos.filter((c) => c.split("/").some((p) => p === "." || p === "..") || !CAMINHO_GITHUB_REPLAY.test(c));
  return { caminhos: caminhos.filter((c) => !invalidos.includes(c)), invalidos };
}

/** Únicos autores aceites para Autorização (o Pedro; conectores escrevem como ele). */
export const AUTORES = ["pedrompropicio"];
/** Operadores que a Autorização vigente pode nomear para Despacho, Reserva e libertação. */
export const OPERADORES = ["mplabs-dev"];
/** Motores suportados; a Autorização designa qual a E2b lança. */
export const EXECUTORES = { "claude-code": ["claude code"], codex: ["codex", "chatgpt/codex", "chatgpt codex", "openai codex"] } as const;
export type Executor = keyof typeof EXECUTORES;
/** Preparação R2 liberta apenas ficheiros; nunca aplicação ou deploy. */
const CAPACIDADES = ["codigo+testes", "ficheiros de migração", "DDL", "DML", "edge functions", "crons", "envios externos", "Publish"];

/** Bloqueio por defeito; só as exceções de preparação R2 abaixo podem abrir caminhos. */
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

export function executorDe(texto: string): Executor | null {
  const normalizado = norm(texto);
  for (const executor of Object.keys(EXECUTORES) as Executor[]) {
    if (EXECUTORES[executor].some((prefixo) => normalizado.startsWith(prefixo))) return executor;
  }
  return null;
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

/** Decisão do Pedro (01/11/2026): merge automático por defeito; só "não" explícito o desliga. */
export function mergeAutomaticoDe(valor: string | undefined): boolean {
  return !/^(nao|no)\b/.test(norm(valor ?? "").replace(/[`*]/g, ""));
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
  let mergeAutomatico = true;
  let preparacaoR2 = false;
  let executor: Executor | null = null;
  let repoAlvo: RepoAlvo = "mundopropicio";
  const ordem = [...comentarios].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  const despacho = ordem.find((c) => c.id === despachoId);
  if (!despacho || !isDespacho(despacho.corpo)) {
    return { ok: false, preparacaoR2: false, motivos: ["comentário de despacho não encontrado"], tarefa: "", mergeAutomatico: false, executor: null, repoAlvo: "mundopropicio", caminhosGithub: [] };
  }
  const anteriores = ordem.filter((c) => c.criadoEm <= despacho.criadoEm);
  // Autorização: só do Pedro, a mais recente antes do despacho.
  const aut = [...anteriores].reverse().find((c) => AUTORES.includes(c.autor) && isAutorizacao(c.corpo));
  const f = campos(aut?.corpo ?? "");
  const operador = f.get("operador")?.replace(/`/g, "").trim().replace(/^@/, "");
  const operadorPermitido = operador !== undefined && OPERADORES.includes(operador);
  const autores = operadorPermitido ? [...AUTORES, operador] : AUTORES;
  if (!autores.includes(despacho.autor)) motivos.push(`autor do despacho não autorizado (${despacho.autor})`);
  const cab = despacho.corpo.trimStart().split(/\r?\n/)[0];
  if (!new RegExp(`#${issue}\\b`).test(cab)) motivos.push(`o cabeçalho do despacho não refere #${issue}`);
  const tarefa = despacho.corpo.trimStart().split(/\r?\n/).slice(1).join("\n").trim();
  if (tarefa.length < 20) motivos.push("despacho sem texto de tarefa");

  if (!aut) motivos.push("não há «## Autorização» do Pedro nesta Issue");
  else {
    if (operador !== undefined && !operadorPermitido) motivos.push(`operador não autorizado (${operador})`);
    executor = executorDe(f.get("executor atual") ?? f.get("executor") ?? "");
    if (!executor) motivos.push("a autorização não designa um executor suportado (Claude Code ou Codex)");
    const classe = (f.get("classe") ?? "").match(/\bR[0-2]\b/)?.[0];
    const caps = capacidadesDe(f.get("capacidades libertadas") ?? f.get("capacidades") ?? "");
    preparacaoR2 = caps["ficheiros de migração"] === true;
    if (classe === "R2" && !preparacaoR2) {
      motivos.push("classe R2 só com `ficheiros de migração` = sim (preparação sem aplicar)");
    } else if (classe !== "R1" && !(classe === "R2" && preparacaoR2)) {
      motivos.push(`a E2b só corre R1 ou R2 em preparação (classe da autorização: ${classe ?? "ausente"})`);
    }
    if (caps["codigo+testes"] !== true) motivos.push("`codigo+testes` não está a sim");
    const extra = Object.entries(caps).filter(([k, v]) => v && k !== "codigo+testes" && k !== "ficheiros de migração").map(([k]) => k);
    if (extra.length) motivos.push(`capacidades além de codigo+testes e ficheiros de migração: ${extra.join(", ")}`);
    const desconhecidas = Object.keys(caps).filter((k) => !CAPACIDADES.includes(k));
    if (desconhecidas.some((k) => caps[k])) motivos.push(`capacidade desconhecida a sim: ${desconhecidas.join(", ")}`);
    const ambiente = norm(f.get("ambiente") ?? "");
    if (ambiente.includes("live")) motivos.push("a autorização refere o ambiente Live");
    mergeAutomatico = mergeAutomaticoDe(f.get("merge automatico"));
    const limite = limiteDaValidade(f.get("validade"));
    if (!limite) motivos.push("a autorização não tem validade com data (AAAA-MM-DD)");
    else if (agora > limite) motivos.push(`autorização expirada (${limite.toISOString()})`);
    const campoRepo = f.get("repositorio");
    const alvo = repoAlvoDe(campoRepo);
    if (!alvo) motivos.push(`repositório não permitido (${campoRepo}); só ${REPOS_ALVO.join(" ou ")}`);
    else repoAlvo = alvo;
  }

  // #753: no replay o merge automático fica sempre desligado (merge só pelo 0 MP).
  if (repoAlvo === REPO_REPLAY) mergeAutomatico = false;
  const campoGithub = campos(despacho.corpo).get("caminhos .github do replay");
  const github = caminhosGithubDe(campoGithub);
  if (campoGithub !== undefined && repoAlvo !== REPO_REPLAY) motivos.push("«Caminhos .github do replay» só vale com a Autorização para o mundopropicio-replay");
  if (github.invalidos.length) motivos.push(`caminhos .github inválidos no despacho: ${github.invalidos.join(", ")}`);
  const caminhosGithub = repoAlvo === REPO_REPLAY ? github.caminhos : [];

  // Reservas activas (D-ERP345): reserva sem libertação posterior.
  // Comentários do operador só contam a partir da Autorização vigente; os do Pedro mantêm o histórico.
  const reservas = anteriores.filter((c) => AUTORES.includes(c.autor) || (
    aut !== undefined && autores.includes(c.autor) && c.criadoEm >= aut.criadoEm
  ));
  const ativas = reservas.filter(
    (r) => isReserva(r.corpo) && !reservas.some((l) => isLibertacao(l.corpo) && l.criadoEm > r.criadoEm),
  );
  if (ativas.length === 0) motivos.push("não há «## Reserva» activa nesta Issue");
  else if (ativas.length > 1) motivos.push(`há ${ativas.length} reservas activas nesta Issue`);
  else {
    const exec = executorDe(campos(ativas[0].corpo).get("executor") ?? "");
    if (executor && exec !== executor) motivos.push(`a reserva activa não é do executor designado (${executor})`);
  }

  return { ok: motivos.length === 0, preparacaoR2, motivos, tarefa, mergeAutomatico, executor, repoAlvo, caminhosGithub };
}

/** Verifica a lista de ficheiros alterados pelo executor. */
export function caminhosProibidos(ficheiros: string[], opts?: { preparacaoR2?: boolean }): string[] {
  return ficheiros.filter((f) => {
    // Caminhos canónicos apenas: não permitir que segmentos relativos escapem à lista.
    const permitido = opts?.preparacaoR2 && !f.split("/").some((parte) => parte === "." || parte === "..") && (
      /^drizzle\/migrations\/[^/]+\.sql$/.test(f) ||
      /^supabase\/manual\/[^/]+\.sql$/.test(f) ||
      /^supabase\/functions\/.+\.(ts|json|md)$/.test(f)
    );
    if (permitido) return /(^|\/)\.env/.test(f);
    return CAMINHOS_PROIBIDOS.some((re) => re.test(f));
  });
}

/**
 * #753: caminhos proibidos no replay. .github/ só nos caminhos exactos listados no Despacho;
 * .env nunca; segmentos relativos nunca. As regras de supabase/, drizzle/ e .lovable/ são do
 * repo principal e não se aplicam ao replay.
 */
export function caminhosProibidosReplay(ficheiros: string[], githubPermitidos: string[] = []): string[] {
  return ficheiros.filter((f) => {
    if (f.split("/").some((parte) => parte === "." || parte === "..")) return true;
    if (/(^|\/)\.env/.test(f)) return true;
    if (/^\.github\//.test(f)) return !(CAMINHO_GITHUB_REPLAY.test(f) && githubPermitidos.includes(f));
    return false;
  });
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
