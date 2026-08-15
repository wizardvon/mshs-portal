const messagingWorkerPath = "/firebase-messaging-sw.js";

async function clearBrowserCaches() {
  if (!("caches" in window)) return;

  const cacheNames = await window.caches.keys();
  await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
}

async function unregisterStaleServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map((registration) => {
      const activeScriptUrl =
        registration.active?.scriptURL ||
        registration.waiting?.scriptURL ||
        registration.installing?.scriptURL ||
        "";
      const activeScriptPath = activeScriptUrl ? new URL(activeScriptUrl).pathname : "";

      if (activeScriptPath === messagingWorkerPath) {
        return registration.update().catch(() => undefined);
      }

      return registration.unregister();
    }),
  );
}

export async function disableOfflineAppCache() {
  if (typeof window === "undefined") return;

  try {
    await Promise.all([clearBrowserCaches(), unregisterStaleServiceWorkers()]);
  } catch (error) {
    console.warn("Unable to clear browser app cache.", error);
  }
}
