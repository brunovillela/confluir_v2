import { AjudaNav, type NavArea } from "@/components/ajuda/ajuda-nav"
import { requireSessaoPortal } from "@/lib/auth"
import { AREAS_AJUDA_PORTAL } from "@/lib/ajuda/manifesto-portal"

import { PortalShell } from "../portal-shell"

/**
 * Layout da Ajuda do portal do associado. Exige sessão do filiado e monta a
 * navegação lateral dentro da casca do portal (header + abas). Sem filtro de
 * permissão — o filiado logado vê todas as áreas.
 */
export default async function PortalAjudaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireSessaoPortal()

  const areas: NavArea[] = AREAS_AJUDA_PORTAL.map((a) => ({
    slug: a.slug,
    titulo: a.titulo,
    icone: a.icone,
    disponivel: a.disponivel,
    artigos: a.artigos.map((art) => ({ slug: art.slug, titulo: art.titulo })),
  }))

  return (
    <PortalShell>
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <aside className="lg:w-56 lg:shrink-0">
          <div className="lg:sticky lg:top-24">
            <AjudaNav areas={areas} base="/portal/ajuda" />
          </div>
        </aside>
        <div className="min-w-0 max-w-3xl flex-1">{children}</div>
      </div>
    </PortalShell>
  )
}
