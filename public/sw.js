/* Confluir — service worker (onda 4, D2).
 * Só Web Push: mostra a notificação e abre o link ao tocar. Não há cache de
 * páginas de propósito — o painel tem de mostrar sempre o dado de agora. */

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  let dados = { titulo: "Confluir", corpo: "", url: "/painel" }
  try {
    if (event.data) dados = { ...dados, ...event.data.json() }
  } catch {
    if (event.data) dados.corpo = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(dados.titulo || "Confluir", {
      body: dados.corpo || "",
      icon: "/icones/icone-192.png",
      badge: "/icones/icone-maskable-192.png",
      data: { url: dados.url || "/painel" },
      tag: dados.tag || undefined,
      renotify: Boolean(dados.tag),
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/painel"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if ("focus" in c) {
          c.navigate(url)
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
