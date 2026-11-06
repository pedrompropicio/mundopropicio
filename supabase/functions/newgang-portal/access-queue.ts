// #405 E2b — só escolhe a fila; o payload mantém a mesma referência e conteúdo.
export function clubLinkEnqueueArgs<T>(kind: "access" | "welcome" | "reminder", payload: T) {
  return {
    queue_name: kind === "access" ? "auth_emails" as const : "transactional_emails" as const,
    payload,
  };
}

export function writeActionIpMax(action: string): 20 | 40 {
  return action === "request_access" ? 40 : 20;
}
