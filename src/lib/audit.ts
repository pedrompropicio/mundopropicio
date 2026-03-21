import { supabase } from "@/integrations/supabase/client";

interface AuditEntry {
  entity_type: string;
  entity_id: string;
  action: string;
  changed_by: string;
  old_data?: Record<string, any> | null;
  new_data?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
}

export async function logAudit(entry: AuditEntry) {
  try {
    await supabase.from("system_audit_log" as any).insert(entry as any);
  } catch (e) {
    console.error("Audit log failed:", e);
  }
}

export function getAuditUser(user: any): string {
  return user?.user_metadata?.full_name ?? user?.email ?? "sistema";
}
