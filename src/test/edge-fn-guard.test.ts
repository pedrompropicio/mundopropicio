// Invariante edge_fn_sem_guarda_empresa (#283 parte 5, D-ERP204).
// Edge functions que usam a service role key e aceitam ids do cliente sem
// identidade verificada ou sem guarda de empresa. Trava se a contagem SUBIR
// acima da referência; ao corrigir uma, baixa-se a referência e tira-se da lista.
// Corre em cada commit e diariamente no CI (o código das edge functions não está
// na base, por isso não pode viver em run_invariant_checks).
import { describe, it, expect } from "vitest";
import { scanEdgeFunctions } from "../../scripts/edge-fn-guard-lib.mjs";

// Referência gravada a 09/10/2026, depois das correcções da parte 5.
// Nenhuma tem verificação de identidade no código: o portão (verify_jwt) aceita a
// anon key, que é pública. Por decidir pelo Pedro — não mexer sem instrução.
const REFERENCIA = [
  "crm-extract-video-dimensions",
  "crm-meta-destilar-2025",
  "crm-meta-diagnose-ig",
  "crm-meta-fq-recon",
  "crm-meta-historico-probe",
  "crm-meta-recon-2025",
  "crm-meta-rehost-videos",
  "fetch-onebox-dashboard",
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
