// Labels para papéis do evento (event_team_members.role) e papéis na frente
// (operacao_frente_team.role_in_frente).

export function roleEventLabel(role?: string | null): string {
  switch (role) {
    case "general_producer":
      return "Produtor Geral";
    case "director":
      return "Diretor";
    case "coordinator":
      return "Coordenador";
    case "producer":
      return "Produtor";
    default:
      return role ?? "—";
  }
}

export function roleFrenteLabel(role?: string | null): string {
  switch (role) {
    case "lead":
      return "Produtor da Frente";
    case "helper":
      return "Auxiliar";
    case "member":
      return "Staff";
    default:
      return role ?? "Staff";
  }
}

export function etapaRoleLabel(role?: string | null): string {
  switch (role) {
    case "owner":
      return "Responsável";
    case "helper":
      return "Auxiliar";
    default:
      return role ?? "—";
  }
}

export function initialsOf(name?: string | null, email?: string | null): string {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
