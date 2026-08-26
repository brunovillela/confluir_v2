import type { AreaAjuda, ArtigoMeta } from "@/lib/ajuda/manifesto"

/**
 * Manifesto da seção de Ajuda do PORTAL DO ASSOCIADO. Estrutura própria (o
 * portal não tem permissões por módulo — o filiado logado vê todas as áreas),
 * então `chave` é sempre null. Espelha a organização de `manifesto.ts`, mas
 * as rotas ficam sob `/portal/ajuda` e o conteúdo em
 * `src/conteudo/portal/<area>/<slug>.mdx`.
 */

export type { AreaAjuda, ArtigoMeta }

const sem = { chave: null, chavesAlternativas: [] as string[] }

export const AREAS_AJUDA_PORTAL: AreaAjuda[] = [
  {
    slug: "visao-geral",
    titulo: "Portal do associado",
    descricao: "O que é o portal, como entrar e como se orientar",
    icone: "BookOpen",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Bem-vindo ao portal",
        resumo: "Como entrar, o menu e por que você só vê os seus dados",
      },
    ],
  },
  {
    slug: "cadastro",
    titulo: "Meu cadastro",
    descricao: "Seus dados pessoais e como mantê-los em dia",
    icone: "IdCard",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Seus dados cadastrais",
        resumo: "O que aparece, o que você pode atualizar e o que é conferido",
      },
    ],
  },
  {
    slug: "hospedagem",
    titulo: "Hospedagem",
    descricao: "Cupons e reservas nos hotéis conveniados",
    icone: "Hotel",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Cupons e reservas",
        resumo: "Como pedir um cupom de hospedagem e acompanhar a reserva",
      },
    ],
  },
  {
    slug: "saude",
    titulo: "Saúde",
    descricao: "Seus atendimentos no serviço de saúde",
    icone: "HeartPulse",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Seus atendimentos",
        resumo: "O que você vê do serviço de saúde — e o que é sigiloso",
      },
    ],
  },
  {
    slug: "noticias",
    titulo: "Notícias",
    descricao: "As notícias e comunicados da entidade",
    icone: "Newspaper",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Notícias da entidade",
        resumo: "Onde ler os comunicados publicados pelo sindicato",
      },
    ],
  },
  {
    slug: "agenda",
    titulo: "Agenda",
    descricao: "Eventos e compromissos da entidade",
    icone: "CalendarDays",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Agenda de eventos",
        resumo: "Os próximos eventos e como se orientar pelas datas",
      },
    ],
  },
  {
    slug: "oposicao",
    titulo: "Oposição à contribuição",
    descricao: "Como registrar oposição à contribuição assistencial",
    icone: "Megaphone",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Registrar oposição",
        resumo: "O passo a passo, a assinatura e o comprovante",
      },
    ],
  },
  {
    slug: "lgpd",
    titulo: "LGPD e meus dados",
    descricao: "Seus direitos sobre os dados pessoais",
    icone: "ShieldCheck",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Seus direitos de dados",
        resumo: "Como pedir acesso, correção ou exclusão dos seus dados",
      },
    ],
  },
]

export function areaAjudaPortal(slug: string): AreaAjuda | undefined {
  return AREAS_AJUDA_PORTAL.find((a) => a.slug === slug)
}

export function artigoAjudaPortal(
  areaSlug: string,
  artigoSlug: string
): { area: AreaAjuda; artigo: ArtigoMeta } | undefined {
  const area = areaAjudaPortal(areaSlug)
  if (!area) return undefined
  const artigo = area.artigos.find((a) => a.slug === artigoSlug)
  if (!artigo) return undefined
  return { area, artigo }
}
