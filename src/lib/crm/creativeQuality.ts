// Inteligência orientativa de criativos — DETERMINÍSTICO, sem LLM.
// Avalia tipo+formato por estratégia/arquétipo e qualidade técnica da peça.
// Tudo orientativo — nunca bloqueia botões nem publicação.

export const SHORT_EDGE_MIN = 1080;
export const IDEAIS = {
  vertical: { w: 1080, h: 1920, label: "9:16 (1080×1920)" },
  feed_45: { w: 1080, h: 1350, label: "4:5 (1080×1350)" },
  quadrado: { w: 1080, h: 1080, label: "1:1 (1080×1080)" },
};

export type Placement = "vertical" | "feed" | "desconhecido";
export type Nivel = "ok" | "aviso" | "info";

export interface PieceInput {
  type?: string | null; // "image" | "video" | etc.
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  file_mime_type?: string | null;
}

export interface Badge {
  codigo: string;
  label: string;
  nivel: Nivel;
  dica?: string;
}

export interface PieceEvaluation {
  nivel: "ok" | "aviso";
  placement: Placement;
  badges: Badge[];
}

export function classifyPlacement(w?: number | null, h?: number | null): Placement {
  if (!w || !h || w <= 0 || h <= 0) return "desconhecido";
  return h / w >= 1.6 ? "vertical" : "feed";
}

function isVideo(type?: string | null, mime?: string | null) {
  if (type === "video") return true;
  if (mime && mime.startsWith("video/")) return true;
  return false;
}

export function evaluatePiece(p: PieceInput): PieceEvaluation {
  const badges: Badge[] = [];
  const placement = classifyPlacement(p.width, p.height);
  const video = isVideo(p.type, p.file_mime_type);

  if (!p.width || !p.height) {
    badges.push({
      codigo: "sem_dimensoes",
      label: "Sem dimensões",
      nivel: "aviso",
      dica: "Sem dimensões (peça reutilizada do Meta). Não entra no multi-formato e a Meta pode cortar.",
    });
  } else {
    const shortEdge = Math.min(p.width, p.height);
    if (shortEdge < SHORT_EDGE_MIN) {
      badges.push({
        codigo: "resolucao_baixa",
        label: `Baixa resolução (${shortEdge}px)`,
        nivel: "aviso",
        dica: "Abaixo de 1080px no lado curto — perde qualidade no leilão (Andromeda).",
      });
    }
    badges.push({
      codigo: "placement_detetado",
      label: placement === "vertical" ? "Stories/Reels (9:16)" : placement === "feed" ? "Feed (4:5/1:1)" : "Placement —",
      nivel: "info",
    });
  }

  if (video && p.duration_seconds != null) {
    if (p.duration_seconds > 30) {
      badges.push({
        codigo: "video_longo",
        label: `Vídeo ${p.duration_seconds.toFixed(0)}s`,
        nivel: "aviso",
        dica: "Vídeo longo; ideal 6–15s para Reels/Stories, hook nos 1ºs 3s.",
      });
    } else if (p.duration_seconds > 15) {
      badges.push({
        codigo: "video_medio",
        label: `Vídeo ${p.duration_seconds.toFixed(0)}s`,
        nivel: "info",
        dica: "Vídeo entre 15–30s. Considera cortar para 6–15s nos Reels/Stories.",
      });
    }
  }

  const nivel: "ok" | "aviso" = badges.some((b) => b.nivel === "aviso") ? "aviso" : "ok";
  return { nivel, placement, badges };
}

export interface ArchetypeRecommendation {
  tipo_enfase: "estatico" | "video" | "misto";
  formato: string;
  texto: string;
}

export function recommendForArchetype(trigger_tipo?: string | null): ArchetypeRecommendation {
  switch ((trigger_tipo ?? "").toLowerCase()) {
    case "escassez":
      return {
        tipo_enfase: "estatico",
        formato: "4:5 no feed + 1 vídeo 9:16 nos Stories/Reels",
        texto: "Público em decisão/urgência: estático 4:5 com a oferta converte mais barato. Cobre também 9:16 nos Stories/Reels.",
      };
    case "narrativa":
      return {
        tipo_enfase: "video",
        formato: "9:16 nos Reels/Stories + 4:5 no feed",
        texto: "Apresentar/captar atenção: vídeo 9:16 curto, hook nos 3s. Cobre também 4:5 no feed.",
      };
    case "antecipacao":
      return {
        tipo_enfase: "misto",
        formato: "4:5 + 9:16 — mistura vídeo (teaser) e estático (data/local)",
        texto: "Antecipação: combina teaser em vídeo 9:16 com estático 4:5 que reforça data/local.",
      };
    default:
      return {
        tipo_enfase: "misto",
        formato: "4:5 + 9:16",
        texto: "Cobre 4:5 + 9:16 e mistura vídeo e estático.",
      };
  }
}

export type CoberturaFormato = "completa" | "so_feed" | "so_vertical" | "vazio";
export type AdequacaoFunil = "alinhado" | "sugere_estatico" | "sugere_video" | "neutro";

export interface AdsetEvaluation {
  cobertura_formato: CoberturaFormato;
  adequacao_funil: AdequacaoFunil;
  avisos: string[];
  total: number;
  com_dimensoes: number;
}

export function evaluateAdset(pecas: PieceInput[], trigger_tipo?: string | null): AdsetEvaluation {
  const avisos: string[] = [];
  if (!pecas || pecas.length === 0) {
    return { cobertura_formato: "vazio", adequacao_funil: "neutro", avisos: ["Adset sem peças."], total: 0, com_dimensoes: 0 };
  }
  let temFeed = false;
  let temVertical = false;
  let temVideo = false;
  let temEstatico = false;
  let comDim = 0;
  for (const p of pecas) {
    const pl = classifyPlacement(p.width, p.height);
    if (pl === "feed") temFeed = true;
    if (pl === "vertical") temVertical = true;
    if (pl !== "desconhecido") comDim++;
    if (isVideo(p.type, p.file_mime_type)) temVideo = true;
    else temEstatico = true;
  }

  let cobertura: CoberturaFormato = "vazio";
  if (temFeed && temVertical) cobertura = "completa";
  else if (temFeed) cobertura = "so_feed";
  else if (temVertical) cobertura = "so_vertical";

  if (cobertura === "so_feed") avisos.push("Falta 9:16 — Stories/Reels serão cortados.");
  if (cobertura === "so_vertical") avisos.push("Falta 4:5/1:1 — o Feed pode ficar mal servido.");

  const tipo = (trigger_tipo ?? "").toLowerCase();
  let adequacao: AdequacaoFunil = "neutro";
  if (tipo === "escassez") {
    if (temVideo && !temEstatico) {
      adequacao = "sugere_estatico";
      avisos.push("Adset de escassez só com vídeos — junta um estático com a oferta.");
    } else {
      adequacao = "alinhado";
    }
  } else if (tipo === "narrativa") {
    if (temEstatico && !temVideo) {
      adequacao = "sugere_video";
      avisos.push("Adset de narrativa só com estáticos — junta um vídeo curto 9:16.");
    } else {
      adequacao = "alinhado";
    }
  }

  return { cobertura_formato: cobertura, adequacao_funil: adequacao, avisos, total: pecas.length, com_dimensoes: comDim };
}
