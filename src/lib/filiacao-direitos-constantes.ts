/**
 * Carência e inadimplência — tipos e listas que o CLIENTE também usa.
 *
 * Fora do `server-only` porque os formulários de configuração precisam deles
 * (mesmo motivo dos outros `*-constantes.ts` do projeto).
 */

export type Beneficio =
  | "hospedagem"
  | "saude"
  | "juridico"
  | "eventos"
  | "votacao"

export const BENEFICIOS: {
  chave: Beneficio
  rotulo: string
  descricao: string
}[] = [
  {
    chave: "hospedagem",
    rotulo: "Hospedagem",
    descricao: "Solicitar cupom de hospedagem na rede conveniada.",
  },
  {
    chave: "saude",
    rotulo: "Saúde",
    descricao: "Atendimentos e serviços de saúde da entidade.",
  },
  {
    chave: "juridico",
    rotulo: "Jurídico",
    descricao: "Assistência jurídica ao associado.",
  },
  {
    chave: "eventos",
    rotulo: "Eventos",
    descricao: "Inscrição em eventos com vaga reservada a filiados.",
  },
  {
    chave: "votacao",
    rotulo: "Votar em pleito de filiados",
    descricao:
      "Eleições e consultas internas. Não alcança assembleias da categoria, abertas a todos os trabalhadores.",
  },
]

export type CarenciaConfig = {
  beneficio: Beneficio
  dias: number
  ativo: boolean
  observacao: string | null
}

export type RegraInadimplencia = {
  tipo: string
  quantidade: number
  exigirConsecutivas: boolean
  janelaRemessas: number
  ativo: boolean
}

export type EscopoSuspensao = "carencia" | "inadimplencia"

export const ESCOPOS: { chave: EscopoSuspensao; rotulo: string }[] = [
  { chave: "carencia", rotulo: "Carência" },
  { chave: "inadimplencia", rotulo: "Inadimplência" },
]

export type Direito = {
  liberado: boolean
  /** Por que não, em linguagem de quem vai ler. */
  motivo?: string
  /** Quando abre, se for questão de tempo. */
  liberaEm?: string
  diasRestantes?: number
}

/**
 * A pessoa já cumpriu a carência deste benefício?
 *
 * Função PURA e fora do `server-only`: é a regra do estatuto em código, e
 * regra assim precisa poder ser exercitada isoladamente — além de a tela do
 * portal também querer usá-la.
 *
 * Recebe as datas de filiação em vez de ir buscá-las: quem chama já as tem em
 * mãos, e uma ida a mais ao banco por benefício encareceria a página.
 */
export function conferirCarencia(
  carencia: CarenciaConfig,
  datas: { maisRecente: string | null; primeira: string | null },
  temSuspensao: boolean,
  agora = new Date()
): Direito {
  if (!carencia.ativo || carencia.dias <= 0) return { liberado: true }

  // Com efeito suspensivo vale a PRIMEIRA filiação: quem trocou de empregador
  // sem sair do sindicato não recomeça a contagem.
  const base = temSuspensao
    ? (datas.primeira ?? datas.maisRecente)
    : datas.maisRecente
  if (!base) {
    // Sem vínculo datado e sem histórico de contribuição não há de onde
    // contar. É raro, e barrar é o lado seguro — mas o texto tem de dizer o
    // que fazer, porque a falha é do registro, não da pessoa.
    return {
      liberado: false,
      motivo:
        "Não há data de filiação nem histórico de contribuição para contar a carência. Registre o vínculo no histórico de filiação.",
    }
  }

  const libera = new Date(base)
  libera.setDate(libera.getDate() + carencia.dias)
  if (libera <= agora) return { liberado: true }

  const dias = Math.ceil((libera.getTime() - agora.getTime()) / 86_400_000)
  return {
    liberado: false,
    motivo: `A carência deste direito é de ${carencia.dias} dias a partir da filiação.`,
    liberaEm: libera.toISOString(),
    diasRestantes: dias,
  }
}
