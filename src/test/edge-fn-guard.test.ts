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
