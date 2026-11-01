// E2b (#417): corre no GitHub Actions com bun. Lê os comentários da Issue pela API
// com o GITHUB_TOKEN do workflow e escreve a decisão em $GITHUB_OUTPUT.
// Uso: bun scripts/executor/travas.ts avaliar   |   bun scripts/executor/travas.ts caminhos <lista>
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { avaliarDespacho, caminhosProibidos, textoRecusa, type Comentario } from "../../src/lib/executor/travas";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`falta ${k}`);
  return v;
};

async function comentarios(repo: string, issue: number, token: string): Promise<Comentario[]> {
  const out: Comentario[] = [];
  for (let page = 1; page < 50; page++) {
    const r = await fetch(`https://api.github.com/repos/${repo}/issues/${issue}/comments?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const lote = (await r.json()) as { id: number; user: { login: string }; created_at: string; body: string | null }[];
    out.push(...lote.map((c) => ({ id: c.id, autor: c.user.login, criadoEm: c.created_at, corpo: c.body ?? "" })));
    if (lote.length < 100) break;
  }
  return out;
}

const modo = process.argv[2];
if (modo === "avaliar") {
  const issue = Number(env("ISSUE"));
  const decisao = avaliarDespacho(
    issue,
    await comentarios(env("REPO"), issue, env("GITHUB_TOKEN")),
    Number(env("COMMENT_ID")),
    new Date(),
  );
  const out = env("GITHUB_OUTPUT");
  appendFileSync(out, `ok=${decisao.ok}\nmerge_automatico=${decisao.mergeAutomatico}\n`);
  writeFileSync("tarefa.md", decisao.tarefa);
  writeFileSync("recusa.md", decisao.ok ? "" : textoRecusa(issue, decisao.motivos, env("RUN_URL")));
  console.log(decisao.ok ? "Travas: OK" : `Travas: RECUSADO\n- ${decisao.motivos.join("\n- ")}`);
} else if (modo === "caminhos") {
  const ficheiros = readFileSync(process.argv[3], "utf8").split(/\r?\n/).filter(Boolean);
  const maus = caminhosProibidos(ficheiros);
  if (maus.length) {
    console.error(`Caminhos proibidos na E2b:\n- ${maus.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`Caminhos OK (${ficheiros.length} ficheiros)`);
} else {
  console.error("uso: travas.ts avaliar | caminhos <ficheiro>");
  process.exit(2);
}
