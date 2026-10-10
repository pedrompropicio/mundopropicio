// Invariante edge_fn_sem_guarda_empresa (#283 parte 5, D-ERP204).
// Edge functions que usam a service role key e aceitam ids do cliente sem
// identidade verificada ou sem guarda de empresa. Trava se a contagem SUBIR
// acima da referência; ao corrigir uma, baixa-se a referência e tira-se da lista.
// Corre em cada commit e diariamente no CI (o código das edge functions não está
// na base, por isso não pode viver em run_invariant_checks).
import { describe, it, expect } from "vitest";
import { scanEdgeFunctions, functionsWithoutVerifyJwtBlock } from "../../scripts/edge-fn-guard-lib.mjs";

// Referência gravada a 09/10/2026 (parte 6, D-ERP205): 2.
// Têm bloco verify_jwt = true, mas o portão só verifica a ASSINATURA — a anon key
// (pública) passa. Ficam por decisão do Pedro; não mexer sem instrução.
// Nota 10/10/2026 (D-ERP229): o resto da #283 (32 funções que liam service_role do
// payload) não mexe nesta contagem — mede outra coisa (ids do cliente sem guarda).
// O claim do payload tem guarda própria no describe "service_role_pelo_payload".
const REFERENCIA = [
  "crm-extract-video-dimensions",
  "vip-coupon-email",
];

describe("edge_fn_sem_guarda_empresa", () => {
  const achados = scanEdgeFunctions().filter((x: { porDesenho: string | null }) => !x.porDesenho);
  const nomes = achados.map((x: { fn: string }) => x.fn);

  it(`não sobe acima da referência (${REFERENCIA.length})`, () => {
    const novas = achados
      .filter((x: { fn: string }) => !REFERENCIA.includes(x.fn))
      .map((x: { fn: string; motivos: string[] }) => `${x.fn}: ${x.motivos.join(", ")}`);
    expect(
      novas,
      `Edge functions novas com service role + ids do cliente sem getUser/papel na empresa:\n${novas.join("\n")}\n` +
        "Usa assertCallerRoleOnRow / assertCallerRoleInCompany / isServiceRoleRequest (_shared/multiTenant.ts), " +
        "ou acrescenta-a a POR_DESENHO em scripts/edge-fn-guard-lib.mjs com o motivo.",
    ).toEqual([]);
    expect(nomes.length).toBeLessThanOrEqual(REFERENCIA.length);
  });

  it("a referência não guarda funções já corrigidas (baixa-a)", () => {
    const corrigidas = REFERENCIA.filter((f) => !nomes.includes(f));
    expect(corrigidas, `Já não aparecem — tira-as da REFERENCIA: ${corrigidas.join(", ")}`).toEqual([]);
  });
});

// Facto de Live (D-ERP205): função sem bloco no config.toml corre SEM verificação
// de assinatura no portão. Toda a edge function declara verify_jwt explicitamente.
describe("verify_jwt explícito no config.toml", () => {
  it("nenhuma edge function sem bloco [functions.<nome>] com verify_jwt", () => {
    const sem = functionsWithoutVerifyJwtBlock();
    expect(
      sem,
      `Sem bloco verify_jwt em supabase/config.toml:\n${sem.join("\n")}\n` +
        "Acrescenta [functions.<nome>] com verify_jwt = true (ou false com comentário: porquê e quem chama).",
    ).toEqual([]);
  });
});

// D-ERP229: decidir "é service role" lendo o claim do payload (sem validar) está proibido.
// Excepções: o claim serve só para RECUSAR a chave de serviço, ou só rotula a origem.
const PAYLOAD_SO_RECUSA_OU_ROTULO: Record<string, string> = {
  "crm-meta-publish-update/index.ts": "recusa service role (edição exige sessão de utilizador)",
  "s4a-token-seed/index.ts": "recusa service role quando vem com código OAuth",
  "_shared/sync-run.ts": "só rotula trigger_source cron/manual; não autoriza",
};
describe("service_role_pelo_payload", () => {
  it("nenhuma edge function aceita service role pelo claim sem isServiceRoleRequest", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(__dirname, "../../supabase/functions");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) walk(f);
        else if (f.endsWith(".ts")) files.push(f);
      }
    };
    walk(root);
    const re = /(role\s*[!=]==?\s*['"]service_role['"]|['"]service_role['"]\s*[!=]==?\s*\w*role)/;
    const achados = files
      .map((f) => path.relative(root, f).split(path.sep).join("/"))
      .filter((rel) => rel !== "_shared/multiTenant.ts" && !PAYLOAD_SO_RECUSA_OU_ROTULO[rel])
      .filter((rel) => {
        const s = fs.readFileSync(path.join(root, rel), "utf8");
        return /atob\(/.test(s) && re.test(s);
      });
    expect(achados, `Usa isServiceRoleRequest (_shared/multiTenant.ts): ${achados.join(", ")}`).toEqual([]);
  });
});
