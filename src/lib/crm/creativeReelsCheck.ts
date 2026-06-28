/**
 * Avaliação técnica DETERMINÍSTICA (sem LLM) de um criativo da biblioteca
 * para a recomendação Meta REELS_PC_RECOMMENDATION.
 *
 * Critérios baseados nas specs Meta Reels 2026 fornecidas pelo Pedro:
 *  - tipo            : video (DURO — falha se não for)
 *  - proporção       : 9:16 vertical, ratio height/width ∈ [1.7, 1.85] (DURO)
 *  - resolução       : ≥ 1080x1920 (AVISO — não bloqueia)
 *  - duração máx     : ≤ 90s (DURO)
 *  - faixa duração   : 15–60s (NOTA informativa, não bloqueia)
 *  - formato/mime    : video/mp4 ou video/quicktime (AVISO — não bloqueia)
 *
 * atende = true ⇔ todos os critérios DUROS passam (tipo, proporção, duração máx).
 * Avisos e notas NÃO impedem atende=true.
 */

export type Estado = "ok" | "aviso" | "falha";

export interface CriterioResultado {
  nome: string;
  estado: Estado;
  detalhe: string;
}

export interface ReelsCheckResult {
  atende: boolean;
  criterios: CriterioResultado[];
  resumo: string;
}

export interface CreativeInput {
  type: string | null | undefined;
  width: number | null | undefined;
  height: number | null | undefined;
  duration_seconds: number | null | undefined;
  file_mime_type: string | null | undefined;
}

const REELS_RATIO_MIN = 1.7;
const REELS_RATIO_MAX = 1.85;
const REELS_MIN_WIDTH = 1080;
const REELS_MIN_HEIGHT = 1920;
const REELS_MAX_DURATION = 90;
const REELS_IDEAL_MIN = 15;
const REELS_IDEAL_MAX = 60;
const ALLOWED_MIMES = ["video/mp4", "video/quicktime"];

function fmtRatio(w: number, h: number): string {
  if (w === h) return "1:1 (quadrado)";
  const r = h / w;
  if (Math.abs(r - 1.777) < 0.08) return "9:16 vertical";
  if (Math.abs(r - 0.5625) < 0.08) return "16:9 horizontal";
  if (Math.abs(r - 1.25) < 0.05) return "4:5 vertical";
  return `${w}x${h} (ratio ${r.toFixed(2)})`;
}

export function evaluateCreativeForReels(creative: CreativeInput): ReelsCheckResult {
  const criterios: CriterioResultado[] = [];
  let duroFalhou = false;

  // 1. Tipo (DURO)
  if (creative.type !== "video") {
    criterios.push({
      nome: "Tipo de criativo",
      estado: "falha",
      detalhe: `Reels exige vídeo, este criativo é ${creative.type ?? "desconhecido"}.`,
    });
    duroFalhou = true;
    return {
      atende: false,
      criterios,
      resumo: "Não atende: Reels exige um vídeo vertical 9:16.",
    };
  }
  criterios.push({ nome: "Tipo de criativo", estado: "ok", detalhe: "Vídeo." });

  // 2. Proporção (DURO)
  const w = creative.width ?? 0;
  const h = creative.height ?? 0;
  if (!w || !h) {
    criterios.push({
      nome: "Proporção",
      estado: "falha",
      detalhe: "Dimensões em falta no criativo — impossível confirmar 9:16.",
    });
    duroFalhou = true;
  } else {
    const ratio = h / w;
    if (ratio < REELS_RATIO_MIN || ratio > REELS_RATIO_MAX) {
      criterios.push({
        nome: "Proporção",
        estado: "falha",
        detalhe: `É ${fmtRatio(w, h)}. Reels exige 9:16 vertical.`,
      });
      duroFalhou = true;
    } else {
      criterios.push({
        nome: "Proporção",
        estado: "ok",
        detalhe: `9:16 vertical (${w}x${h}).`,
      });
    }
  }

  // 3. Resolução (AVISO)
  if (w && h) {
    if (w < REELS_MIN_WIDTH || h < REELS_MIN_HEIGHT) {
      criterios.push({
        nome: "Resolução",
        estado: "aviso",
        detalhe: `Resolução abaixo do recomendado (1080x1920). Atual: ${w}x${h}.`,
      });
    } else {
      criterios.push({
        nome: "Resolução",
        estado: "ok",
        detalhe: `${w}x${h} (≥ 1080x1920).`,
      });
    }
  }

  // 4. Duração (DURO máx; NOTA faixa ideal)
  const dur = creative.duration_seconds ?? 0;
  if (!dur) {
    criterios.push({
      nome: "Duração",
      estado: "aviso",
      detalhe: "Duração desconhecida — confirma que não excede 90s.",
    });
  } else if (dur > REELS_MAX_DURATION) {
    criterios.push({
      nome: "Duração",
      estado: "falha",
      detalhe: `Vídeo demasiado longo para Reels (máx 90s). Atual: ${Math.round(dur)}s.`,
    });
    duroFalhou = true;
  } else if (dur < REELS_IDEAL_MIN || dur > REELS_IDEAL_MAX) {
    criterios.push({
      nome: "Duração",
      estado: "aviso",
      detalhe: `Fora da faixa ideal de 15–60s, mas aceite. Atual: ${Math.round(dur)}s.`,
    });
  } else {
    criterios.push({
      nome: "Duração",
      estado: "ok",
      detalhe: `${Math.round(dur)}s (na faixa ideal 15–60s).`,
    });
  }

  // 5. Formato / MIME (AVISO)
  const mime = (creative.file_mime_type ?? "").toLowerCase();
  if (!mime) {
    criterios.push({
      nome: "Formato",
      estado: "aviso",
      detalhe: "Formato desconhecido; Meta recomenda MP4/MOV H.264.",
    });
  } else if (!ALLOWED_MIMES.includes(mime)) {
    criterios.push({
      nome: "Formato",
      estado: "aviso",
      detalhe: `Formato pode não ser ótimo (${mime}); Meta recomenda MP4/MOV H.264.`,
    });
  } else {
    criterios.push({ nome: "Formato", estado: "ok", detalhe: mime });
  }

  const atende = !duroFalhou;
  const falhas = criterios.filter((c) => c.estado === "falha");
  const avisos = criterios.filter((c) => c.estado === "aviso");

  let resumo: string;
  if (atende && avisos.length === 0) {
    resumo = "Atende aos requisitos de Reels.";
  } else if (atende) {
    resumo = `Atende aos requisitos de Reels com ${avisos.length} aviso${avisos.length === 1 ? "" : "s"}.`;
  } else {
    resumo = `Não atende: ${falhas.map((f) => f.detalhe).join(" ")}`;
  }

  return { atende, criterios, resumo };
}
