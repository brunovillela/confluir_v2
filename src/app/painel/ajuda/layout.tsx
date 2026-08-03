import { AjudaNav, type NavArea } from "@/components/ajuda/ajuda-nav"
import { requireSessaoPainel } from "@/lib/auth"
import { AREAS_AJUDA } from "@/lib/ajuda/manifesto"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Layout da seção de Ajuda. Filtra as áreas do manual pela permissão do
 * usuário (mesma regra do painel) e monta a navegação lateral. Renderiza
 * dentro do chrome do painel (sidebar + header já vêm do layout de /painel).
 */
export default async function AjudaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const sessao = await requireSessaoPainel()

  const areas: NavArea[] = AREAS_AJUDA.filter((a) =>
    podeAcessar(sessao.permissoes, a.chave, a.chavesAlternativas)
  ).map((a) => ({
    slug: a.slug,
    titulo: a.titulo,
    icone: a.icone,
    disponivel: a.disponivel,
    artigos: a.artigos.map((art) => ({ slug: art.slug, titulo: art.titulo })),
  }))

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <aside className="lg:w-60 lg:shrink-0">
        <div className="lg:sticky lg:top-6">
          <AjudaNav areas={areas} />
        </div>
      </aside>
      <div className="min-w-0 max-w-3xl flex-1">{children}</div>
    </div>
  )
}
