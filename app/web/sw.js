// Service worker mínimo: hace que la web se pueda instalar como app (pantalla completa, icono propio).
// No guarda nada en caché: todo viene siempre del servidor (los datos tienen que estar al día).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
