// Invariante edge_fn_sem_guarda_empresa (#283 parte 5, D-ERP204).
// Conta as edge functions que usam a service role key E aceitam ids vindos do
// cliente SEM verificação de identidade (getUser/getClaims/service role verificada/
// segredo de cron) OU SEM guarda de empresa reconhecida.
// Heurística estática (como os outros dois invariantes): falsos positivos vão para
// a lista POR_DESENHO com o motivo; o teste trava se a contagem subir.
import fs from "node:fs";
import path from "node:path";

export const FN_DIR = "supabase/functions";

const USES_SRK = /SUPABASE_SERVICE_ROLE_KEY/;
const CLIENT_IDS = /(req\.json\(\)|req\.text\(\)|searchParams|formData\(\))/;
const ID_FIELD = /\b[a-z_]*(_id|Id|_ids|Ids)\b/;
// Identidade: sessão de utilizador verificada, service role (chave/verificada no Auth ou
// claim com verify_jwt=true), segredo partilhado, ou helper partilhado que faz isto.
const USER_PATH = /(auth\.getUser\(|auth\.getClaims\(|authenticateAndResolveCompany\(|assertCallerRole(OnRow|InCompany)\(|authorize[A-Za-z]*\(|ensureDraft\()/;
const MACHINE_PATH = /(isServiceRoleRequest\(|role\s*[!=]==\s*["']service_role["']|["']service_role["']\s*[!=]==|SERVICE_ROLE_KEY"\)\s*\?\?\s*"\\u0000"\)|-secret["']|_SECRET["']\)|_TOKEN["']\)|LOVABLE_API_KEY|timingSafeEqual\(|!== `Bearer \$\{SERVICE_ROLE\}`|x-hub-signature|stripe-signature)/i;
const COMPANY_GUARD = /(assertCallerRole(OnRow|InCompany)\(|authenticateAndResolveCompany\(|canAccessCompany\(|assertResourceCompan|userBelongsToCompany\(|current_company_id|row_belongs_to_current_company|activeCompanyId|active_company_id|\.eq\("company_id"|company_id !==|company_id ===|is_platform_admin|isServiceRoleRequest\(|authorize\()/;

const RLS_SESSION = /global:\s*\{\s*headers:\s*\{\s*Authorization/;

/** Funções que o heurístico marca mas estão certas por desenho — sempre com motivo. */
export const POR_DESENHO = {
  // públicas por desenho (token de uso único / sinal do portal / fluxo de auth)
  "accept-invitation": "público: valida o token do convite e força a empresa do convite",
  "accept-staff-invite": "público: valida o token do convite de staff",
  "onboarding-preview": "público: lê só pelo first_access_token (uuid) e devolve email mascarado",
  "request-password-reset": "público: fluxo de reposição de palavra-passe",
  "handle-email-unsubscribe": "público: token de cancelamento de subscrição",
  "send-transactional-email": "infra de email gerida; company_id preenchido por trigger",
  "crm-google-click-ingest": "sinal do portal, empresa fixa, sem auth (D-ERP203)",
  // guarda de empresa feita de forma que o heurístico não reconhece (lida à mão)
  "artist-youtube-sync": "filtra as ligações pelas empresas onde o chamador tem papel (allowed(c.company_id))",
  "audit-invoice-groups": "recusa se alguma transação do âmbito for de empresa onde o chamador não tem papel",
  "s4a-audience-sync": "authorizeArtistAdmin (_shared/s4a.ts) verifica o papel na empresa do artista; modo todos só service role",
  "s4a-daily-sync": "authorizeArtistAdmin (_shared/s4a.ts) + filtro por empresas onde é admin",
  "s4a-token-seed": "código de uso único ou authorizeArtistAdmin na empresa do artista",
};

function readFn(dir) {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.ts$/.test(e.name) && !/test/.test(e.name)) files.push(p);
    }
  };
  walk(dir);
  return files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
}

export function scanEdgeFunctions(root = process.cwd()) {
  const base = path.join(root, FN_DIR);
  const out = [];
  for (const e of fs.readdirSync(base, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith("_") || e.name === "tests") continue;
    if (!fs.existsSync(path.join(base, e.name, "index.ts"))) continue;
    const src = readFn(path.join(base, e.name));
    if (!USES_SRK.test(src) || !CLIENT_IDS.test(src) || !ID_FIELD.test(src)) continue;
    const motivos = [];
    const rls = RLS_SESSION.test(src);
    const user = USER_PATH.test(src) || rls;
    if (!user && !MACHINE_PATH.test(src)) motivos.push("sem_identidade");
    // Só faz sentido exigir guarda de empresa quando há caminho de utilizador:
    // um pedido só-máquina (service role / segredo) é interno e confiável.
    if (user && !rls && !COMPANY_GUARD.test(src)) motivos.push("sem_guarda_empresa");
    if (motivos.length) out.push({ fn: e.name, motivos, porDesenho: POR_DESENHO[e.name] ?? null });
  }
  return out.sort((a, b) => a.fn.localeCompare(b.fn));
}
