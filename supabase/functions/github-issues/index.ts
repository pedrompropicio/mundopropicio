// github-issues
// Wrapper seguro para a GitHub Issues API do repo pedrompropicio/mundopropicio.
// Token via secret GITHUB_TOKEN (fine-grained PAT, Issues read/write + Metadata read).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OWNER = "pedrompropicio";
const REPO = "mundopropicio";
const GH_BASE = "https://api.github.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function gh(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: any }> {
  const r = await fetch(`${GH_BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "mp-audience-issues",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { ok: r.ok, status: r.status, body: parsed };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = Deno.env.get("GITHUB_TOKEN");
  if (!token) return json({ error: "missing GITHUB_TOKEN" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const action = body?.action;
  if (!action) return json({ error: "missing action" }, 400);

  try {
    if (action === "list") {
      const res = await gh(
        token,
        `/repos/${OWNER}/${REPO}/issues?state=open&per_page=100&sort=created&direction=asc`,
        { method: "GET" },
      );
      if (!res.ok) {
        return json({ error: "github_api_error", github_status: res.status, github_body: res.body }, 502);
      }
      const items = Array.isArray(res.body) ? res.body : [];
      const issues = items
        .filter((it: any) => !it?.pull_request)
        .map((it: any) => ({
          number: it.number,
          title: it.title,
          labels: Array.isArray(it.labels)
            ? it.labels.map((l: any) => ({ name: typeof l === "string" ? l : l?.name }))
            : [],
          state: it.state,
          created_at: it.created_at,
          updated_at: it.updated_at,
          body: it.body,
        }));
      return json({ issues });
    }

    if (action === "create") {
      const { title, body: issueBody, labels } = body;
      if (!title || typeof title !== "string") return json({ error: "missing title" }, 400);
      const payload: Record<string, unknown> = { title };
      if (typeof issueBody === "string") payload.body = issueBody;
      if (Array.isArray(labels)) payload.labels = labels;
      const res = await gh(token, `/repos/${OWNER}/${REPO}/issues`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return json({ error: "github_api_error", github_status: res.status, github_body: res.body }, 502);
      }
      return json({ number: res.body.number, html_url: res.body.html_url, title: res.body.title });
    }

    if (action === "comment") {
      const { number, body: commentBody } = body;
      if (!Number.isInteger(number)) return json({ error: "missing number" }, 400);
      if (!commentBody || typeof commentBody !== "string") return json({ error: "missing body" }, 400);
      const res = await gh(token, `/repos/${OWNER}/${REPO}/issues/${number}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: commentBody }),
      });
      if (!res.ok) {
        return json({ error: "github_api_error", github_status: res.status, github_body: res.body }, 502);
      }
      return json({ id: res.body.id, html_url: res.body.html_url });
    }

    if (action === "close") {
      const { number } = body;
      if (!Number.isInteger(number)) return json({ error: "missing number" }, 400);
      const res = await gh(token, `/repos/${OWNER}/${REPO}/issues/${number}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "closed" }),
      });
      if (!res.ok) {
        return json({ error: "github_api_error", github_status: res.status, github_body: res.body }, 502);
      }
      return json({ number: res.body.number, state: res.body.state });
    }

    if (action === "update") {
      // PATCH /repos/{owner}/{repo}/issues/{number}
      // NOTA IMPORTANTE: no GitHub REST API, enviar "labels" num PATCH SUBSTITUI
      // o conjunto completo de labels da issue (não é aditivo). Quem chamar
      // tem de enviar a lista final desejada. Labels inexistentes no repo são
      // criados automaticamente pelo GitHub com cor default.
      const { number, title, body: issueBody, labels, state } = body;
      if (!Number.isInteger(number)) return json({ error: "missing number" }, 400);

      const payload: Record<string, unknown> = {};
      if (typeof title === "string") payload.title = title;
      if (typeof issueBody === "string") payload.body = issueBody;
      if (Array.isArray(labels)) payload.labels = labels;
      if (state === "open" || state === "closed") payload.state = state;

      if (Object.keys(payload).length === 0) {
        return json({ error: "no editable field provided (expected one of: title, body, labels, state)" }, 400);
      }

      const res = await gh(token, `/repos/${OWNER}/${REPO}/issues/${number}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return json({ error: "github_api_error", github_status: res.status, github_body: res.body }, 502);
      }
      return json({
        number: res.body.number,
        html_url: res.body.html_url,
        state: res.body.state,
        labels: Array.isArray(res.body.labels)
          ? res.body.labels.map((l: any) => ({ name: typeof l === "string" ? l : l?.name }))
          : [],
      });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: "internal_error", detail: String(e) }, 500);
  }
});
