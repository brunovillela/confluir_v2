/**
 * Constantes do módulo Veículos compartilhadas entre servidor e cliente
 * (fora de db/veiculos.ts, que é server-only).
 */

import { formatarData } from "@/lib/formato"

// ── Horários e hodômetro ────────────────────────────────────────────────────

/**
 * Hodômetro em km inteiros. "48.350" é quarenta e oito mil — ler como número
 * decimal (48,35) gravava a quilometragem errada.
 */
export function parseHodometro(bruto: string): number | null {
  let v = bruto.replace(/\s/g, "")
  // Fração descartada: vírgula decimal ("48.350,5") ou ponto seguido de 1–2
  // dígitos ("48350.0", como sai de planilha). Ponto com 3 dígitos é milhar.
  if (v.includes(",")) v = v.split(",")[0]
  else v = v.replace(/\.\d{1,2}$/, "")
  const inteiro = v.replace(/\D/g, "")
  if (!inteiro) return null
  const n = Number(inteiro)
  return Number.isSafeInteger(n) ? n : null
}

/**
 * Acima desta média (km por hora com o veículo) o hodômetro da devolução pede
 * confirmação: um dígito a mais vira centenas de km rodados.
 */
export const KM_POR_HORA_LIMITE = 100

/**
 * Média de km por hora entre a saída e agora. A saída antiga sem hora conta do
 * início do dia (00h em São Paulo), o que só alarga o período. Menos de uma
 * hora conta como uma: 100 km na primeira hora ainda são normais.
 */
export function quilometragemAnormal(dados: {
  hodometroSaida: number | null
  hodometroEntrada: number | null
  dataSaida: string | null
  saidaEm: string | null
  agora?: Date
}): { kmRodados: number; horas: number; media: number } | null {
  const { hodometroSaida, hodometroEntrada } = dados
  if (hodometroSaida === null || hodometroEntrada === null || hodometroEntrada <= hodometroSaida) return null
  const inicio = dados.saidaEm ?? (dados.dataSaida ? `${dados.dataSaida}T00:00:00-03:00` : null)
  const t0 = inicio ? new Date(inicio).getTime() : NaN
  if (Number.isNaN(t0)) return null
  const horasReais = ((dados.agora ?? new Date()).getTime() - t0) / 3_600_000
  const horas = Math.max(1, horasReais)
  const kmRodados = hodometroEntrada - hodometroSaida
  const media = kmRodados / horas
  return media > KM_POR_HORA_LIMITE ? { kmRodados, horas, media } : null
}

/** "3 h", "1 dia e 4 h" — para o aviso de km anormal. */
export function duracaoBR(horas: number): string {
  const h = Math.round(horas)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  const resto = h % 24
  return `${d} ${d === 1 ? "dia" : "dias"}${resto ? ` e ${resto} h` : ""}`
}

/** Momento de uma saída/devolução: com hora quando se sabe, só a data quando não. */
export function momentoBR(data: string | null, em: string | null): string {
  if (em) {
    const d = new Date(em)
    if (!Number.isNaN(d.getTime())) {
      // formatarData leria o "AAAA-MM-DD" do ISO em UTC: 21h em São Paulo
      // viraria o dia seguinte.
      const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(d)
      return `${dia} às ${horaSP(em)}`
    }
  }
  return formatarData(data)
}

/** ISO → "HH:MM" no fuso de São Paulo (para o campo de hora). */
export function horaSP(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d)
}

/**
 * Data "AAAA-MM-DD" + hora "HH:MM" digitadas em São Paulo → ISO. Sem hora →
 * null. Monta com o fuso explícito (São Paulo não tem horário de verão desde
 * 2019): o `datetime-local` convertido pelo servidor deslocava 3 horas.
 */
export function instanteSP(data: string | null, hora: string | null): string | null {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null
  if (!hora || !/^\d{2}:\d{2}$/.test(hora)) return null
  return new Date(`${data}T${hora}:00-03:00`).toISOString()
}

export const SITUACOES_AGENDAMENTO = [
  "solicitada",
  "atendida",
  "retirada",
  "concluida",
  "negada",
  "cancelada",
  "expirada",
] as const

export type SituacaoAgendamento = (typeof SITUACOES_AGENDAMENTO)[number]

export const ROTULOS_SITUACAO_AGENDAMENTO: Record<SituacaoAgendamento, string> =
  {
    solicitada: "Solicitada",
    atendida: "Atendida (aguardando retirada)",
    retirada: "Veículo retirado",
    concluida: "Concluída",
    negada: "Negada",
    cancelada: "Cancelada",
    expirada: "Expirada",
  }

export const TIPOS_INFRACAO = [
  "Leve",
  "Média",
  "Grave",
  "Gravíssima",
] as const

export const SITUACOES_COBRANCA = ["pendente", "baixada", "isenta"] as const

export type SituacaoCobranca = (typeof SITUACOES_COBRANCA)[number]

export const ROTULOS_SITUACAO_COBRANCA: Record<SituacaoCobranca, string> = {
  pendente: "Cobrança pendente",
  baixada: "Baixada (recebida)",
  isenta: "Isenta (atividade sindical)",
}

export const FORMAS_COBRANCA = ["contracheque", "diaria"] as const

export type FormaCobranca = (typeof FORMAS_COBRANCA)[number]

export const ROTULOS_FORMA_COBRANCA: Record<FormaCobranca, string> = {
  contracheque: "Desconto em contracheque",
  diaria: "Desconto em diárias",
}

export const CATEGORIAS_CNH = [
  "A",
  "B",
  "AB",
  "C",
  "D",
  "E",
  "AC",
  "AD",
  "AE",
] as const

/** Combustíveis do legado + os básicos, para o cadastro da frota. */
export const COMBUSTIVEIS_VEICULO = [
  "Flex (Etanol e Gasolina)",
  "Flex (Etanol e Gasolina) + GNV",
  "Gasolina",
  "Etanol",
  "Diesel",
  "Elétrico",
  "Híbrido",
] as const

/** Tipos legados das ordens de pagamento do módulo (conferidos no banco). */
export const TIPO_ORDEM_MULTA = "Multa de trânsito"
export const TIPO_ORDEM_ALUGUEL = "Locação de veículos - Mensalidade"

/** Quantos endereços cabem na cópia do aviso de infração. */
export const MAX_EMAILS_COPIA_INFRACAO = 10

/**
 * Lista de e-mails digitada livremente (vírgula, ponto e vírgula, espaço ou
 * uma por linha) → endereços válidos, minúsculos e sem repetição, e os
 * trechos que não parecem e-mail (para avisar quem digitou).
 */
export function lerListaEmails(texto: string): { validos: string[]; invalidos: string[] } {
  const validos: string[] = []
  const invalidos: string[] = []
  for (const bruto of texto.split(/[\s,;]+/)) {
    const email = bruto.trim().toLowerCase()
    if (!email) continue
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalidos.push(bruto.trim())
    else if (!validos.includes(email)) validos.push(email)
  }
  return { validos, invalidos }
}
