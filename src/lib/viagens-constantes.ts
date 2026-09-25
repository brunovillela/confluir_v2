/**
 * Viagens — passagens e hospedagens que o sindicato contrata e paga para
 * diretores, funcionários e convidados de eventos. Seguro para o client (sem
 * `server-only`): rótulos, tipos e a validação dos itens que o formulário
 * manda em JSON. Ver supabase/viagens.sql.
 */

export const SITUACOES_VIAGEM = [
  "solicitada",
  "em_atendimento",
  "atendida",
  "cancelada",
  "recusada",
] as const
export type SituacaoViagem = (typeof SITUACOES_VIAGEM)[number]

export const ROTULO_SITUACAO_VIAGEM: Record<SituacaoViagem, string> = {
  solicitada: "Solicitada",
  em_atendimento: "Em atendimento",
  atendida: "Atendida",
  cancelada: "Cancelada",
  recusada: "Recusada",
}

export type BeneficiarioViagem = "funcionario" | "diretor" | "convidado"

export const ROTULO_BENEFICIARIO: Record<BeneficiarioViagem, string> = {
  funcionario: "Funcionário(a)",
  diretor: "Diretor(a)",
  convidado: "Convidado(a)",
}

export type TipoItemViagem = "passagem" | "hospedagem"
export type ModalPassagem = "aerea" | "rodoviaria"
export type CriterioHorario = "ate" | "depois"

export const ROTULO_MODAL: Record<ModalPassagem, string> = {
  aerea: "Aérea",
  rodoviaria: "Rodoviária",
}

/** Filtro da lista da gestão; vem da URL (searchParams). */
export type FiltroViagens = {
  pessoa?: string
  tipo?: TipoItemViagem
  /** Uma situação ou "abertas" (solicitada + em atendimento). */
  situacao?: SituacaoViagem | "abertas"
  quadro?: BeneficiarioViagem
  eventoId?: string
  fornecedorId?: string
  de?: string
  ate?: string
}

export function lerFiltroViagens(p: Record<string, string | undefined>): FiltroViagens {
  const data = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined)
  return {
    pessoa: p.pessoa?.trim() || undefined,
    tipo: p.tipo === "passagem" || p.tipo === "hospedagem" ? p.tipo : undefined,
    situacao:
      p.situacao === "abertas" || SITUACOES_VIAGEM.includes(p.situacao as SituacaoViagem)
        ? (p.situacao as SituacaoViagem | "abertas")
        : undefined,
    quadro:
      p.quadro === "diretor" || p.quadro === "funcionario" || p.quadro === "convidado"
        ? p.quadro
        : undefined,
    eventoId: uuid(p.evento),
    fornecedorId: uuid(p.agencia),
    de: data(p.de),
    ate: data(p.ate),
  }
}

export type ItemPassagemEntrada = {
  tipo: "passagem"
  modal: ModalPassagem
  origem: string
  destino: string
  data: string
  saidaCriterio: CriterioHorario | null
  saidaHora: string | null
  chegadaCriterio: CriterioHorario | null
  chegadaHora: string | null
  bagagemExtra: boolean
  bagagemDescricao: string | null
  necessidades: string | null
  observacoes: string | null
}

export type ItemHospedagemEntrada = {
  tipo: "hospedagem"
  cidade: string
  checkin: string
  checkout: string
  necessidades: string | null
  observacoes: string | null
}

export type ItemViagemEntrada = ItemPassagemEntrada | ItemHospedagemEntrada

const DATA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^\d{2}:\d{2}$/

function txt(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : ""
  return s ? s : null
}

function criterio(v: unknown): CriterioHorario | null {
  return v === "ate" || v === "depois" ? v : null
}

/**
 * "Até 10:00" / "a partir de 14:30" — o horário desejado de um trecho.
 * Nulo quando a pessoa não restringiu.
 */
export function descreverHorario(
  criterioHorario: CriterioHorario | null,
  hora: string | null
): string | null {
  if (!hora) return null
  const hhmm = hora.slice(0, 5)
  return criterioHorario === "depois" ? `a partir de ${hhmm}` : `até ${hhmm}`
}

/**
 * Valida os itens que o formulário manda em JSON. Devolve a lista limpa ou a
 * primeira mensagem de erro, já dizendo QUAL item está incompleto.
 */
export function validarItensViagem(
  bruto: unknown,
  hoje: string
): { itens: ItemViagemEntrada[] } | { erro: string } {
  if (!Array.isArray(bruto) || bruto.length === 0) {
    return { erro: "Acrescente pelo menos uma passagem ou hospedagem." }
  }
  if (bruto.length > 20) return { erro: "No máximo 20 itens por viagem." }

  const itens: ItemViagemEntrada[] = []
  for (const [i, cru] of bruto.entries()) {
    const o = (cru ?? {}) as Record<string, unknown>
    const n = i + 1
    const necessidades = txt(o.necessidades)
    const observacoes = txt(o.observacoes)

    if (o.tipo === "passagem") {
      const modal = o.modal === "aerea" || o.modal === "rodoviaria" ? o.modal : null
      const origem = txt(o.origem)
      const destino = txt(o.destino)
      const data = txt(o.data)
      if (!modal) return { erro: `Item ${n}: escolha passagem aérea ou rodoviária.` }
      if (!origem || !destino) return { erro: `Item ${n}: informe a origem e o destino.` }
      if (!data || !DATA.test(data)) return { erro: `Item ${n}: informe a data da viagem.` }
      if (data < hoje) return { erro: `Item ${n}: a data da viagem já passou.` }
      const saidaHora = txt(o.saidaHora)
      const chegadaHora = txt(o.chegadaHora)
      if ((saidaHora && !HORA.test(saidaHora)) || (chegadaHora && !HORA.test(chegadaHora))) {
        return { erro: `Item ${n}: horário inválido.` }
      }
      const bagagemExtra = o.bagagemExtra === true
      itens.push({
        tipo: "passagem",
        modal,
        origem,
        destino,
        data,
        saidaCriterio: saidaHora ? (criterio(o.saidaCriterio) ?? "ate") : null,
        saidaHora,
        chegadaCriterio: chegadaHora ? (criterio(o.chegadaCriterio) ?? "ate") : null,
        chegadaHora,
        bagagemExtra,
        bagagemDescricao: bagagemExtra ? txt(o.bagagemDescricao) : null,
        necessidades,
        observacoes,
      })
    } else if (o.tipo === "hospedagem") {
      const cidade = txt(o.cidade)
      const checkin = txt(o.checkin)
      const checkout = txt(o.checkout)
      if (!cidade) return { erro: `Item ${n}: informe a cidade da hospedagem.` }
      if (!checkin || !DATA.test(checkin) || !checkout || !DATA.test(checkout)) {
        return { erro: `Item ${n}: informe as datas de check-in e check-out.` }
      }
      if (checkin < hoje) return { erro: `Item ${n}: o check-in já passou.` }
      if (checkout <= checkin) {
        return { erro: `Item ${n}: o check-out precisa ser depois do check-in.` }
      }
      itens.push({ tipo: "hospedagem", cidade, checkin, checkout, necessidades, observacoes })
    } else {
      return { erro: `Item ${n}: tipo desconhecido.` }
    }
  }
  return { itens }
}
