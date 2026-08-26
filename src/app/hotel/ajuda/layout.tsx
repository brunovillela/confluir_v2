import { AjudaNav, type NavArea } from "@/components/ajuda/ajuda-nav"
import { requireSessaoHotel } from "@/lib/auth"
import { AREAS_AJUDA_HOTEL } from "@/lib/ajuda/manifesto-hotel"

import { HotelShell } from "../hotel-shell"

/**
 * Layout da Ajuda da área do hotel. Exige sessão do hotel e monta a navegação
 * lateral dentro da casca do hotel (header + abas). Sem filtro de permissão —
 * o usuário do hotel logado vê todas as áreas.
 */
export default async function HotelAjudaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { hotel } = await requireSessaoHotel()

  const areas: NavArea[] = AREAS_AJUDA_HOTEL.map((a) => ({
    slug: a.slug,
    titulo: a.titulo,
    icone: a.icone,
    disponivel: a.disponivel,
    artigos: a.artigos.map((art) => ({ slug: art.slug, titulo: art.titulo })),
  }))

  return (
    <HotelShell nomeHotel={hotel.nome ?? "Hotel parceiro"}>
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <aside className="lg:w-56 lg:shrink-0">
          <div className="lg:sticky lg:top-24">
            <AjudaNav areas={areas} base="/hotel/ajuda" />
          </div>
        </aside>
        <div className="min-w-0 max-w-3xl flex-1">{children}</div>
      </div>
    </HotelShell>
  )
}
