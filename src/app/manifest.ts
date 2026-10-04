import type { MetadataRoute } from "next"

/**
 * PWA (onda 4, D2): instalável no celular, abre em tela cheia no painel.
 * O service worker (public/sw.js) só cuida do Web Push — nada é guardado
 * em cache, para o painel nunca mostrar dado velho.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Confluir",
    short_name: "Confluir",
    description: "Gestão sindical: painel, portal do associado e aprovações pelo celular.",
    start_url: "/painel",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#091747",
    theme_color: "#091747",
    lang: "pt-BR",
    icons: [
      { src: "/icones/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icones/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icones/icone-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icones/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Aprovar", short_name: "Aprovar", url: "/painel/aprovar", description: "Ordens, assinaturas e diárias esperando você" },
      { name: "Portal do associado", short_name: "Portal", url: "/portal/inicio" },
    ],
  }
}
