import { AjudaBusca, type ItemBusca, type SaidaBusca } from "@/components/ajuda/ajuda-busca"
import { AjudaNav, AjudaNavRecolhida, type NavArea } from "@/components/ajuda/ajuda-nav"
import { BASE_AJUDA_PORTAL } from "@/lib/ajuda/base-conhecimento-portal"
import { AREAS_AJUDA_PORTAL } from "@/lib/ajuda/manifesto-portal"
import { areasAjudaPortal, artigoForaDaAjuda, saidaDaAjudaPortal } from "@/lib/ajuda/mapa-portal"
import { partesDesabilitadas } from "@/lib/db/portal-partes"
import type { ChaveParte } from "@/lib/portal-partes-constantes"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

const BASE = "/portal/ajuda"

/**
 * Índice da busca (A111): título, resumo e área do manifesto e o corpo de
 * cada artigo, em texto puro (gerado dos .mdx por scripts/gerar-base-ajuda.mjs,
 * que o build roda). O corpo vai inteiro — são ~30 mil caracteres no total,
 * e cortar o texto escondia justamente as palavras que o associado digita
 * ("telefone", "cancelar"). Montado uma vez por servidor: é tudo estático; o
 * que sai por parte desabilitada é filtrado a cada requisição (abaixo).
 */
const ITENS: { areaSlug: string; artigoSlug: string; item: ItemBusca }[] = AREAS_AJUDA_PORTAL.filter(
  (a) => a.disponivel
).flatMap((a) =>
  a.artigos.map((art) => {
    const corpo = BASE_AJUDA_PORTAL.find((b) => b.area === a.slug && b.slug === art.slug)
    // Artigo novo sem texto na base: a busca segue pelo título, mas avisa no terminal.
    if (!corpo && process.env.NODE_ENV === "development") {
      console.warn(`[ajuda do portal] ${a.slug}/${art.slug} sem texto na busca: rode node scripts/gerar-base-ajuda.mjs portal`)
    }
    return {
      areaSlug: a.slug,
      artigoSlug: art.slug,
      item: {
        titulo: art.titulo,
        resumo: art.resumo,
        area: a.titulo,
        href: art.slug === "index" ? `${BASE}/${a.slug}` : `${BASE}/${a.slug}/${art.slug}`,
        // Sem as marcas das tabelas do markdown e com o espaço normalizado.
        texto: corpo?.texto
          .replace(/\|/g, " ")
          .replace(/-{3,}/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      },
    }
  })
)

/**
 * Layout da Ajuda do portal do associado. Exige o filiado logado — ou a
 * gestão em "Ver como filiado", que também consulta a ajuda ao atender — e
 * monta a busca e a navegação do manual: a casca (cabeçalho, menu, barra
 * inferior) já vem do layout do portal. Sem filtro de permissão — o filiado
 * logado vê todas as áreas —, mas a ajuda acompanha Filiados › Área do
 * associado: o artigo de parte desabilitada sai da busca e da navegação, e
 * com o Atendimento desabilitado a saída "pergunte ao sindicato" leva aos
 * canais de "O sindicato". Na dúvida (leitura que falhou), tudo aparece.
 *
 * A busca fica em todas as páginas da ajuda, não só no índice (A115). No
 * celular, a lista de áreas vem recolhida DEPOIS do artigo (A110); de lg em
 * diante, ao lado, sem "Todas as interfaces" (A113) e com o nome "Ajuda"
 * (A170).
 */
export default async function PortalAjudaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireVisualizacaoPortal()
  const desabilitadas = await partesDesabilitadas().catch(() => [] as ChaveParte[])

  const areas: NavArea[] = areasAjudaPortal(desabilitadas).map((a) => ({
    slug: a.slug,
    titulo: a.titulo,
    icone: a.icone,
    disponivel: a.disponivel,
    artigos: a.artigos.map((art) => ({ slug: art.slug, titulo: art.titulo })),
  }))
  const itens = ITENS.filter((i) => !artigoForaDaAjuda(i.areaSlug, i.artigoSlug, desabilitadas)).map((i) => i.item)
  // Quem não achou a resposta pergunta ao sindicato (A115).
  const saidaAjuda = saidaDaAjudaPortal(desabilitadas)
  const saida: SaidaBusca = { rotulo: saidaAjuda.rotuloBusca, href: saidaAjuda.href }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
      <aside className="lg:w-56 lg:shrink-0">
        {/* top-20: abaixo do cabeçalho sticky da casca (h-14), com folga (A171).
            z-sticky: o sticky cria contexto de empilhamento próprio, e sem
            z-index os passos e avisos do artigo (relative, que vêm depois)
            pintariam por cima da lista de resultados da busca. */}
        <div className="grid gap-4 lg:sticky lg:top-20 lg:z-(--z-sticky)">
          <AjudaBusca itens={itens} rotulo="ajuda" saida={saida} classePainel="lg:w-[26rem]" />
          {/* A lista rola sozinha se não couber na altura da tela; o -mx/px
              deixa o anel de foco dos links aparecer inteiro. */}
          <div className="hidden lg:-mx-1 lg:block lg:max-h-[calc(100svh-9.5rem)] lg:overflow-y-auto lg:px-1">
            <AjudaNav areas={areas} base={BASE} rotulo="ajuda" mostrarInterfaces={false} areaComoLink />
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {children}
        <AjudaNavRecolhida
          className="mt-10 lg:hidden"
          areas={areas}
          base={BASE}
          rotulo="ajuda"
          mostrarInterfaces={false}
          areaComoLink
        />
      </div>
    </div>
  )
}
