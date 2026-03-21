import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"] as const;
const THROTTLE_MS = 60_000; // only reset timer once per minute

export function useInactivityTimeout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(Date.now());

  const handleLogout = useCallback(async () => {
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
    // Start the timer
    timerRef.current = setTimeout(handleLogout, INACTIVITY_TIMEOUT_MS);

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [resetTimer, handleLogout]);
}
