import { readFileSync, readdirSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CityVenueSelector } from "@/components/CityVenueSelector";
import { countryIsoToName } from "../country";

const f = vi.hoisted(() => ({ country: "PT", options: [] as any[], cities: [
  { id: "belem", name: "Belém", country: "Brasil", state: "PA" },
  { id: "fortaleza", name: "Fortaleza", country: "Brasil", state: "CE" },
  { id: "lisboa", name: "Lisboa", country: "Portugal", state: null },
  { id: "madrid", name: "Madrid", country: "Espanha", state: null },
  { id: "porto", name: "Porto", country: "Portugal", state: null },
] }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ company: { country: f.country } }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: any) => ({ data: queryKey[0] === "cities" ? f.cities : [] }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/ui/searchable-select", () => ({ SearchableSelect: ({ options, placeholder }: any) => {
  if (placeholder === "Selecionar cidade…") f.options = options;
  return <div>{options.map((o: any) => <span key={o.value}>{o.group}{o.label}</span>)}</div>;
} }));
beforeEach(() => { f.country = "PT"; });
afterEach(cleanup);
function view() { return <CityVenueSelector cityId="" venueId="" onCityChange={() => {}} onVenueChange={() => {}} />; }

describe("#498 P3a — cidades por país", () => {
  it("fixa a ordem, grupos, pesquisa e bytes PT anteriores à alteração", () => {
    render(view());
    expect(f.options).toMatchInlineSnapshot(`
      [
        {
          "group": undefined,
          "label": "Lisboa",
          "searchText": "Lisboa Portugal",
          "value": "lisboa",
        },
        {
          "group": undefined,
          "label": "Porto",
          "searchText": "Porto Portugal",
          "value": "porto",
        },
        {
          "group": "Brasil",
          "label": "Belém - PA · Brasil",
          "searchText": "Belém PA Brasil",
          "value": "belem",
        },
        {
          "group": "Brasil",
          "label": "Fortaleza - CE · Brasil",
          "searchText": "Fortaleza CE Brasil",
          "value": "fortaleza",
        },
        {
          "group": "Espanha",
          "label": "Madrid · Espanha",
          "searchText": "Madrid Espanha",
          "value": "madrid",
        },
      ]
    `);
  });

  it("coloca o grupo Brasil primeiro com Cidade · UF e acompanha a troca de empresa", () => {
    const { rerender } = render(view());
    f.country = "BR"; rerender(view());
    expect(f.options.slice(0, 2)).toEqual([
      { value: "belem", label: "Belém · PA", searchText: "Belém PA Brasil", group: "Brasil" },
      { value: "fortaleza", label: "Fortaleza · CE", searchText: "Fortaleza CE Brasil", group: "Brasil" },
    ]);
    expect(f.options.map(o => o.group)).toEqual(["Brasil", "Brasil", "Espanha", "Portugal", "Portugal"]);
    f.country = "PT"; rerender(view());
    expect(f.options[0].label).toBe("Lisboa");
    expect(f.options[0].group).toBeUndefined();
  });

  it("resolve BR sem inferir país desconhecido", () => {
    expect(countryIsoToName(" br ")).toBe("Brasil");
    expect(countryIsoToName("PT")).toBe("Portugal");
    expect(countryIsoToName(null)).toBeNull();
    expect(countryIsoToName("ZZ")).toBeNull();
  });
});

// Conferência textual e simulação da identidade; não executa SQL, nem abre uma base.
describe("#498 — seed inerte de cidades", () => {
  const sql = readFileSync("supabase/manual/issue498-cidades-br.INERTE.sql", "utf8");
  const entries = [...sql.matchAll(/\('([^']+)','([A-Z]{2})'\)/g)].map(([, name, state]) => ({ name, state }));
  const key = ({ name, state }: { name: string; state: string }) =>
    `Brasil|${name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()}|${state}`;
  function insert(existing: typeof entries) {
    const keys = new Set(existing.map(key));
    return entries.filter(row => !keys.has(key(row)));
  }
  it("inclui 27 capitais e as três praças, preservando todas as identidades do seed anterior", () => {
    const previousPath = readdirSync("supabase/migrations").find(name => name.startsWith("20260620221854_"))!;
    const previous = [...readFileSync(`supabase/migrations/${previousPath}`, "utf8").matchAll(/\('([^']+)','([A-Z]{2})'\)/g)];
    expect(entries).toHaveLength(30);
    expect(new Set(entries.map(key)).size).toBe(30);
    expect(new Set(entries.slice(0, 22).concat(entries.slice(25)).map(e => e.state)).size).toBe(27);
    expect(previous).toHaveLength(25);
    for (const [, name, state] of previous) expect(entries).toContainEqual({ name, state });
  });
  it("segunda passagem insere zero e Fortaleza/CE pré-existente nunca é reinserida", () => {
    const manual = [{ name: "Fortaleza", state: "CE" }, { name: "Belem", state: "PA" }];
    const first = insert(manual);
    expect(first).toHaveLength(28);
    expect(first.some(row => row.name === "Fortaleza" || row.name === "Belém")).toBe(false);
    expect(insert([...manual, ...first])).toEqual([]);
    expect(insert([{ name: "Fortaleza", state: "CE" }])).toHaveLength(29);
    expect(insert(entries.slice(0, 25))).toHaveLength(5);
    expect(sql).toContain("translate(lower(normalize(c.name, NFC))");
    expect(sql).toContain("LOCK TABLE public.cities IN SHARE ROW EXCLUSIVE MODE");
    expect(sql).toContain("ROLLBACK COMENTADO");
  });
});
