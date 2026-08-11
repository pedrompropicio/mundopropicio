// Edge function: generate-accountant-zip
// Builds a ZIP with all transaction documents (attachments) for the requested
// company + period + filters. Caller must be accountant/admin/manager.
// Limits: 500 transactions OR 200MB output. Sync (no background).
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_TX = 500;
const MAX_BYTES = 200 * 1024 * 1024;

function slug(s: string | null | undefined): string {
  return (s ?? "sem-fornecedor")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "x";
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const company_id: string | undefined = body?.company_id;
    const from: string | undefined = body?.period?.from;
    const to: string | undefined = body?.period?.to;
    const filters = body?.filters ?? {};
    if (!company_id || !from || !to) {
      return new Response(JSON.stringify({ error: "company_id, period.from, period.to obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: role accountant/manager/admin + membership in the requested company
    const { data: roles } = await admin
      .from("user_roles")
      .select("role, company_id")
      .eq("user_id", caller.id);
    const allowed = (roles ?? []).some((r: any) =>
      ["platform_admin", "admin"].includes(r.role) ||
      (["manager", "accountant"].includes(r.role) && r.company_id === company_id)
    );
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Sem permissão para esta empresa" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Query transactions
    let q = admin
      .from("transactions")
      .select("id, type, description, amount, payment_date, invoice_ref, supplier_id, account_id, status, paid_amount, suppliers:supplier_id(name,nif)")
      .eq("company_id", company_id)
      .gte("payment_date", from)
      .lte("payment_date", to)
      .or("status.eq.paid,paid_amount.gt.0")
      .order("payment_date", { ascending: false })
      .limit(MAX_TX + 1);

    if (filters.type && filters.type !== "all") q = q.eq("type", filters.type);
    if (Array.isArray(filters.account_ids) && filters.account_ids.length) q = q.in("account_id", filters.account_ids);
    if (Array.isArray(filters.supplier_ids) && filters.supplier_ids.length) q = q.in("supplier_id", filters.supplier_ids);

    const { data: txs, error: txErr } = await q;
    if (txErr) throw txErr;
    if ((txs?.length ?? 0) > MAX_TX) {
      return new Response(JSON.stringify({ error: `Mais de ${MAX_TX} transações no período. Reduza o período.` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txIds = (txs ?? []).map((t: any) => t.id);

    type ZDoc = { id: string; name: string; bucket: string; path: string; label?: string };
    const resolveBucket = (fileUrl: string): { bucket: string; path: string } =>
      fileUrl?.startsWith("camarim://")
        ? { bucket: "camarim-documents", path: fileUrl.slice("camarim://".length) }
        : { bucket: "transaction-documents", path: fileUrl };

    const docsByTx = new Map<string, ZDoc[]>();
    const seenByTx = new Map<string, Set<string>>();
    const addDoc = (txId: string, d: ZDoc) => {
      if (!seenByTx.has(txId)) seenByTx.set(txId, new Set());
      const key = `${d.bucket}:${d.path}`;
      if (seenByTx.get(txId)!.has(key)) return;
      seenByTx.get(txId)!.add(key);
      if (!docsByTx.has(txId)) docsByTx.set(txId, []);
      docsByTx.get(txId)!.push(d);
    };

    if (txIds.length) {
      // 1) Anexos diretos (inclui refs camarim://)
      const { data: dd, error: dErr } = await admin
        .from("transaction_documents")
        .select("id, transaction_id, name, file_url")
        .in("transaction_id", txIds);
      if (dErr) throw dErr;
      for (const d of dd ?? []) {
        const { bucket, path } = resolveBucket(d.file_url);
        addDoc(d.transaction_id, { id: d.id, name: d.name, bucket, path });
      }

      // 2) Talões de camarim ligados às TXs
      const { data: camItems } = await admin
        .from("camarim_items")
        .select("id, transaction_id")
        .in("transaction_id", txIds);
      const camItemToTx = new Map<string, string>();
      for (const i of camItems ?? []) if (i.transaction_id) camItemToTx.set(i.id, i.transaction_id);
      if (camItemToTx.size) {
        const { data: camDocs } = await admin
          .from("camarim_item_documents")
          .select("id, item_id, file_name, file_path, company_id")
          .in("item_id", Array.from(camItemToTx.keys()));
        for (const d of camDocs ?? []) {
          const tx = camItemToTx.get(d.item_id);
          if (!tx) continue;
          const path = !d.company_id || String(d.file_path).startsWith(`${d.company_id}/`)
            ? d.file_path
            : `${d.company_id}/${d.file_path}`;
          addDoc(tx, { id: d.id, name: `camarim_${d.file_name}`, bucket: "camarim-documents", path, label: "camarim" });
        }
      }

      // 3) Notas de reembolso: comprovativos das TXs de origem, anexados à TX-mãe
      const { data: notes } = await admin
        .from("reimbursement_notes")
        .select("id, payment_transaction_id")
        .in("payment_transaction_id", txIds);
      const noteToPayTx = new Map<string, string>();
      for (const n of notes ?? []) if (n.payment_transaction_id) noteToPayTx.set(n.id, n.payment_transaction_id);
      if (noteToPayTx.size) {
        const { data: items } = await admin
          .from("reimbursement_note_items")
          .select("reimbursement_note_id, transaction_id")
          .in("reimbursement_note_id", Array.from(noteToPayTx.keys()));
        const childToPayTx = new Map<string, string>();
        for (const i of items ?? []) {
          const payTx = noteToPayTx.get(i.reimbursement_note_id);
          if (payTx && i.transaction_id) childToPayTx.set(i.transaction_id, payTx);
        }
        if (childToPayTx.size) {
          const { data: childDocs } = await admin
            .from("transaction_documents")
            .select("id, transaction_id, name, file_url")
            .in("transaction_id", Array.from(childToPayTx.keys()));
          for (const d of childDocs ?? []) {
            const payTx = childToPayTx.get(d.transaction_id);
            if (!payTx) continue;
            const { bucket, path } = resolveBucket(d.file_url);
            addDoc(payTx, { id: d.id, name: `reembolso_${d.name}`, bucket, path, label: "reembolso" });
          }
        }
      }
    }

    let txList = txs ?? [];
    if (filters.has_attachments === "with") {
      txList = txList.filter((t: any) => (docsByTx.get(t.id)?.length ?? 0) > 0);
    } else if (filters.has_attachments === "without") {
      txList = txList.filter((t: any) => (docsByTx.get(t.id)?.length ?? 0) === 0);
    }


    const zip = new JSZip();
    const csvRows: string[] = [
      ["transaction_id","payment_date","supplier_name","supplier_nif","amount","invoice_ref","document_name","document_size_bytes"].join(","),
    ];
    let totalBytes = 0;
    let docCount = 0;

    for (const t of txList) {
      const supName = t.suppliers?.name ?? "";
      const supNif = t.suppliers?.nif ?? "";
      const tdocs = docsByTx.get(t.id) ?? [];
      const folder = `${t.payment_date ?? "sem-data"}_${slug(supName)}_${slug(t.invoice_ref ?? "no-ref")}`;
      if (tdocs.length === 0) {
        csvRows.push([t.id, t.payment_date ?? "", supName, supNif, t.amount, t.invoice_ref ?? "", "", ""].map(csvEscape).join(","));
        continue;
      }
      for (const d of tdocs) {
        const { data: blob, error: dlErr } = await admin.storage
          .from(d.bucket)
          .download(d.path);
        if (dlErr || !blob) {
          csvRows.push([t.id, t.payment_date ?? "", supName, supNif, t.amount, t.invoice_ref ?? "", d.name ?? d.path, "ERROR"].map(csvEscape).join(","));
          continue;
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        totalBytes += bytes.byteLength;
        if (totalBytes > MAX_BYTES) {
          return new Response(JSON.stringify({ error: "ZIP excederia 200MB. Reduza o período." }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const fname = d.name ?? d.path.split("/").pop() ?? `${d.id}.bin`;
        zip.file(`${folder}/${fname}`, bytes);
        docCount++;
        csvRows.push([t.id, t.payment_date ?? "", supName, supNif, t.amount, t.invoice_ref ?? "", fname, bytes.byteLength].map(csvEscape).join(","));
      }

    }

    zip.file("index.csv", csvRows.join("\n"));

    const zipBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const objectPath = `${company_id}/${caller.id}/${ts}_${from}_to_${to}.zip`;
    const { error: upErr } = await admin.storage
      .from("accountant-exports")
      .upload(objectPath, zipBytes, { contentType: "application/zip", upsert: true });
    if (upErr) throw upErr;

    const { data: signed, error: signErr } = await admin.storage
      .from("accountant-exports")
      .createSignedUrl(objectPath, 60 * 30);
    if (signErr || !signed) throw signErr ?? new Error("signed url failed");

    // Audit log via SECURITY DEFINER RPC, executed as the caller
    await callerClient.rpc("record_document_download", {
      p_resource_type: "zip_export",
      p_bucket: "accountant-exports",
      p_file_path: objectPath,
      p_file_name: objectPath.split("/").pop(),
      p_period_from: from,
      p_period_to: to,
      p_extra: { transaction_count: txList.length, document_count: docCount, size_bytes: zipBytes.byteLength, filters } as any,
    } as any);

    return new Response(JSON.stringify({
      url: signed.signedUrl,
      expires_in_seconds: 60 * 30,
      transaction_count: txList.length,
      document_count: docCount,
      total_size_mb: +(zipBytes.byteLength / 1024 / 1024).toFixed(2),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[generate-accountant-zip]", e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
