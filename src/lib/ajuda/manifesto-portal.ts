import type { AreaAjuda, ArtigoMeta } from "@/lib/ajuda/manifesto"

/**
 * Manifesto da seção de Ajuda do PORTAL DO ASSOCIADO. Estrutura própria (o
 * portal não tem permissões por módulo — o filiado logado vê todas as áreas),
 * então `chave` é sempre null. Espelha a organização de `manifesto.ts`, mas
 * as rotas ficam sob `/portal/ajuda` e o conteúdo em
 * `src/conteudo/portal/<area>/<slug>.mdx`.
 *
 * As áreas seguem a ORDEM, os NOMES e os ÍCONES do menu do portal
 * (components/portal/navegacao-portal.ts), para o associado reconhecer na
 * ajuda o que tocou no menu. Os slugs ficam como estavam: são os endereços
 * dos artigos, que circulam em e-mails e avisos.
 *
 * Mexeu num .mdx? `node scripts/gerar-base-ajuda.mjs portal` atualiza o texto
 * em que a busca procura (o build já roda o script sozinho).
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
    descricao: "Seus dados pessoais, o vínculo com a empresa e os contatos de emergência",
    icone: "UserPen",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Seus dados cadastrais",
        resumo: "O que aparece, o que você mesmo atualiza e como pedir a correção do resto",
      },
    ],
  },
  {
    slug: "carteirinha",
    titulo: "Carteirinha",
    descricao: "Sua identificação de filiado e a declaração de filiação em PDF",
    icone: "IdCard",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Carteirinha e declaração",
        resumo: "Como mostrar a carteirinha, o que o QR Code confirma e como baixar a declaração",
      },
    ],
  },
  {
    // A54: a contribuição era um parágrafo dentro da carteirinha; quem paga
    // precisa entender o que a página mostra, o que fazer e como sair.
    slug: "contribuicao",
    titulo: "Contribuição",
    descricao: "Seus descontos mês a mês, o Pix, o extrato do ano e o que fazer quando algo não bate",
    icone: "HandCoins",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Sua contribuição",
        resumo: "O que cada situação quer dizer, por que o desconto demora a aparecer, o Pix e o extrato",
      },
      {
        slug: "desfiliacao",
        titulo: "Desfiliação",
        resumo: "Como pedir para sair, a desistência da filiação coletiva e o que acontece depois",
      },
    ],
  },
  {
    slug: "hospedagem",
    titulo: "Hospedagem",
    descricao: "Cupons e reservas nos hotéis parceiros",
    icone: "BedDouble",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Cupons e reservas",
        resumo: "Como pedir hospedagem, acompanhar o pedido, cancelar e avaliar a estadia",
      },
    ],
  },
  {
    slug: "convenios",
    titulo: "Convênios",
    descricao: "Descontos e serviços negociados pelo sindicato para você",
    icone: "Handshake",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Convênios",
        resumo: "O que o sindicato negociou para você e onde usar",
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
    slug: "votacao",
    titulo: "Votação",
    descricao: "Assembleias em que você está apto, o voto online e o comprovante",
    icone: "Vote",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Votar nas assembleias",
        resumo: "Assembleias abertas, e-mail de votação e o comprovante de cada participação",
      },
    ],
  },
  {
    // A169: a antiga área "Agenda" mora aqui — no portal, agenda e eventos
    // são uma página só. /portal/ajuda/agenda redireciona para cá.
    slug: "eventos",
    titulo: "Eventos",
    descricao: "Inscrições, presença, código de entrada e a agenda de atividades",
    icone: "CalendarDays",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Eventos e agenda",
        resumo: "Como se inscrever, acompanhar a inscrição e ver as próximas atividades",
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
    slug: "atendimento",
    titulo: "Atendimento",
    descricao: "Abra solicitações e acompanhe a resposta da entidade",
    icone: "MessagesSquare",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Falar com a entidade",
        resumo: "Como abrir uma solicitação, anexar documento ou foto, acompanhar e reabrir",
      },
    ],
  },
  {
    slug: "avisos",
    titulo: "Avisos",
    descricao: "O sino do portal, o e-mail e as notificações no celular",
    icone: "Bell",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Seus avisos",
        resumo: "O que chega no sino e como escolher o que vai também por e-mail e para o celular",
      },
    ],
  },
  {
    // "Contribuição assistencial", como no menu (A116): "Oposição à
    // contribuição" soava como deixar de pagar a mensalidade.
    slug: "oposicao",
    titulo: "Contribuição assistencial",
    descricao: "Como registrar oposição ao desconto da contribuição assistencial",
    icone: "ScrollText",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Registrar oposição",
        resumo: "Quem pode, o passo a passo, a assinatura e o comprovante",
      },
    ],
  },
  {
    slug: "lgpd",
    titulo: "Privacidade e dados",
    descricao: "Seus consentimentos, seus dados e os seus direitos",
    icone: "ShieldCheck",
    ...sem,
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Seus dados pessoais",
        resumo: "O termo, os comunicados por e-mail, baixar seus dados e como exercer seus direitos",
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
