// Resolução determinística pós-LLM de interests por NOME→{id,name} via
// Meta Graph /search?type=adinterest. Backstop para o P1 do prompt:
// LLM continua a gerar nomes; este helper substitui in-place por
// {id,name} reais. Remove interesses não-resolvidos (id não-numérico
// pós-tentativa) com warning — nunca deixa interesse inválido a chegar
// à Meta (erro #100 "must be a valid interest id").
//
// Defensivo: se accessToken é null OU /search falha, remove interesses
// não-resolvidos com warning e preserva o resto do targeting (geo, age,
// custom_audiences).
//
// Partilhado por crm-meta-campaign-strategy-generate e crm-meta-campaign-redesign.
// ALTERAR AQUI implica re-deploy das DUAS funções.

export interface ResolveCtx {
  accessToken: string | null;
  apiVersion: string;
  locale?: string;
}

interface MetaInterest { id: string; name: string }

const isNumericId = (v: any): boolean => typeof v === "string" && /^\d+$/.test(v);

function nameOf(item: any): string | null {
  if (typeof item === "string") return item.trim() || null;
  if (item && typeof item === "object") {
    const n = item.name ?? item.label ?? item.term;
    return typeof n === "string" && n.trim() ? n.trim() : null;
  }
  return null;
}

async function searchOne(name: string, ctx: ResolveCtx): Promise<MetaInterest | null> {
  if (!ctx.accessToken) return null;
  try {
    const u = new URL(`https://graph.facebook.com/${ctx.apiVersion}/search`);
    u.searchParams.set("type", "adinterest");
    u.searchParams.set("q", name);
    u.searchParams.set("limit", "5");
    u.searchParams.set("locale", ctx.locale ?? "pt_PT");
    u.searchParams.set("access_token", ctx.accessToken);
    const r = await fetch(u.toString());
    const j: any = await r.json();
    if (!r.ok || j?.error) {
      console.warn("[resolve-interests] /search non-ok", j?.error?.message ?? r.status);
      return null;
    }
    const data: any[] = Array.isArray(j?.data) ? j.data : [];
    if (data.length === 0) return null;
    const lower = name.toLowerCase();
    const exact = data.find((d: any) => typeof d?.name === "string" && d.name.toLowerCase() === lower && isNumericId(String(d?.id)));
    if (exact) return { id: String(exact.id), name: String(exact.name) };
    const ranked = data
      .filter((d: any) => isNumericId(String(d?.id)) && typeof d?.name === "string")
      .sort((a: any, b: any) => (Number(b?.audience_size_upper_bound ?? 0) - Number(a?.audience_size_upper_bound ?? 0)));
    if (ranked.length === 0) return null;
    return { id: String(ranked[0].id), name: String(ranked[0].name) };
  } catch (e) {
    console.warn("[resolve-interests] /search threw", String(e));
    return null;
  }
}

async function resolveArray(
  arr: any[],
  cache: Map<string, MetaInterest | null>,
  ctx: ResolveCtx,
  warnings: string[],
  ctxLabel: string,
): Promise<MetaInterest[]> {
  const out: MetaInterest[] = [];
  for (const item of arr) {
    if (item && typeof item === "object" && isNumericId(String(item.id ?? ""))) {
      out.push({ id: String(item.id), name: typeof item.name === "string" ? item.name : String(item.id) });
      continue;
    }
    const name = nameOf(item);
    if (!name) {
      warnings.push(`${ctxLabel}: interest descartado (sem nome utilizável: ${JSON.stringify(item)?.slice(0, 80)})`);
      continue;
    }
    const key = name.toLowerCase();
    let resolved = cache.get(key);
    if (resolved === undefined) {
      resolved = await searchOne(name, ctx);
      cache.set(key, resolved);
    }
    if (resolved) {
      out.push(resolved);
    } else {
      warnings.push(`${ctxLabel}: interest "${name}" não resolvido na Meta — removido`);
    }
  }
  return out;
}

export async function resolveInterestsInPlace(plan: any, ctx: ResolveCtx): Promise<string[]> {
  const warnings: string[] = [];
  if (!plan || typeof plan !== "object") return warnings;
  const cache = new Map<string, MetaInterest | null>();

  if (!ctx.accessToken) {
    warnings.push("interest resolution skipped: meta access token unavailable (a remover interests não-numéricos defensivamente)");
  }

  for (const c of plan.recommended_campaigns ?? []) {
    for (const a of c.adsets ?? []) {
      const t = a?.targeting_json;
      if (!t || typeof t !== "object") continue;
      const adsetCtx = `adset "${a?.adset_name ?? "?"}"`;

      if (Array.isArray(t.interests)) {
        const resolved = await resolveArray(t.interests, cache, ctx, warnings, `${adsetCtx} interests`);
        if (resolved.length > 0) t.interests = resolved;
        else delete t.interests;
      }

      if (Array.isArray(t.flexible_spec)) {
        for (const spec of t.flexible_spec) {
          if (spec && typeof spec === "object" && Array.isArray(spec.interests)) {
            const resolved = await resolveArray(spec.interests, cache, ctx, warnings, `${adsetCtx} flexible_spec[].interests`);
            if (resolved.length > 0) spec.interests = resolved;
            else delete spec.interests;
          }
        }
        t.flexible_spec = t.flexible_spec.filter((spec: any) => spec && typeof spec === "object" && Object.keys(spec).length > 0);
        if (t.flexible_spec.length === 0) delete t.flexible_spec;
      }
    }
  }

  return warnings;
}
