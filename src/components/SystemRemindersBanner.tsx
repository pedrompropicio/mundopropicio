import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { Bell, ArrowRight } from "lucide-react";

interface ActiveReminder {
  id: string;
  key: string;
  title: string;
  message: string;
  due_date: string;
  link_url: string | null;
  company_id: string | null;
}

export default function SystemRemindersBanner() {
  const { role } = useAuth();
  const { companyId, isPlatformAdmin } = useCompany();
  const isAdmin = role === "admin" || role === ("platform_admin" as any);

  const { data } = useQuery({
    queryKey: ["system-reminders-active", companyId, role],
    enabled: isAdmin && (isPlatformAdmin || !!companyId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      let query = supabase
        .from("system_reminders" as any)
        .select("id,key,title,message,due_date,link_url,company_id")
        .eq("is_active", true)
        .is("completed_at", null)
        .lte("due_date", today);
      if (!isPlatformAdmin) query = query.eq("company_id", companyId);
      const { data, error } = await query.order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ActiveReminder[];
    },
  });

  // Recheck the active scope at render time, including cached responses.
  const reminders = (data ?? []).filter(r => isPlatformAdmin || (!!companyId && r.company_id === companyId));
  if (!isAdmin || reminders.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {reminders.map((r) => (
        <div
          key={r.id}
          className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 flex items-start gap-3"
        >
          <Bell className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-amber-700 dark:text-amber-300">
              {r.title}
            </div>
            <div className="text-sm text-foreground/80 mt-1 whitespace-pre-line">
              {r.message}
            </div>
          </div>
          <Link
            to="/admin/lembretes"
            className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-300 hover:underline"
          >
            Gerir <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ))}
    </div>
  );
}
