import { useState, useEffect } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getPushPermission,
} from "@/lib/push-notifications";
import { toast } from "@/hooks/use-toast";

export function PushNotificationToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const check = async () => {
      if (!isPushSupported()) return;
      setSupported(true);

      const perm = await getPushPermission();
      if (perm === "granted") {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      }
    };
    check();
  }, []);

  if (!supported) return null;

  const toggle = async () => {
    setLoading(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
        toast({ title: "Notificações desativadas" });
      } else {
        const success = await subscribeToPush();
        if (success) {
          setSubscribed(true);
          toast({ title: "Notificações ativadas!" });
        } else {
          toast({
            title: "Não foi possível ativar",
            description: "Verifique as permissões do navegador.",
            variant: "destructive",
          });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={loading}
      className="gap-2 text-muted-foreground hover:text-foreground"
    >
      {subscribed ? (
        <>
          <Bell className="h-4 w-4" />
          <span className="hidden sm:inline">Push ativo</span>
        </>
      ) : (
        <>
          <BellOff className="h-4 w-4" />
          <span className="hidden sm:inline">Ativar Push</span>
        </>
      )}
    </Button>
  );
}
