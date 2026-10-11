import { AjudaNav, type NavArea } from "@/components/ajuda/ajuda-nav"
import { AREAS_AJUDA_PORTAL } from "@/lib/ajuda/manifesto-portal"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Layout da Ajuda do portal do associado. Exige o filiado logado — ou a
 * gestão em "Ver como filiado", que também consulta a ajuda ao atender — e
 * monta só a navegação lateral do manual: a casca (cabeçalho, menu, barra
 * inferior) já vem do layout do portal. Sem filtro de permissão — o filiado
 * logado vê todas as áreas.
 */
export default async function PortalAjudaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireVisualizacaoPortal()

  const areas: NavArea[] = AREAS_AJUDA_PORTAL.map((a) => ({
    slug: a.slug,
    titulo: a.titulo,
    icone: a.icone,
    disponivel: a.disponivel,
    artigos: a.artigos.map((art) => ({ slug: art.slug, titulo: art.titulo })),
  }))

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <aside className="lg:w-56 lg:shrink-0">
        {/* top-20: abaixo do cabeçalho sticky da casca (h-14). */}
        <div className="lg:sticky lg:top-20">
          <AjudaNav areas={areas} base="/portal/ajuda" />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
