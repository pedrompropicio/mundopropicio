import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "mousemove", "click"] as const;
const THROTTLE_MS = 10_000; // reset timer at most once per 10 seconds

export function useInactivityTimeout(enabled = true) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    if (!enabledRef.current) return;
    // Double-check: if user was recently active, don't log out
    if (Date.now() - lastActivityRef.current < INACTIVITY_TIMEOUT_MS) {
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
    if (!enabledRef.current) return;
    const now = Date.now();
    if (now - lastActivityRef.current < THROTTLE_MS) return;
    lastActivityRef.current = now;

    clearTimer();
    timerRef.current = setTimeout(handleLogout, INACTIVITY_TIMEOUT_MS);
  }, [handleLogout, clearTimer]);

  useEffect(() => {
    if (!enabled) {
      clearTimer();
      return;
    }

    // Start the timer and record initial activity
    lastActivityRef.current = Date.now();
    timerRef.current = setTimeout(handleLogout, INACTIVITY_TIMEOUT_MS);

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        resetTimer();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearTimer();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, resetTimer, handleLogout, clearTimer]);
}
