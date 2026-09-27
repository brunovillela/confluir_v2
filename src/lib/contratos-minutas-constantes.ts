/**
 * Assistente de minutas de contrato — constantes seguras para o client.
 * Ver supabase/contratos-minutas.sql e src/lib/db/contratos-minutas.ts.
 */

/**
 * Tipos de contrato e cláusulas fixas são CONFIGURADOS pela entidade
 * (contratos_minuta_tipos / contratos_clausulas_fixas). A minuta guarda uma
 * cópia do tipo e das cláusulas usados — mudar a configuração depois não
 * reescreve minuta já redigida.
 */
export type TipoMinutaConfig = {
  id: string
  nome: string
  descricao: string | null
  orientacao: string | null
  ativo: boolean
  ordem: number
}

export type ClausulaFixa = {
  id: string
  titulo: string
  texto: string
  ativa: boolean
  ordem: number
  /** Vazio = vale para todos os tipos. */
  tipos: string[]
}

/** Cláusulas ativas que valem para o tipo escolhido, na ordem configurada. */
export function clausulasDoTipo(clausulas: ClausulaFixa[], tipoId: string | null): ClausulaFixa[] {
  return clausulas
    .filter((c) => c.ativa && (c.tipos.length === 0 || (tipoId !== null && c.tipos.includes(tipoId))))
    .sort((a, b) => a.ordem - b.ordem)
}

/** Sem acento, minúsculo, só letras e números: compara texto de cláusula com a minuta. */
function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Cláusulas fixas cujo texto não aparece (na íntegra) na minuta. */
export function clausulasAusentes(
  texto: string | null,
  clausulas: { titulo: string; texto: string }[]
): { titulo: string; texto: string }[] {
  const corpo = normalizar(texto ?? "")
  return clausulas.filter((c) => !corpo.includes(normalizar(c.texto)))
}

/** Papel da entidade no contrato. */
export const PAPEIS_ENTIDADE = [
  { chave: "contratante", rotulo: "Contratante", explicacao: "A entidade paga ou recebe o serviço/bem." },
  { chave: "contratada", rotulo: "Contratada", explicacao: "A entidade presta o serviço, cede ou recebe o pagamento." },
] as const
export type PapelEntidade = (typeof PAPEIS_ENTIDADE)[number]["chave"]

/** O que o usuário informa. Tudo texto: vai para o prompt e fica guardado. */
export type ParametrosMinuta = {
  tipoId: string | null
  tipoNome: string
  /** Orientação do tipo para a IA (cópia do momento da criação). */
  tipoOrientacao: string | null
  /** Cláusulas fixas que valiam na criação (cópia). */
  clausulasFixas: { titulo: string; texto: string }[]
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
