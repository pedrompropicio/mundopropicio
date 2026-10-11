import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { trackerRowsToForm, pickMetaPixel, campaignLinkIsValid } from "@/lib/crm/event-trackers";
import { mapTiktokInsight, mapTiktokCampaign } from "@/lib/crm/tiktok-queries";
import { parseTiktokInvoiceText, parseMoneyAny, parseDateAny } from "../../supabase/functions/_shared/ads-invoice-tiktok-parser";

const sql = readFileSync("drizzle/migrations/0106_derp248_tiktok_event_trackers.sql", "utf8");

describe("D-ERP248 event_trackers", () => {
  it("tabela com unique (event_id, platform, tracker_id), RLS por empresa e backfill do meta_pixel_id", () => {
    expect(sql).toMatch(/UNIQUE \(event_id, platform, tracker_id\)/);
    expect(sql).toMatch(/platform IN \('meta','google','tiktok'\)/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/AS RESTRICTIVE FOR ALL TO authenticated\s+USING \(public\.row_belongs_to_current_company\(company_id\)\)/);
    expect(sql).toMatch(/INSERT INTO public\.event_trackers[\s\S]+meta_pixel_id/);
  });
  it("formulário: um valor por plataforma, o mais recente", () => {
    const f = trackerRowsToForm([
      { platform: "meta", tracker_id: "old", updated_at: "2026-01-01" },
      { platform: "meta", tracker_id: "new", updated_at: "2026-10-01" },
      { platform: "tiktok", tracker_id: "CXYZ", updated_at: "2026-10-01" },
      { platform: "x", tracker_id: "ignorado" },
    ]);
    expect(f).toEqual({ meta: "new", google: "", tiktok: "CXYZ" });
  });
  it("deploy: pixel do event_trackers; sem linha ⇒ null (cai na campanha-fonte)", () => {
    expect(pickMetaPixel([])).toBeNull();
    expect(pickMetaPixel([{ platform: "google", tracker_id: "AW-1" }])).toBeNull();
    expect(pickMetaPixel([{ platform: "meta", tracker_id: "123", tracker_metadata: { custom_event_type: "LEAD" } }]))
      .toEqual({ pixel_id: "123", custom_event_type: "LEAD" });
    const deploy = readFileSync("supabase/functions/crm-meta-strategy-deploy/index.ts", "utf8");
    expect(deploy).toContain('from("event_trackers")');
    expect(deploy).not.toContain("DEBT(multi-platform)");
  });
});

describe("D-ERP248 campanha TikTok: evento OU música", () => {
  it("CHECK na base e espelho no cliente", () => {
    expect(sql).toMatch(/CHECK \(linked_event_id IS NULL OR linked_song_id IS NULL\)/);
    expect(campaignLinkIsValid({ linked_event_id: "e", linked_song_id: null })).toBe(true);
    expect(campaignLinkIsValid({ linked_event_id: null, linked_song_id: "s" })).toBe(true);
    expect(campaignLinkIsValid({ linked_event_id: null, linked_song_id: null })).toBe(true);
    expect(campaignLinkIsValid({ linked_event_id: "e", linked_song_id: "s" })).toBe(false);
  });
  it("sync não põe música em campanha com evento; ligação manual recusa campanha com música", () => {
    const sync = readFileSync("supabase/functions/artist-ads-tiktok-sync/index.ts", "utf8");
    expect(sync).toMatch(/hasEvent \? null/);
    expect(sql).toMatch(/evento OU música, nunca os dois/);
  });
  it("auto-link: cidades nunca contam e empate não liga", () => {
    expect(sql).toMatch(/FROM public\.cities ci/);
    expect(sql).toMatch(/IF cardinality\(r\.eids\) = 1 THEN/);
  });
  it("Carreira lê vistas sem campanhas de evento (relatórios e alertas)", () => {
    expect(sql).toMatch(/crm\.tiktok_campaign_carreira/);
    expect(sql).toMatch(/artist_ads_tiktok_alerts_core/);
  });
});

describe("D-ERP248 índice único das ligações", () => {
  it("(platform, selected_ad_account_id) nas ligações ativas", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX uq_conn_active_platform_account ON crm\.ad_platform_connections \(platform, selected_ad_account_id\)\s+WHERE status = 'active' AND selected_ad_account_id IS NOT NULL/);
  });
});

describe("D-ERP248 dashboard TikTok", () => {
  it("cêntimos e '—' (null) nunca zero onde não há dado", () => {
    const r = mapTiktokInsight({ external_campaign_id: "1", date_start: "2026-10-10", spend_cents: 1000, impressions: 0, clicks: 0, currency: "EUR" });
    expect(r.platform).toBe("tiktok");
    expect(r.spend_cents).toBe(1000);
    expect(r.ctr).toBeNull();
    expect(r.cpc_cents).toBeNull();
    expect(r.reach).toBeNull();
    expect(r.purchases_count).toBeNull();
    expect(r.currency).toBe("EUR");
    expect(mapTiktokCampaign({ id: "x", status: "ENABLE", linked_event_id: "e" }).status).toBe("ACTIVE");
  });
});

describe("D-ERP248 parser de faturas TikTok", () => {
  it("lê cabeçalho e linhas por campanha, soma fecha ao cêntimo", () => {
    const r = parseTiktokInvoiceText([
      "Invoice No.: BDUK20261100123",
      "Invoice Date: 2026-11-30",
      "Billing Period: 2026-11-01 - 2026-11-30",
      "1878234185487474 [MP] [ROUPA DE SOLTEIRA] [PT] 123.45",
      "1879000000000001 [NEWGANG] Vendas 2027 1,000.00",
      "Total Amount 1,123.45 EUR",
    ]);
    expect(r.header.invoiceNumber).toBe("BDUK20261100123");
    expect(r.header.billingPeriod).toBe("2026-11-01");
    expect(r.header.totalAmount).toBe(1123.45);
    expect(r.lines.map((l) => l.externalCampaignId)).toEqual(["1878234185487474", "1879000000000001"]);
    expect(r.linesSum).toBe(1123.45);
  });
  it("formatos de dinheiro e datas", () => {
    expect(parseMoneyAny("1.234,56")).toBe(1234.56);
    expect(parseMoneyAny("€1,234.56")).toBe(1234.56);
    expect(parseDateAny("Nov 30, 2026")).toBe("2026-11-30");
    expect(parseDateAny("30/11/2026")).toBe("2026-11-30");
  });
});
