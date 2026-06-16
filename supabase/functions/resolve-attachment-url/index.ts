import { createClient } from "npm:@supabase/supabase-js@2";

// v5 — força redeploy em Live (2ª tentativa): prioriza candidato {company}/{path} e valida com download() antes de devolver.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Content-Disposition, Content-Type, X-Resolved-Attachment-Path",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_PREFIX_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

type AttachmentKind = "transaction_document" | "camarim_item_document" | "event_forecast_attachment";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function storagePathFromTransactionUrl(fileUrl: string) {
  if (fileUrl.startsWith("camarim://")) {
    return { bucket: "camarim-documents", path: fileUrl.replace(/^camarim:\/\//, "") };
  }

  const publicMarker = "/storage/v1/object/public/transaction-documents/";
  const publicIdx = fileUrl.indexOf(publicMarker);
  if (publicIdx !== -1) {
    return {
      bucket: "transaction-documents",
      path: fileUrl.substring(publicIdx + publicMarker.length).split("?")[0],
    };
  }

  const signedMarker = "/storage/v1/object/sign/transaction-documents/";
  const signedIdx = fileUrl.indexOf(signedMarker);
  if (signedIdx !== -1) {
    return {
      bucket: "transaction-documents",
      path: fileUrl.substring(signedIdx + signedMarker.length).split("?")[0],
    };
  }

  return { bucket: "transaction-documents", path: fileUrl.replace(/^\/+/, "") };
}

function addCandidate(candidates: string[], seen: Set<string>, path?: string | null) {
  const clean = (path ?? "").replace(/^\/+/, "");
  if (!clean || seen.has(clean)) return;
  seen.add(clean);
  candidates.push(clean);
}

function buildCandidates(rawPath: string, companyId?: string | null) {
  const clean = rawPath.replace(/^\/+/, "");
  const candidates: string[] = [];
  const seen = new Set<string>();

  if (companyId && !clean.startsWith(`${companyId}/`)) addCandidate(candidates, seen, `${companyId}/${clean}`);
  addCandidate(candidates, seen, clean);

  if (UUID_PREFIX_RE.test(clean)) {
    const stripped = clean.replace(UUID_PREFIX_RE, "");
    if (companyId) addCandidate(candidates, seen, `${companyId}/${stripped}`);
    addCandidate(candidates, seen, stripped);
  }

  return candidates;
}

async function getCallerContext(adminClient: any, callerId: string) {
  const [{ data: profile }, { data: isPlatformAdmin }, { data: roles }] = await Promise.all([
    adminClient.from("profiles").select("company_id, active_company_id").eq("id", callerId).maybeSingle(),
    adminClient.rpc("is_platform_admin", { _user_id: callerId }),
    adminClient.from("user_roles").select("role").eq("user_id", callerId),
  ]);

  const roleList = (roles ?? []).map((row: any) => row.role as string);
  const activeCompanyId = isPlatformAdmin
    ? (profile?.active_company_id ?? profile?.company_id ?? null)
    : (profile?.company_id ?? null);

  return { activeCompanyId, isPlatformAdmin: Boolean(isPlatformAdmin), roles: roleList };
}

function canAccessCompany(ctx: { activeCompanyId: string | null; isPlatformAdmin: boolean }, companyId?: string | null) {
  if (!companyId) return false;
  return ctx.isPlatformAdmin || ctx.activeCompanyId === companyId;
}

async function resolveTransactionDocument(adminClient: any, documentId: string, callerCtx: any) {
  const { data: doc, error } = await adminClient
    .from("transaction_documents")
    .select("id,name,file_url,company_id,transaction_id")
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw error;
  if (!doc) return { error: "Documento não encontrado", status: 404 };
  if (!doc.file_url) return { error: "Documento sem caminho de ficheiro", status: 404 };

  if (/^ref:\/\/https?:\/\//i.test(doc.file_url)) {
    return { signedUrl: doc.file_url.replace(/^ref:\/\//i, ""), bucket: null, path: null };
  }
  if (doc.file_url.startsWith("ref://")) return { error: "Referência pendente sem ficheiro anexado", status: 404 };
  if (/^https?:\/\//i.test(doc.file_url) && !doc.file_url.includes("/storage/v1/object/")) {
    return { signedUrl: doc.file_url, bucket: null, path: null };
  }

  let txCompanyId: string | null = null;
  if (doc.transaction_id) {
    const { data: tx } = await adminClient
      .from("transactions")
      .select("company_id")
      .eq("id", doc.transaction_id)
      .maybeSingle();
    txCompanyId = tx?.company_id ?? null;
  }
  const ownerCompanyId = doc.company_id ?? txCompanyId ?? null;
  if (!canAccessCompany(callerCtx, ownerCompanyId)) return { error: "Sem permissão para abrir este documento", status: 403 };

  const { bucket, path } = storagePathFromTransactionUrl(doc.file_url);
  return { bucket, candidates: buildCandidates(path, ownerCompanyId), filename: doc.name ?? path.split("/").pop() };
}

async function resolveCamarimItemDocument(adminClient: any, documentId: string, callerCtx: any) {
  const { data: doc, error } = await adminClient
    .from("camarim_item_documents")
    .select("id,file_path,file_name,mime_type,company_id,item_id")
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw error;
  if (!doc) return { error: "Documento não encontrado", status: 404 };
  if (!doc.file_path) return { error: "Documento sem caminho de ficheiro", status: 404 };

  let nestedCompanyId: string | null = null;
  if (doc.item_id) {
    const { data: item } = await adminClient
      .from("camarim_items")
      .select("session_id")
      .eq("id", doc.item_id)
      .maybeSingle();
    if (item?.session_id) {
      const { data: session } = await adminClient
        .from("camarim_sessions")
        .select("company_id")
        .eq("id", item.session_id)
        .maybeSingle();
      nestedCompanyId = session?.company_id ?? null;
    }
  }
  const ownerCompanyId = doc.company_id ?? nestedCompanyId;
  if (!canAccessCompany(callerCtx, ownerCompanyId)) return { error: "Sem permissão para abrir este documento", status: 403 };

  return {
    bucket: "camarim-documents",
    candidates: buildCandidates(doc.file_path, ownerCompanyId),
    filename: doc.file_name ?? doc.file_path.split("/").pop(),
    contentType: doc.mime_type ?? undefined,
  };
}

async function resolveForecastAttachment(adminClient: any, documentId: string, callerCtx: any) {
  const { data: doc, error } = await adminClient
    .from("event_forecast_attachments")
    .select("id,file_name,storage_path,mime_type,company_id,forecast_id")
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw error;
  if (!doc) return { error: "Documento não encontrado", status: 404 };
  if (!doc.storage_path) return { error: "Documento sem caminho de ficheiro", status: 404 };

  let ownerCompanyId: string | null = doc.company_id ?? null;
  if (!ownerCompanyId && doc.forecast_id) {
    const { data: fc } = await adminClient
      .from("event_forecasts")
      .select("company_id")
      .eq("id", doc.forecast_id)
      .maybeSingle();
    ownerCompanyId = fc?.company_id ?? null;
  }
  if (!canAccessCompany(callerCtx, ownerCompanyId)) return { error: "Sem permissão para abrir este documento", status: 403 };

  return {
    bucket: "event-forecast-attachments",
    candidates: buildCandidates(doc.storage_path, ownerCompanyId),
    filename: doc.file_name ?? doc.storage_path.split("/").pop(),
    contentType: doc.mime_type ?? undefined,
  };
}

function contentDisposition(filename?: string | null) {
  const clean = (filename ?? "anexo").replace(/[\r\n"\\]/g, "_");
  // ASCII-only fallback para a parte filename="..." (HTTP header values são ByteString = latin-1)
  const ascii = clean.replace(/[^\x20-\x7E]/g, "_") || "anexo";
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

function asciiHeader(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "_");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) return json({ error: "Não autorizado" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const callerCtx = await getCallerContext(adminClient, caller.id);

    const body = await req.json().catch(() => ({}));
    const kind = body.kind as AttachmentKind;
    const documentId = body.documentId as string | undefined;
    const mode = body.mode === "download" ? "download" : "signed-url";
    if (!documentId || !["transaction_document", "camarim_item_document"].includes(kind)) {
      return json({ error: "Pedido inválido" }, 400);
    }

    const resolved = kind === "transaction_document"
      ? await resolveTransactionDocument(adminClient, documentId, callerCtx)
      : await resolveCamarimItemDocument(adminClient, documentId, callerCtx);

    if (resolved.signedUrl) return json({ signedUrl: resolved.signedUrl });
    if (resolved.error) return json({ error: resolved.error }, resolved.status ?? 400);

    console.log("[resolve-attachment-url] bucket:", resolved.bucket, "candidates:", resolved.candidates);
    for (const candidate of resolved.candidates ?? []) {
      const downloaded = await adminClient.storage.from(resolved.bucket).download(candidate);
      if (downloaded.error || !downloaded.data) {
        console.log("[resolve-attachment-url] miss:", candidate, "err:", downloaded.error?.message);
        continue;
      }
      console.log("[resolve-attachment-url] hit:", candidate);

      if (mode === "download") {
        const contentType = resolved.contentType ?? downloaded.data.type ?? "application/octet-stream";
        return new Response(downloaded.data, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": contentType,
            "Content-Disposition": contentDisposition(resolved.filename),
            "X-Resolved-Attachment-Path": asciiHeader(candidate),
          },
        });
      }

      const { data, error } = await adminClient.storage.from(resolved.bucket).createSignedUrl(candidate, 60 * 60);
      if (!error && data?.signedUrl) return json({ signedUrl: data.signedUrl, bucket: resolved.bucket, path: candidate });
    }

    return json({ error: "Ficheiro não encontrado no Storage" }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
