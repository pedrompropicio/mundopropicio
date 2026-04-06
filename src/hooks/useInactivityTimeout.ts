import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "mousemove", "click"] as const;
const THROTTLE_MS = 10_000; // reset timer at most once per 10 seconds

export function useInactivityTimeout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(0); // start at 0 so the first event always resets

  const handleLogout = useCallback(async () => {
    // Double-check: if user was recently active, don't log out (race-condition guard)
    if (Date.now() - lastActivityRef.current < INACTIVITY_TIMEOUT_MS) {
      // Reschedule instead of logging out
      const remaining = INACTIVITY_TIMEOUT_MS - (Date.now() - lastActivityRef.current);
      timerRef.current = setTimeout(handleLogout, remaining);
      return;
    }
    toast({
      title: "Sessão expirada",
      description: "A sua sessão foi encerrada por inatividade.",
      variant: "destructive",
    });
    await supabase.auth.signOut();
  }, []);

  const resetTimer = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityRef.current < THROTTLE_MS) return;
    lastActivityRef.current = now;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(handleLogout, INACTIVITY_TIMEOUT_MS);
  }, [handleLogout]);

  useEffect(() => {
    // Start the timer and record initial activity
    lastActivityRef.current = Date.now();
    timerRef.current = setTimeout(handleLogout, INACTIVITY_TIMEOUT_MS);

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    // Also reset on tab visibility change (returning to tab = activity)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        resetTimer();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [resetTimer, handleLogout]);
}
