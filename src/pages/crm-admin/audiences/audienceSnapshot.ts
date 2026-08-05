import { supabase } from "@/integrations/supabase/client";
import { applyCriterion, type Criterion } from "./audienceCriterion";

export async function previewCount(criterion: Criterion, companyId: string): Promise<number> {
  let q = (supabase as any)
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId);
  q = applyCriterion(q, criterion);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export async function createSnapshot(
  audienceId: string,
  criterion: Criterion,
  companyId: string,
): Promise<{ snapshot_id: string; member_count: number }> {
  // 1. Fetch matching contact ids
  let q = (supabase as any)
    .from("contacts")
    .select("id, company_id")
    .eq("company_id", companyId)
    .limit(50000);
  q = applyCriterion(q, criterion);
  const { data: contacts, error: cErr } = await q;
  if (cErr) throw cErr;
  const list = (contacts ?? []) as { id: string; company_id: string }[];

  // 2. Insert snapshot
  const { data: snap, error: sErr } = await (supabase as any)
    .from("audience_snapshots")
    .insert({
      audience_id: audienceId,
      company_id: companyId,
      member_count: list.length,
    })
    .select("id")
    .single();
  if (sErr) throw sErr;
  const snapshotId = snap.id as string;

  // 3. Bulk insert members (chunks of 500)
  if (list.length > 0) {
    const rows = list.map((c) => ({
      snapshot_id: snapshotId,
      contact_id: c.id,
      company_id: companyId,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: mErr } = await (supabase as any)
        .from("audience_members")
        .insert(chunk);
      if (mErr) throw mErr;
    }
  }

  // 4. Update audience.last_preview_count / last_previewed_at
  await (supabase as any)
    .from("audiences")
    .update({
      last_preview_count: list.length,
      last_previewed_at: new Date().toISOString(),
    })
    .eq("id", audienceId);

  return { snapshot_id: snapshotId, member_count: list.length };
}

function csvEscape(v: string): string {
  if (v == null) return "";
  if (v.includes('"') || v.includes(",") || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export async function exportSnapshotCSV(
  snapshotId: string,
  audienceName: string,
): Promise<number> {
  const { data, error } = await (supabase as any)
    .from("audience_members")
    .select("contact:contacts(email, phone_e164, name)")
    .eq("snapshot_id", snapshotId);
  if (error) throw error;
  const rows = ((data ?? []) as any[]).map((r) => r.contact).filter(Boolean);

  const header = "email,phone,fn,ln";
  const lines = rows.map((c: any) => {
    const name = (c.name ?? "").trim();
    const parts = name ? name.split(/\s+/) : [];
    const fn = parts[0] ?? "";
    const ln = parts.slice(1).join(" ");
    return [
      csvEscape(c.email ?? ""),
      csvEscape(c.phone_e164 ?? ""),
      csvEscape(fn),
      csvEscape(ln),
    ].join(",");
  });
  const csv = [header, ...lines].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = audienceName.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40);
  a.download = `audience_${safe}_${snapshotId.slice(0, 8)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const { data: userData } = await supabase.auth.getUser();
  await (supabase as any)
    .from("audience_snapshots")
    .update({
      exported_at: new Date().toISOString(),
      exported_by: userData?.user?.id ?? null,
    })
    .eq("id", snapshotId);

  return rows.length;
}
