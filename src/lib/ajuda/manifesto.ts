import { MODULOS } from "@/lib/permissoes"

/**
 * Manifesto da seção de Ajuda: fonte única da estrutura do manual (áreas e
 * artigos). A permissão de cada área é herdada do módulo correspondente em
 * `@/lib/permissoes` (MODULOS), para não duplicar regra — quem enxerga o
 * módulo no painel enxerga a ajuda dele.
 *
 * Cada artigo corresponde a um arquivo em
 * `src/conteudo/ajuda/<area>/<slug>.mdx` (o overview é `index.mdx`).
 */

export type ArtigoMeta = {
  /** slug do arquivo .mdx (sem extensão). O overview da área é "index". */
  slug: string
  titulo: string
  resumo: string
}

export type AreaAjuda = {
  slug: string
  titulo: string
  descricao: string
  /** Nome do ícone em `@/components/ajuda/icones`. */
  icone: string
  /** Permissão que libera a área (mesma chave do módulo no painel). */
  chave: string | null
  chavesAlternativas: string[]
  /** false = área ainda não escrita (aparece como "Em breve" no índice). */
  disponivel: boolean
  /** Artigos da área. O primeiro é sempre o overview (slug "index"). */
  artigos: ArtigoMeta[]
}

/** Copia a permissão do módulo do painel dono da rota. */
function permissaoDoModulo(href: string): {
  chave: string | null
  chavesAlternativas: string[]
} {
  const m = MODULOS.find((mod) => mod.href === href)
  return {
    chave: m ? m.chave : null,
    chavesAlternativas: m?.chavesAlternativas ?? [],
  }
}

export const AREAS_AJUDA: AreaAjuda[] = [
  {
    slug: "introducao",
    titulo: "Introdução",
    descricao:
      "Primeiro acesso, interfaces, navegação, permissões e notificações",
    icone: "BookOpen",
    chave: null,
    chavesAlternativas: [],
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Bem-vindo ao Confluir",
        resumo: "Como acessar, as interfaces do sistema e como se orientar",
      },
    ],
  },
  {
    slug: "pessoal",
    titulo: "Pessoal",
    descricao: "Funcionários, contracheques, ponto e férias",
    icone: "BriefcaseBusiness",
    ...permissaoDoModulo("/painel/pessoal"),
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Visão geral do Pessoal",
        resumo:
          "O painel do departamento: alertas de pendência e áreas disponíveis",
      },
      {
        slug: "funcionarios",
        titulo: "Funcionários",
        resumo: "Cadastro, vínculos e o perfil completo do funcionário",
      },
      {
        slug: "contracheques",
        titulo: "Contracheques",
        resumo: "Remessas mensais, 13º, férias e liberação ao funcionário",
      },
      {
        slug: "ponto",
        titulo: "Controle de ponto",
        resumo: "Remessas de espelho de ponto e horas extras 70%/100%",
      },
      {
        slug: "ferias",
        titulo: "Férias",
        resumo: "Períodos aquisitivos, gozos e autorização com regras da CLT",
      },
    ],
  },

  {
    slug: "filiados",
    titulo: "Filiados",
    descricao: "Cadastro, vínculos e situação dos associados",
    icone: "Users",
    ...permissaoDoModulo("/painel/filiados"),
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Visão geral dos Filiados",
        resumo: "As áreas do módulo e a situação da filiação",
      },
      {
        slug: "perfil",
        titulo: "Perfil do filiado",
        resumo: "Identificação, vínculos, outros registros do CPF e consentimentos",
      },
      {
        slug: "solicitacoes",
        titulo: "Solicitações de filiação",
        resumo: "A ficha pública, a assinatura gov.br e a aprovação",
      },
      {
        slug: "termos",
        titulo: "Termos legais",
        resumo: "LGPD e autorização de desconto, versionados por entidade",
      },
    ],
  },

  // ——— Próximas áreas (estrutura já mapeada, conteúdo em produção) ———
  {
    slug: "representacao",
    titulo: "Representação Sindical",
    descricao: "Assembleias, oposição, acordos coletivos e empregadores",
    icone: "Megaphone",
    ...permissaoDoModulo("/painel/representacao"),
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Visão geral da Representação",
        resumo: "Assembleias, oposição, acordos e empregadores",
      },
      {
        slug: "assembleias",
        titulo: "Assembleias",
        resumo: "Campanha, rodada, perguntas, aptos e o voto",
      },
      {
        slug: "oposicao",
        titulo: "Oposição",
        resumo: "Cadastro público, assinatura gov.br e avaliação",
      },
      {
        slug: "empregadores",
        titulo: "Empregadores",
        resumo: "Fontes pagadoras, documentação e acordos coletivos",
      },
    ],
  },
  {
    slug: "financeiro",
    titulo: "Financeiro",
    descricao: "Ordens de pagamento, caixa, receitas e despesas",
    icone: "Landmark",
    ...permissaoDoModulo("/painel/financeiro"),
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Visão geral do Financeiro",
        resumo: "Ordens, caixa, centros de custo e receitas",
      },
      {
        slug: "ordens",
        titulo: "Ordens de pagamento",
        resumo: "O ciclo da despesa: autorização por alçada e pagamento",
      },
      {
        slug: "caixa",
        titulo: "Caixa",
        resumo: "Saldo, movimentação e administração dos caixas",
      },
      {
        slug: "centros-custo",
        titulo: "Centros de custo",
        resumo: "A classificação de despesas e receitas",
      },
    ],
  },
  {
    slug: "saude",
    titulo: "Saúde",
    descricao: "CATs, CIPA e atendimentos do serviço de saúde",
    icone: "HeartPulse",
    ...permissaoDoModulo("/painel/saude"),
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Visão geral da Saúde",
        resumo: "CAT, CIPA e atendimentos — e o cuidado com dados sensíveis",
      },
      {
        slug: "cat",
        titulo: "CAT",
        resumo: "Painel, listagem, formulário oficial e inclusão em massa",
      },
      {
        slug: "cipa",
        titulo: "CIPA",
        resumo: "O convite como registro, representantes e frequência",
      },
      {
        slug: "atendimentos",
        titulo: "Atendimentos",
        resumo: "Sigilo do relatório clínico e o que o assistido vê",
      },
    ],
  },
  {
    slug: "compras",
    titulo: "Compras",
    descricao: "Solicitações, cotações e aprovações por alçada",
    icone: "ShoppingCart",
    ...permissaoDoModulo("/painel/compras"),
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Visão geral de Compras",
        resumo: "As áreas: comprar, avaliar, receber, contratos e fornecedores",
      },
      {
        slug: "comprar",
        titulo: "Comprar",
        resumo: "Aquisição direta × via Compras, cotação e alçada",
      },
      {
        slug: "contratos",
        titulo: "Contratos",
        resumo: "Vigência derivada das datas, aditivos e geração de ordens",
      },
      {
        slug: "fornecedores",
        titulo: "Fornecedores",
        resumo: "Cadastro, endereços, dados bancários e excluir × inativar",
      },
    ],
  },
  {
    slug: "veiculos",
    titulo: "Veículos",
    descricao: "Frota, agendamentos, abastecimentos e infrações",
    icone: "Car",
    ...permissaoDoModulo("/painel/veiculos"),
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Visão geral dos Veículos",
        resumo: "Frota, agendamentos, abastecimentos, infrações e aluguel",
      },
      {
        slug: "agendamentos",
        titulo: "Agendamentos",
        resumo: "Reserva, retirada e devolução por hodômetro; abastecimentos",
      },
      {
        slug: "infracoes",
        titulo: "Infrações",
        resumo: "Multas, cobrança do infrator e baixa no Financeiro",
      },
    ],
  },
  {
    slug: "hospedagem",
    titulo: "Hospedagem",
    descricao: "Hotéis, tarifas, cupons e reservas",
    icone: "Hotel",
    ...permissaoDoModulo("/painel/hospedagem"),
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Visão geral da Hospedagem",
        resumo: "Hotéis, tarifas, cupons, reservas e faturamento",
      },
      {
        slug: "reservas",
        titulo: "Reservas",
        resumo: "Do pedido do filiado à hospedagem, com tarifa e cupom",
      },
      {
        slug: "faturamento",
        titulo: "Faturamento",
        resumo: "Nota, fatura e a ordem de pagamento do hotel",
      },
    ],
  },
  {
    slug: "juridico",
    titulo: "Jurídico",
    descricao: "Homologações, processos e reembolsos",
    icone: "Scale",
    ...permissaoDoModulo("/painel/juridico"),
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Visão geral do Jurídico",
        resumo: "Homologações, processos e reembolsos",
      },
      {
        slug: "homologacoes",
        titulo: "Homologações",
        resumo: "Rescisões homologadas, filiado × não-filiado e parecer",
      },
      {
        slug: "processos",
        titulo: "Processos",
        resumo: "Registro das ações judiciais e o escritório responsável",
      },
      {
        slug: "reembolsos",
        titulo: "Reembolsos",
        resumo: "Despesas do escritório em duas etapas de aprovação",
      },
    ],
  },
  {
    slug: "ferramentas",
    titulo: "Ferramentas",
    descricao: "Projetos, demandas, documentos, agenda, ofícios e e-mails",
    icone: "Wrench",
    ...permissaoDoModulo("/painel/ferramentas"),
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Visão geral das Ferramentas",
        resumo: "Projetos, demandas, documentos, agenda, ofícios e e-mails",
      },
      {
        slug: "projetos",
        titulo: "Projetos e demandas",
        resumo: "Projetos e o acompanhamento de tarefas e anomalias",
      },
      {
        slug: "documentos",
        titulo: "Documentos",
        resumo: "O repositório de arquivos por categoria",
      },
      {
        slug: "oficios",
        titulo: "Ofícios",
        resumo: "Emissão com numeração, signatário da diretoria e PDF",
      },
    ],
  },
  {
    slug: "institucional",
    titulo: "Institucional",
    descricao: "Organização, diretoria, registro sindical e usuários",
    icone: "Building2",
    ...permissaoDoModulo("/painel/institucional"),
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Visão geral do Institucional",
        resumo: "Organização, diretoria, atas, MTE, e-mails, usuários e ajudas",
      },
      {
        slug: "diretoria",
        titulo: "Diretoria",
        resumo: "Mandatos, integrantes, atas e os signatários dos ofícios",
      },
      {
        slug: "ajudas",
        titulo: "Ajudas institucionais",
        resumo: "Apoios a organizações e o cadastro de entidades apoiadas",
      },
      {
        slug: "usuarios",
        titulo: "Usuários e permissões",
        resumo: "Acesso ao painel, permissões por área e alçada",
      },
    ],
  },
  {
    slug: "noticias",
    titulo: "Comunicação",
    descricao: "Notícias e resumo de notícias por IA",
    icone: "Newspaper",
    ...permissaoDoModulo("/painel/comunicacao"),
    disponivel: true,
    artigos: [
      {
        slug: "index",
        titulo: "Visão geral da Comunicação",
        resumo: "Notícias e o resumo por IA",
      },
      {
        slug: "noticias",
        titulo: "Notícias",
        resumo: "Publicar, editar e onde as notícias aparecem",
      },
      {
        slug: "resumo-ia",
        titulo: "Resumo de notícias por IA",
        resumo: "Fontes, tamanho, recorrência, prompt e geração",
      },
    ],
  },
]

export function areaAjuda(slug: string): AreaAjuda | undefined {
  return AREAS_AJUDA.find((a) => a.slug === slug)
}

export function artigoAjuda(
  areaSlug: string,
  artigoSlug: string
): { area: AreaAjuda; artigo: ArtigoMeta } | undefined {
  const area = areaAjuda(areaSlug)
  if (!area) return undefined
  const artigo = area.artigos.find((a) => a.slug === artigoSlug)
  if (!artigo) return undefined
  return { area, artigo }
}
