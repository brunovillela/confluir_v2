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
// Avisos do associado (A52) chegam com `area: "portal"`: sem link, abrem a
// lista de avisos do portal (lib/db/push.ts sempre manda um, mas por garantia).
const URL_PADRAO_PORTAL = "/portal/avisos"

function urlDoAviso(dados) {
  if (typeof dados.url === "string" && dados.url) return dados.url
  return dados.area === "portal" ? URL_PADRAO_PORTAL : URL_PADRAO
}

/** "/portal" ou "/painel" — para reaproveitar só uma janela da mesma área. */
function areaDe(caminho) {
  if (caminho === "/portal" || caminho.startsWith("/portal/")) return "/portal"
  if (caminho === "/painel" || caminho.startsWith("/painel/")) return "/painel"
  return null
}

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  let dados = { titulo: "Confluir", corpo: "", url: "" }
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
      data: { url: urlDoAviso(dados) },
      tag: dados.tag || undefined,
      renotify: Boolean(dados.tag),
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const destino = new URL((event.notification.data && event.notification.data.url) || URL_PADRAO, self.location.origin)
  const area = areaDe(destino.pathname)
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (lista) => {
      // Reaproveita uma janela da MESMA área: tocar no aviso do portal não
      // troca a tela do painel aberta ao lado (com um formulário pela metade),
      // e vice-versa. Sem janela da área, abre uma nova — no celular com o
      // portal instalado, ela abre dentro do app.
      const mesma = area ? lista.find((c) => areaDe(new URL(c.url).pathname) === area) : null
      if (mesma) {
        try {
          const focada = await mesma.focus()
          await (focada || mesma).navigate(destino.href)
          return
        } catch {
          // janela fora do controle deste service worker: segue para uma nova
        }
      }
      return self.clients.openWindow(destino.href)
    })
  )
})
