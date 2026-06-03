// Normalização determinística pós-LLM (backstop para P2 e P3 do prompt):
// — Converte `targeting.exclusions` array em objeto Meta-válido se possível
//   (mapear `custom_audience_id`/`audience_id`/`id` para `{custom_audiences:[{id}]}`).
// — Remove ids de custom audiences (em `custom_audiences` e em
//   `exclusions.custom_audiences`) que não sejam estritamente numéricos
//   (descarta placeholders simbólicos que o LLM inventa sem ter id real).
// Idempotente e defensiva: não rebenta em campos em falta. Devolve a lista
// de warnings (para console.warn + persistir em plan._normalization_warnings).
//
// Partilhada por crm-meta-campaign-strategy-generate e crm-meta-campaign-redesign.
// ALTERAR AQUI implica re-deploy das DUAS funções.
export function normalizePlanInPlace(plan: any): string[] {
  const warnings: string[] = [];
  if (!plan || typeof plan !== "object") return warnings;
  const isNumericId = (v: any) => typeof v === "string" && /^\d+$/.test(v);
  const sanitizeCAs = (arr: any[], ctx: string): any[] => {
    const out: any[] = [];
    for (const item of arr ?? []) {
      if (isNumericId(item?.id)) {
        out.push(item);
      } else {
        warnings.push(`${ctx}: custom audience descartado (id inválido/placeholder: ${JSON.stringify(item)?.slice(0, 120)})`);
      }
    }
    return out;
  };
  for (const c of plan.recommended_campaigns ?? []) {
    for (const a of c.adsets ?? []) {
      const t = a?.targeting_json;
      if (!t || typeof t !== "object") continue;
      const adsetCtx = `adset "${a?.adset_name ?? "?"}"`;
      // P3 — exclusions ARRAY → OBJETO (tentativa de recuperação)
      if (Array.isArray(t.exclusions)) {
        const cas: any[] = [];
        for (const item of t.exclusions) {
          const id = item?.id ?? item?.custom_audience_id ?? item?.audience_id;
          if (id !== undefined) cas.push({ id });
        }
        const sanitized = sanitizeCAs(cas, `${adsetCtx} exclusions[]→{}`);
        warnings.push(`${adsetCtx}: exclusions array normalizado para objeto (${sanitized.length}/${t.exclusions.length} ids válidos)`);
        if (sanitized.length > 0) {
          t.exclusions = { custom_audiences: sanitized };
        } else {
          delete t.exclusions;
        }
      }
      // P2 — validar exclusions.custom_audiences (após eventual normalização)
      if (t.exclusions && typeof t.exclusions === "object" && !Array.isArray(t.exclusions) && Array.isArray(t.exclusions.custom_audiences)) {
        t.exclusions.custom_audiences = sanitizeCAs(t.exclusions.custom_audiences, `${adsetCtx} exclusions.custom_audiences`);
        if (!t.exclusions.custom_audiences.length) delete t.exclusions.custom_audiences;
        if (t.exclusions && Object.keys(t.exclusions).length === 0) delete t.exclusions;
      }
      // P2 — validar custom_audiences (positivos)
      if (Array.isArray(t.custom_audiences)) {
        t.custom_audiences = sanitizeCAs(t.custom_audiences, `${adsetCtx} custom_audiences`);
        if (!t.custom_audiences.length) delete t.custom_audiences;
      }

      // Dedup (bug 1487916 "Duplicate Targeting Fields"):
      // 1) Dedup ids repetidos DENTRO de custom_audiences (mesmo id 2x → 1x).
      if (Array.isArray(t.custom_audiences)) {
        const seen = new Set<string>();
        const deduped: any[] = [];
        for (const item of t.custom_audiences) {
          const id = String(item?.id ?? "");
          if (seen.has(id)) {
            warnings.push(`${adsetCtx} custom_audiences: id ${id} repetido — mantido só uma vez`);
            continue;
          }
          seen.add(id);
          deduped.push(item);
        }
        t.custom_audiences = deduped;
      }

      // 2) Dedup ids repetidos DENTRO de exclusions.custom_audiences.
      if (t.exclusions && Array.isArray(t.exclusions.custom_audiences)) {
        const seen = new Set<string>();
        const deduped: any[] = [];
        for (const item of t.exclusions.custom_audiences) {
          const id = String(item?.id ?? "");
          if (seen.has(id)) {
            warnings.push(`${adsetCtx} exclusions.custom_audiences: id ${id} repetido — mantido só uma vez`);
            continue;
          }
          seen.add(id);
          deduped.push(item);
        }
        t.exclusions.custom_audiences = deduped;
      }

      // 3) Remove de exclusions.custom_audiences qualquer id que também esteja
      //    em custom_audiences (include) — Meta rejeita include+exclude do mesmo id.
      if (Array.isArray(t.custom_audiences) && t.exclusions && Array.isArray(t.exclusions.custom_audiences)) {
        const includeIds = new Set(t.custom_audiences.map((i: any) => String(i?.id ?? "")));
        t.exclusions.custom_audiences = t.exclusions.custom_audiences.filter((item: any) => {
          const id = String(item?.id ?? "");
          if (includeIds.has(id)) {
            warnings.push(`${adsetCtx}: audience ${id} em include+exclude — removido do exclude`);
            return false;
          }
          return true;
        });
        if (!t.exclusions.custom_audiences.length) delete t.exclusions.custom_audiences;
        if (t.exclusions && Object.keys(t.exclusions).length === 0) delete t.exclusions;
      }

      // 4) Limpar flexible_spec vazio ([{}] ou []).
      if (Array.isArray(t.flexible_spec)) {
        t.flexible_spec = t.flexible_spec.filter((spec: any) => spec && typeof spec === "object" && Object.keys(spec).length > 0);
        if (t.flexible_spec.length === 0) delete t.flexible_spec;
      }
    }
  }
  return warnings;
}
