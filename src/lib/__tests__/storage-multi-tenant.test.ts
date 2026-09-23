import { describe, it, expect, beforeEach, vi } from "vitest";

// Empresa resolvida pelo servidor — mutável para simular a troca de empresa.
const mockState = vi.hoisted(() => ({
  companyId: "00000000-0000-0000-0000-aaaaaaaaaaaa",
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-123" } }),
}));

// Mock Supabase client BEFORE importing the SUT
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (_fn: string, args: { target_company_id: string }) => {
      // O servidor passa a resolver a empresa nova.
      mockState.companyId = args.target_company_id;
      return { data: args.target_company_id, error: null };
    }),
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-123" } },
        error: null,
      })),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { company_id: mockState.companyId },
            error: null,
          }),
        }),
      }),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (_p, _f, _o) => ({
          data: { path: "ignored" },
          error: null,
        })),
      })),
    },
  },
}));

import {
  withCompanyPath,
  ISOLATED_BUCKETS,
  GLOBAL_BUCKETS,
  clearCompanyCache,
  uploadToCompanyBucket,
  type Bucket,
} from "@/lib/storage";

const COMPANY = "00000000-0000-0000-0000-aaaaaaaaaaaa";

describe("multi-tenant storage helpers", () => {
  beforeEach(() => {
    clearCompanyCache();
    mockState.companyId = COMPANY;
  });

  describe("ISOLATED_BUCKETS / GLOBAL_BUCKETS classification", () => {
    it("contains the 11 known isolated buckets", () => {
      const expected = [
        "bp-version-snapshots",
        "cache-extra-documents",
        "camarim-documents",
        "closing-cost-documents",
        "implementation-files",
        "import-reports",
        "partner-extra-documents",
        "supplier-credit-documents",
        "supplier-documents",
        "ticket-office-settlements",
        "transaction-documents",
      ];
      expect(ISOLATED_BUCKETS.size).toBe(11);
      for (const b of expected) expect(ISOLATED_BUCKETS.has(b)).toBe(true);
    });

    it("contains exactly the 2 global buckets", () => {
      expect(GLOBAL_BUCKETS.size).toBe(2);
      expect(GLOBAL_BUCKETS.has("company-branding")).toBe(true);
      expect(GLOBAL_BUCKETS.has("database-backups")).toBe(true);
    });

    it("isolated and global buckets are disjoint", () => {
      for (const b of ISOLATED_BUCKETS) expect(GLOBAL_BUCKETS.has(b)).toBe(false);
      for (const b of GLOBAL_BUCKETS) expect(ISOLATED_BUCKETS.has(b)).toBe(false);
    });
  });

  describe("withCompanyPath", () => {
    it("prefixes path for isolated buckets", async () => {
      const out = await withCompanyPath("transaction-documents", "tx/123/file.pdf");
      expect(out).toBe(`${COMPANY}/tx/123/file.pdf`);
    });

    it("is idempotent — does not double-prefix when companyId already present", async () => {
      const already = `${COMPANY}/tx/123/file.pdf`;
      const out = await withCompanyPath("transaction-documents", already);
      expect(out).toBe(already);
    });

    it("still prefixes legacy paths that begin with a transaction UUID", async () => {
      const legacyTransactionPath = "11111111-2222-4333-8444-555555555555/1776688943871.pdf";
      const out = await withCompanyPath("transaction-documents", legacyTransactionPath);
      expect(out).toBe(`${COMPANY}/${legacyTransactionPath}`);
    });

    it("strips leading slashes before prefixing", async () => {
      const out = await withCompanyPath("supplier-documents", "/foo/bar.png");
      expect(out).toBe(`${COMPANY}/foo/bar.png`);
    });

    it("does NOT prefix for global buckets (company-branding)", async () => {
      const out = await withCompanyPath("company-branding", "logos/mp.png");
      expect(out).toBe("logos/mp.png");
    });

    it("does NOT prefix for global buckets (database-backups)", async () => {
      const out = await withCompanyPath("database-backups", "2026-04-29.sql");
      expect(out).toBe("2026-04-29.sql");
    });

    it("handles every isolated bucket consistently", async () => {
      for (const bucket of Array.from(ISOLATED_BUCKETS) as Bucket[]) {
        const out = await withCompanyPath(bucket, "x/y.txt");
        expect(out).toBe(`${COMPANY}/x/y.txt`);
      }
    });

    // Regressão #237: depois de trocar de empresa no cabeçalho, a cache de
    // módulo tinha de ser limpa (clearCompanyCache em useSetActiveCompany /
    // signOut); sem isso withCompanyPath continuava a prefixar com a empresa
    // anterior — uploads recusados pela RLS e downloads na pasta errada.
    it("after a company switch, isolated buckets resolve to the NEW company prefix", async () => {
      const COMPANY_B = "00000000-0000-0000-0000-bbbbbbbbbbbb";

      // 1) Sessão na empresa A: caminho prefixado com A.
      expect(await withCompanyPath("transaction-documents", "f.pdf")).toBe(
        `${COMPANY}/f.pdf`,
      );

      // 2) O servidor passa a resolver a empresa B (set_active_company correu bem).
      mockState.companyId = COMPANY_B;

      // 3) Sem limpar a cache, o prefixo fica preso na empresa A (o bug original).
      expect(await withCompanyPath("transaction-documents", "f.pdf")).toBe(
        `${COMPANY}/f.pdf`,
      );

      // 4) A troca real limpa a cache — o prefixo passa a ser o da empresa B.
      clearCompanyCache();
      expect(await withCompanyPath("transaction-documents", "f.pdf")).toBe(
        `${COMPANY_B}/f.pdf`,
      );
    });
  });

  describe("uploadToCompanyBucket", () => {
    it("returns the prefixed path on success for isolated buckets", async () => {
      const blob = new Blob(["hello"]);
      const res = await uploadToCompanyBucket("camarim-documents", "session-1/recibo.pdf", blob);
      expect(res.path).toBe(`${COMPANY}/session-1/recibo.pdf`);
      expect(res.error).toBeNull();
    });

    it("returns the unprefixed path for global buckets", async () => {
      const blob = new Blob(["hello"]);
      const res = await uploadToCompanyBucket("company-branding", "demo-2/logo.png", blob);
      expect(res.path).toBe("demo-2/logo.png");
    });
  });

  // (#237) Teste de COMPORTAMENTO: corre a mutação real useSetActiveCompany.
  // Falha se useSetActiveCompany deixar de chamar clearCompanyCache.
  describe("useSetActiveCompany limpa a cache do storage", () => {
    it("depois da troca, withCompanyPath prefixa com a empresa nova", async () => {
      const React = await import("react");
      const { renderHook, act } = await import("@testing-library/react");
      const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
      const { useSetActiveCompany } = await import("@/hooks/useCompany");
      const { clearCompanyCache } = await import("@/lib/storage");

      const A = "00000000-0000-0000-0000-aaaaaaaaaaaa";
      const B = "00000000-0000-0000-0000-cccccccccccc";
      clearCompanyCache();
      mockState.companyId = A;
      // Aquece a cache com a empresa A.
      expect(await withCompanyPath("transaction-documents", "x.pdf")).toBe(`${A}/x.pdf`);

      const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: qc }, children);
      const { result } = renderHook(() => useSetActiveCompany(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync(B);
      });

      // Sem clearCompanyCache na mutação, isto devolveria o prefixo de A.
      expect(await withCompanyPath("transaction-documents", "x.pdf")).toBe(`${B}/x.pdf`);
      mockState.companyId = A;
      clearCompanyCache();
    });
  });
});
