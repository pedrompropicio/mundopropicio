import { describe, it, expect } from "vitest";
import { matchFilesToForecasts, type BpForecastForMatch } from "../bp-attachment-matching";

const driveId = "1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7"; // 33 chars

const baseForecasts: BpForecastForMatch[] = [
  {
    id: "f-catering",
    event_id: "e1",
    description: "Catering jantar equipa",
    amount: 1200,
    supplier_name: "Restaurante O Bacalhau",
    attachment_refs: [{ url: `ref://https://drive.google.com/file/d/${driveId}/view` }],
  },
  {
    id: "f-som",
    event_id: "e1",
    description: "Aluguer de equipamento de som e luz",
    amount: 5500,
    supplier_name: "AudioPro Lda",
    attachment_refs: [],
  },
  {
    id: "f-transp",
    event_id: "e1",
    description: "Transporte de equipamento e roadies",
    amount: 800,
    supplier_name: "TransRapid",
    attachment_refs: [],
  },
  {
    id: "f-seg",
    event_id: "e1",
    description: "Segurança privada para o evento",
    amount: 2100,
    supplier_name: null,
    attachment_refs: [],
  },
];

describe("matchFilesToForecasts", () => {
  it("Strategy 1: matches by Drive ID embedded in filename", () => {
    const res = matchFilesToForecasts({
      fileNames: [`fatura_${driveId}.pdf`],
      forecasts: baseForecasts,
    });
    expect(res[0].forecastId).toBe("f-catering");
    expect(res[0].strategy).toBe("drive-id");
    expect(res[0].score).toBe(1);
  });

  it("Strategy 2: matches by supplier name appearing in filename", () => {
    const res = matchFilesToForecasts({
      fileNames: ["AudioPro - fatura jan.pdf"],
      forecasts: baseForecasts,
    });
    expect(res[0].forecastId).toBe("f-som");
    expect(res[0].strategy).toBe("supplier");
  });

  it("Strategy 2: handles diacritics and case", () => {
    const res = matchFilesToForecasts({
      fileNames: ["RESTAURANTE_o_bacalhau_recibo.pdf"],
      forecasts: baseForecasts,
    });
    expect(res[0].forecastId).toBe("f-catering");
    expect(res[0].strategy).toBe("supplier");
  });

  it("Strategy 3: falls back to description similarity", () => {
    const res = matchFilesToForecasts({
      fileNames: ["seguranca_privada_evento.pdf"],
      forecasts: baseForecasts,
    });
    expect(res[0].forecastId).toBe("f-seg");
    expect(res[0].strategy).toBe("similarity");
    expect(res[0].score).toBeGreaterThan(0.25);
  });

  it("returns 'none' when nothing matches above threshold", () => {
    const res = matchFilesToForecasts({
      fileNames: ["xpto_1234.pdf"],
      forecasts: baseForecasts,
    });
    expect(res[0].forecastId).toBeNull();
    expect(res[0].strategy).toBe("none");
  });

  it("ignores noise words like 'factura', 'recibo', 'pdf'", () => {
    const res = matchFilesToForecasts({
      fileNames: ["factura_recibo_pdf_scan.pdf"],
      forecasts: baseForecasts,
    });
    // Only noise → no real tokens → no match
    expect(res[0].forecastId).toBeNull();
  });

  it("disambiguates multiple supplier matches via description tokens", () => {
    const forecasts: BpForecastForMatch[] = [
      {
        id: "a",
        event_id: "e1",
        description: "Aluguer som palco principal",
        amount: 100,
        supplier_name: "ProSound",
        attachment_refs: [],
      },
      {
        id: "b",
        event_id: "e1",
        description: "Aluguer luz palco secundario",
        amount: 100,
        supplier_name: "ProSound",
        attachment_refs: [],
      },
    ];
    const res = matchFilesToForecasts({
      fileNames: ["ProSound aluguer luz palco.pdf"],
      forecasts,
    });
    expect(res[0].forecastId).toBe("b");
    expect(res[0].strategy).toBe("supplier");
  });

  it("processes multiple files independently", () => {
    const res = matchFilesToForecasts({
      fileNames: [
        `comprovativo_${driveId}.pdf`,
        "TransRapid_recibo.pdf",
        "completamente_aleatorio.pdf",
      ],
      forecasts: baseForecasts,
    });
    expect(res).toHaveLength(3);
    expect(res[0].strategy).toBe("drive-id");
    expect(res[1].strategy).toBe("supplier");
    expect(res[1].forecastId).toBe("f-transp");
    expect(res[2].strategy).toBe("none");
  });

  it("respects custom minSimilarity threshold", () => {
    const res = matchFilesToForecasts({
      fileNames: ["seguranca evento.pdf"],
      forecasts: baseForecasts,
      minSimilarity: 0.95,
    });
    expect(res[0].forecastId).toBeNull();
  });

  it("handles empty file list and empty forecast list", () => {
    expect(matchFilesToForecasts({ fileNames: [], forecasts: baseForecasts })).toEqual([]);
    const res = matchFilesToForecasts({ fileNames: ["a.pdf"], forecasts: [] });
    expect(res[0].forecastId).toBeNull();
    expect(res[0].strategy).toBe("none");
  });

  it("ignores supplier tokens shorter than 4 chars to avoid false positives", () => {
    const forecasts: BpForecastForMatch[] = [
      {
        id: "x",
        event_id: "e1",
        description: "Despesa diversa",
        amount: 50,
        supplier_name: "AB CD", // both tokens < 4 chars
        attachment_refs: [],
      },
    ];
    const res = matchFilesToForecasts({
      fileNames: ["abcd_qualquer_coisa.pdf"],
      forecasts,
    });
    expect(res[0].strategy).not.toBe("supplier");
  });
});
