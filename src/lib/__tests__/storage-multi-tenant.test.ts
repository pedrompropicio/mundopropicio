import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Supabase client BEFORE importing the SUT
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
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
            data: { company_id: "00000000-0000-0000-0000-aaaaaaaaaaaa" },
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

    it("preserves an existing tenant UUID prefix even if it differs from the active company", async () => {
      const otherCompanyPath = "11111111-2222-4333-8444-555555555555/tx/123/file.pdf";
      const out = await withCompanyPath("transaction-documents", otherCompanyPath);
      expect(out).toBe(otherCompanyPath);
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
});
