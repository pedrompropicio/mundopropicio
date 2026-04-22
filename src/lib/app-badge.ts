import { supabase } from "@/integrations/supabase/client";

/**
 * App icon badge management.
 *
 * The badge reflects ONLY the number of payment lists currently awaiting
 * approval (status = 'pending_approval'). When that number reaches zero, the
 * badge is cleared so the iOS/Android home-screen icon stops showing a count.
 *
 * Only roles that can approve (admin / manager) should see the badge.
 */

function supportsBadge(): boolean {
  return typeof navigator !== "undefined" && "setAppBadge" in navigator;
}

export async function setBadge(count: number): Promise<void> {
  if (!supportsBadge()) return;
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count <= 0) {
      await nav.clearAppBadge?.();
    } else {
      await nav.setAppBadge?.(count);
    }
  } catch {
    /* silent — badge is best-effort */
  }
}

export async function clearBadge(): Promise<void> {
  await setBadge(0);
}

/**
 * Recalculates the badge from the database (count of payment_lists with
 * status = 'pending_approval'). Always uses the DB as source of truth so it
 * stays in sync across multiple devices/sessions.
 *
 * Returns the count that was applied (or 0 if not supported / no permission).
 */
export async function refreshBadgeFromDB(): Promise<number> {
  if (!supportsBadge()) return 0;
  try {
    const { count, error } = await supabase
      .from("payment_lists")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_approval");

    if (error) {
      // RLS denies for non-admin/manager — clear badge silently.
      await clearBadge();
      return 0;
    }

    const n = count ?? 0;
    await setBadge(n);
    return n;
  } catch {
    await clearBadge();
    return 0;
  }
}

/**
 * Returns the current count of pending payment lists without touching the
 * badge. Useful for embedding in push payloads sent to other devices.
 */
export async function getPendingPaymentListsCount(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("payment_lists")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_approval");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
