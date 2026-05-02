/**
 * Multi-tenant Storage helpers.
 *
 * Buckets isolated by company (RLS enforces `(storage.foldername(name))[1] = current_company_id()`)
 * MUST receive paths prefixed with `${companyId}/`. Buckets in `GLOBAL_BUCKETS`
 * keep their natural paths (no prefix).
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentCompanyId } from "@/hooks/useCompany";

export const ISOLATED_BUCKETS = new Set<string>([
  "bp-version-snapshots",
  "cache-extra-documents",
  "camarim-documents",
  "closing-cost-documents",
  "implementation-files",
  "import-reports",
  "partner-extra-documents",
  "supplier-credit-documents",
  "supplier-documents",
  "ticket-office-settlements",
  "transaction-documents",
]);

export const GLOBAL_BUCKETS = new Set<string>([
  "company-branding",
  "database-backups",
]);

export type Bucket =
  | "bp-version-snapshots"
  | "cache-extra-documents"
  | "camarim-documents"
  | "closing-cost-documents"
  | "implementation-files"
  | "import-reports"
  | "partner-extra-documents"
  | "supplier-credit-documents"
  | "supplier-documents"
  | "ticket-office-settlements"
  | "transaction-documents"
  | "company-branding"
  | "database-backups";

const UUID_PREFIX_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\//i;

let cachedCompanyId: string | null = null;

async function resolveCompanyId(): Promise<string> {
  if (cachedCompanyId) return cachedCompanyId;
  const id = await getCurrentCompanyId();
  if (!id) {
    throw new Error(
      "Sem empresa ativa — não é possível guardar ficheiros antes de a empresa estar resolvida.",
    );
  }
  cachedCompanyId = id;
  return id;
}

export function clearCompanyCache() {
  cachedCompanyId = null;
}

/**
 * Returns a path that respects the company isolation rule. For isolated
 * buckets, prefixes with `${companyId}/` (idempotent — won't double-prefix
 * if the path already starts with the current company id).
 */
export async function withCompanyPath(bucket: Bucket, path: string): Promise<string> {
  if (!ISOLATED_BUCKETS.has(bucket)) return path;
  const companyId = await resolveCompanyId();
  // strip leading slash if any
  const clean = path.replace(/^\/+/, "");
  if (clean.startsWith(`${companyId}/`)) return clean;
  // If a stored legacy record already contains a tenant UUID prefix, preserve it.
  // Re-prefixing it with the currently active company creates duplicated paths and 404s.
  if (UUID_PREFIX_RE.test(clean)) return clean;
  return `${companyId}/${clean}`;
}

interface UploadOptions {
  contentType?: string;
  upsert?: boolean;
  cacheControl?: string;
}

export async function uploadToCompanyBucket(
  bucket: Bucket,
  path: string,
  file: File | Blob | ArrayBuffer | Uint8Array,
  options: UploadOptions = {},
) {
  const fullPath = await withCompanyPath(bucket, path);
  const { data, error } = await supabase.storage.from(bucket).upload(fullPath, file as any, options);
  return { data: data ? { ...data, path: fullPath } : null, error, path: fullPath };
}

export async function downloadFromCompanyBucket(bucket: Bucket, path: string) {
  const fullPath = await withCompanyPath(bucket, path);
  return supabase.storage.from(bucket).download(fullPath);
}

export async function removeFromCompanyBucket(bucket: Bucket, paths: string[]) {
  const full = await Promise.all(paths.map((p) => withCompanyPath(bucket, p)));
  return supabase.storage.from(bucket).remove(full);
}

export async function signedCompanyUrl(bucket: Bucket, path: string, expiresIn = 3600) {
  const fullPath = await withCompanyPath(bucket, path);
  return supabase.storage.from(bucket).createSignedUrl(fullPath, expiresIn);
}
