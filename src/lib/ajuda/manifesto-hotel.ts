import type { AreaAjuda, ArtigoMeta } from "@/lib/ajuda/manifesto"

/**
 * Manifesto da seção de Ajuda da ÁREA DO HOTEL (hotéis parceiros). Estrutura
 * própria (o hotel não tem permissões por módulo — o usuário do hotel vê todas
 * as áreas), então `chave` é sempre null. Rotas sob `/hotel/ajuda`, conteúdo em
 * `src/conteudo/hotel/<area>/<slug>.mdx`.
 */

export type { AreaAjuda, ArtigoMeta }

const sem = { chave: null, chavesAlternativas: [] as string[] }

export const AREAS_AJUDA_HOTEL: AreaAjuda[] = [
  {
    slug: "visao-geral",
    titulo: "Área do hotel",
    descricao: "O que é a área, como entrar e como se orientar",
    icone: "Hotel",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Bem-vindo à área do hotel",
        resumo: "Como entrar, o menu e o que aparece na tela inicial",
      },
    ],
  },
  {
    slug: "reservas",
    titulo: "Reservas",
    descricao: "Confirmar cupons e registrar a hospedagem",
    icone: "BedDouble",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Cupons e reservas",
        resumo: "Do cupom do filiado à reserva confirmada, com a tarifa",
      },
    ],
  },
  {
    slug: "faturamento",
    titulo: "Faturamento",
    descricao: "Emitir a fatura das hospedagens ao sindicato",
    icone: "Receipt",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Emitir faturas",
        resumo: "Reunir as hospedagens numa fatura e anexar a nota",
      },
    ],
  },
  {
    slug: "contas",
    titulo: "Dados bancários",
    descricao: "A conta para receber os pagamentos",
    icone: "Landmark",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Dados bancários",
        resumo: "Cadastrar e manter a conta que recebe do sindicato",
      },
    ],
  },
  {
    slug: "acordo",
    titulo: "Acordo e orientações",
    descricao: "As regras do convênio com o sindicato",
    icone: "FileSignature",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Acordo e orientações",
        resumo: "As condições combinadas e as orientações de uso",
      },
    ],
  },
]

export function areaAjudaHotel(slug: string): AreaAjuda | undefined {
  return AREAS_AJUDA_HOTEL.find((a) => a.slug === slug)
}

export function artigoAjudaHotel(
  areaSlug: string,
  artigoSlug: string
): { area: AreaAjuda; artigo: ArtigoMeta } | undefined {
  const area = areaAjudaHotel(areaSlug)
  if (!area) return undefined
  const artigo = area.artigos.find((a) => a.slug === artigoSlug)
  if (!artigo) return undefined
  return { area, artigo }
}
