/**
 * D-ERP265 — O cachê configura-se no Master OU nos subeventos, nunca nos dois.
 * "master": o evento é subevento e o Master já tem configuração → o ecrã mostra a do Master.
 * "children": o evento é Master e há subeventos com configuração → o Master não configura.
 * "own": configuração própria permitida.
 */
export type CacheScope = "own" | "master" | "children";

export function resolveCacheScope(args: {
  parentEventId: string | null;
  parentConfigCount: number;
  childrenWithConfigCount: number;
}): CacheScope {
  if (args.parentEventId && args.parentConfigCount > 0) return "master";
  if (!args.parentEventId && args.childrenWithConfigCount > 0) return "children";
  return "own";
}
