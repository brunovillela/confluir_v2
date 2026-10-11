/* Confluir — service worker (onda 4, D2).
 * Só Web Push: mostra a notificação e abre o link ao tocar. Não há cache de
 * páginas de propósito — o painel tem de mostrar sempre o dado de agora.
 * Um só para painel e portal (registrado com escopo "/"). Sem cache nomeado
 * nem versão: qualquer mudança neste arquivo já faz o navegador trocar pelo
 * novo (skipWaiting + clients.claim). */

// Notificação sem link abre a raiz, não o /painel fixo — o portal também usa
// este service worker. Quem escolhe a área é o servidor (src/app/page.tsx e o
// proxy); hoje a raiz ainda manda todo mundo para o /painel.
const URL_PADRAO = "/"

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  let dados = { titulo: "Confluir", corpo: "", url: URL_PADRAO }
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
      data: { url: dados.url || URL_PADRAO },
      tag: dados.tag || undefined,
      renotify: Boolean(dados.tag),
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || URL_PADRAO
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
