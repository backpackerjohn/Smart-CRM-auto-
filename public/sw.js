// Minimal service worker for v1: queue offline captures, pass-through everything else.
// Offline capture queue lives in IndexedDB (see src/lib/offline/queue.ts).
// Full caching strategy is deferred — see plan section 8.

const VERSION = "smart-crm-auto-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through. Caching strategy is intentionally minimal for v1.
  return;
});
