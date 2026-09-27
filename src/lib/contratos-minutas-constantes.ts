/**
 * Assistente de minutas de contrato — constantes seguras para o client.
 * Ver supabase/contratos-minutas.sql e src/lib/db/contratos-minutas.ts.
 */

export const TIPOS_MINUTA = [
  {
    chave: "prestacao_servicos",
    rotulo: "Prestação de serviços",
    explicacao: "Uma empresa ou profissional presta um serviço à entidade (ou a entidade presta a alguém).",
  },
  {
    chave: "fornecimento",
    rotulo: "Compra e fornecimento",
    explicacao: "Compra de bens ou fornecimento contínuo de produtos, com entrega e garantia.",
  },
  {
    chave: "locacao_imovel",
    rotulo: "Locação de imóvel",
    explicacao: "Aluguel de imóvel (sede, sala, espaço), com prazo, reajuste e conservação.",
  },
  {
    chave: "locacao_bens",
    rotulo: "Locação de bens ou equipamentos",
    explicacao: "Aluguel de veículos, equipamentos, som, estrutura para evento.",
  },
  {
    chave: "comodato",
    rotulo: "Comodato",
    explicacao: "Empréstimo gratuito de bem, com devolução no prazo e no estado combinados.",
  },
  {
    chave: "patrocinio",
    rotulo: "Patrocínio ou apoio",
    explicacao: "A entidade patrocina ou recebe patrocínio/apoio, com contrapartidas.",
  },
  {
    chave: "parceria",
    rotulo: "Convênio ou parceria",
    explicacao: "Cooperação com outra entidade, empresa ou órgão, com obrigações de cada lado.",
  },
  {
    chave: "confidencialidade",
    rotulo: "Confidencialidade",
    explicacao: "Acordo de sigilo sobre informações trocadas entre as partes.",
  },
  {
    chave: "aditivo",
    rotulo: "Termo aditivo",
    explicacao: "Altera um contrato existente (prazo, valor, objeto) sem refazê-lo.",
  },
  {
    chave: "distrato",
    rotulo: "Distrato",
    explicacao: "Encerra um contrato antes do fim, com quitação e obrigações finais.",
  },
  {
    chave: "outro",
    rotulo: "Outro",
    explicacao: "Descreva o tipo de contrato no campo de objeto e nas instruções.",
  },
] as const

export type TipoMinuta = (typeof TIPOS_MINUTA)[number]["chave"]

export function tipoMinuta(valor: unknown): TipoMinuta | null {
  return TIPOS_MINUTA.some((t) => t.chave === valor) ? (valor as TipoMinuta) : null
}

export function rotuloTipoMinuta(valor: string | null): string {
  return TIPOS_MINUTA.find((t) => t.chave === valor)?.rotulo ?? "Contrato"
}

/** Papel da entidade no contrato. */
export const PAPEIS_ENTIDADE = [
  { chave: "contratante", rotulo: "Contratante", explicacao: "A entidade paga ou recebe o serviço/bem." },
  { chave: "contratada", rotulo: "Contratada", explicacao: "A entidade presta o serviço, cede ou recebe o pagamento." },
] as const
export type PapelEntidade = (typeof PAPEIS_ENTIDADE)[number]["chave"]

/** O que o usuário informa. Tudo texto: vai para o prompt e fica guardado. */
export type ParametrosMinuta = {
  tipo: TipoMinuta
  papelEntidade: PapelEntidade
  /** Outra parte: fornecedor cadastrado (id) e/ou qualificação livre. */
  outraParteId: string | null
  outraParteNome: string | null
  outraParteQualificacao: string | null
  outraParteRepresentante: string | null
  /** Quem assina pela entidade (integrante da diretoria vigente). */
  assinanteId: string | null
  sedeId: string | null
  objeto: string
  valor: string | null
  pagamento: string | null
  vigencia: string | null
  reajuste: string | null
  obrigacoes: string | null
  penalidades: string | null
  foro: string | null
  instrucoes: string | null
}

/** Trechos que a IA deixou para preencher: [PREENCHER: …]. */
export function pendenciasDaMinuta(texto: string | null): string[] {
  if (!texto) return []
  return [...texto.matchAll(/\[PREENCHER:?\s*([^\]]*)\]/gi)].map((m) => m[1].trim() || "dado a preencher")
}

export const ORIGENS_VERSAO: Record<string, string> = {
  ia: "Redigida pela IA",
  ajuste: "Ajuste pedido à IA",
  edicao: "Edição manual",
  restauracao: "Versão restaurada",
}
