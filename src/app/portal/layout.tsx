import type { Metadata } from "next"

/**
 * Layout do portal do associado — vale para /portal (login) e tudo abaixo.
 * Por ora só troca o manifest do PWA herdado do RootLayout (que é o do painel)
 * pelo do portal: quem instala o app por aqui abre em /portal/inicio, não no
 * login dos funcionários (A56). O manifest mora fora de /portal — ver
 * src/app/manifest-portal.webmanifest/route.ts.
 *
 * A onda 1 vai mover para cá a casca do portal (PortalShell), hoje chamada
 * página a página. Até lá, este layout não desenha nada: o login e o
 * error.tsx do portal seguem como estavam.
 */
export const metadata: Metadata = {
  manifest: "/manifest-portal.webmanifest",
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children
}
