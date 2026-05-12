// Helpers para exportar análises do módulo Audience como PDF.
// Guarda dados em localStorage e abre página print dedicada que funciona em iOS Safari.

const STORAGE_KEY = "audience-print-data";

function openPrintPage(type: "pixel-health" | "campaign-analysis" | "audience-coach" | "audit-report", payload: any) {
  const data = { type, payload, ts: Date.now() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to write localStorage:", e);
    alert("Não foi possível preparar o PDF.");
    return;
  }
  const url = `/audience/print/${type}`;
  window.open(url, "_blank");
}

export function printPixelHealth(pixelsData: any, onlyUsed: boolean) {
  if (!pixelsData) return;
  openPrintPage("pixel-health", { pixelsData, onlyUsed });
}

export function printCampaignAnalysis(analyzeData: any) {
  if (!analyzeData?.analysis) return;
  openPrintPage("campaign-analysis", { analyzeData });
}

export function printAudienceCoach(coachData: any) {
  if (!coachData?.coach) return;
  openPrintPage("audience-coach", { coachData });
}
