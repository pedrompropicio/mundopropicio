// Service Worker Push Event Handler
// This file is injected into the SW scope by vite-plugin-pwa

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || "MP Gestão Eventos";
    const options = {
      body: data.body || "",
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      data: { url: data.url || "/" },
      tag: "mp-notification",
      renotify: true,
    };

    // Update badge count
    if (data.badge_count !== undefined && navigator.setAppBadge) {
      navigator.setAppBadge(data.badge_count).catch(() => {});
    }

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error("Push event error:", err);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Clear badge on click
  if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  }

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
