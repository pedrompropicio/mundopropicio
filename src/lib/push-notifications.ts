import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = "BJNHMmc7m19Xt65seHISkaN3oMzKX5OUdTCngITRJYSjzTV1rfz-mpHLiNRgsP_xUMuIRh6O_iUMSPAoK7WxEpM";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return "denied";
  return Notification.permission;
}

export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const registration = await navigator.serviceWorker.ready;
    
    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisually: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      } as PushSubscriptionOptionsInit);
    }

    const subJson = subscription.toJSON();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Upsert subscription
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: user.id,
          endpoint: subJson.endpoint!,
          p256dh: subJson.keys!.p256dh!,
          auth: subJson.keys!.auth!,
        },
        { onConflict: "user_id,endpoint" }
      );

    if (error) {
      console.error("Error saving push subscription:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Error subscribing to push:", err);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      // Remove from database
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", subscription.endpoint);

      await subscription.unsubscribe();
    }

    return true;
  } catch (err) {
    console.error("Error unsubscribing from push:", err);
    return false;
  }
}

export async function sendPushToAdminsAndManagers(
  title: string,
  body: string,
  url?: string
): Promise<void> {
  try {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Get admin and manager user IDs
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "manager"]);

    const userIds = adminRoles?.map((r) => r.user_id) ?? [];
    if (userIds.length === 0) return;

    await supabase.functions.invoke("send-push-notification", {
      body: { user_ids: userIds, title, body, url },
    });
  } catch (err) {
    console.error("Error sending push notification:", err);
  }
}
