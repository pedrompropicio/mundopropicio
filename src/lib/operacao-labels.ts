export function frenteLabel(type?: string | null, plural = false): string {
  if (type === "service") return plural ? "Serviços" : "Serviço";
  if (type === "zone") return plural ? "Zonas" : "Zona";
  return plural ? "Frentes" : "Frente";
}

export function frenteLabelNeutral(plural = false): string {
  return plural ? "Zonas/Serviços" : "Zona/Serviço";
}
