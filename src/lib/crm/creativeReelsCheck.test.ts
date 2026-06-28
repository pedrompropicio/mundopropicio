import { describe, it, expect } from "vitest";
import { evaluateCreativeForReels } from "./creativeReelsCheck";

describe("evaluateCreativeForReels", () => {
  it("vídeo 1080x1920 30s mp4 → atende, tudo ok", () => {
    const r = evaluateCreativeForReels({
      type: "video",
      width: 1080,
      height: 1920,
      duration_seconds: 30,
      file_mime_type: "video/mp4",
    });
    expect(r.atende).toBe(true);
    expect(r.criterios.every((c) => c.estado === "ok")).toBe(true);
  });

  it("imagem → falha tipo", () => {
    const r = evaluateCreativeForReels({
      type: "image",
      width: 1080,
      height: 1920,
      duration_seconds: null,
      file_mime_type: "image/jpeg",
    });
    expect(r.atende).toBe(false);
    expect(r.criterios[0].nome).toBe("Tipo de criativo");
    expect(r.criterios[0].estado).toBe("falha");
  });

  it("vídeo 1080x1080 (quadrado) → falha proporção", () => {
    const r = evaluateCreativeForReels({
      type: "video",
      width: 1080,
      height: 1080,
      duration_seconds: 30,
      file_mime_type: "video/mp4",
    });
    expect(r.atende).toBe(false);
    const prop = r.criterios.find((c) => c.nome === "Proporção");
    expect(prop?.estado).toBe("falha");
    expect(prop?.detalhe).toMatch(/9:16/);
  });

  it("vídeo 1080x1920 120s → falha duração", () => {
    const r = evaluateCreativeForReels({
      type: "video",
      width: 1080,
      height: 1920,
      duration_seconds: 120,
      file_mime_type: "video/mp4",
    });
    expect(r.atende).toBe(false);
    const dur = r.criterios.find((c) => c.nome === "Duração");
    expect(dur?.estado).toBe("falha");
  });

  it("vídeo 720x1280 → atende mas aviso de resolução", () => {
    const r = evaluateCreativeForReels({
      type: "video",
      width: 720,
      height: 1280,
      duration_seconds: 30,
      file_mime_type: "video/mp4",
    });
    expect(r.atende).toBe(true);
    const res = r.criterios.find((c) => c.nome === "Resolução");
    expect(res?.estado).toBe("aviso");
  });
});
