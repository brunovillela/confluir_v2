/**
 * Estado do direito à hospedagem (achado A38) — regras PURAS, usadas pela
 * página (servidor) e pelo formulário (navegador) para dizer ANTES de enviar
 * o que a action recusaria depois: a cota do período e as faltas. As frases
 * saem das mesmas funções que a conferência do servidor usa
 * (hospedagem-condicoes-constantes.ts e hospedagem-garantida-constantes.ts),
 * não de uma cópia — o aviso na tela e o erro da action dizem a mesma coisa.
 */
import type { CotaHospedagem, FaltasHospedagem } from "@/lib/db/hospedagem-garantida"
import { formatarMoeda } from "@/lib/formato"
import {
  CONDICOES_HOSPEDAGEM_PADRAO,
  avaliarCondicoesHospedagem,
  janelaDoPeriodo,
} from "@/lib/hospedagem-condicoes-constantes"
import { avaliarNaoComparecimento } from "@/lib/hospedagem-garantida-constantes"

/** Cupons que já contam no período do check-in. */
export function usadosNoPeriodo(cota: CotaHospedagem, checkIn: string): number {
  const { inicio, fim } = janelaDoPeriodo(checkIn, cota.periodo)
  return cota.checkIns.filter((d) => d >= inicio && d < fim).length
}

/** A recusa da cota para este check-in, com a frase da action — ou null. */
export function motivoDaCota(cota: CotaHospedagem | null, checkIn: string): string | null {
  if (!cota) return null
  const r = avaliarCondicoesHospedagem(
    {
      ...CONDICOES_HOSPEDAGEM_PADRAO,
      limitarQuantidade: true,
      quantidadeMaxima: cota.limite,
      quantidadePeriodo: cota.periodo,
    },
    { vinculosAbertos: [], cuponsNoPeriodo: usadosNoPeriodo(cota, checkIn), naListaDeBeneficiarios: true },
    () => ""
  )
  return r.ok ? null : r.motivo
}

/** A recusa por não comparecimento para este check-in (só demanda garantida). */
export function motivoDasFaltas(
  faltas: FaltasHospedagem | null,
  checkIn: string,
  agora: Date
): string | null {
  if (!faltas) return null
  const r = avaliarNaoComparecimento(
    faltas.regra,
    faltas.historico,
    faltas.liberadoEm ? new Date(faltas.liberadoEm) : null,
    checkIn,
    agora
  )
  return r.ok ? null : r.motivo
}

/**
 * Faltas que barram QUALQUER data (suspensão em curso, direito desabilitado).
 * "Consumir o período" depende do mês do check-in: fica para o formulário.
 */
export function bloqueioPorFaltas(
  faltas: FaltasHospedagem | null,
  hoje: string,
  agora: Date
): string | null {
  if (!faltas || faltas.regra.penalidade === "consumir_periodo") return null
  return motivoDasFaltas(faltas, hoje, agora)
}

/** "outubro de 2026" ou "2026". */
export function rotuloDoPeriodo(data: string, periodo: CotaHospedagem["periodo"]): string {
  const [ano, mes] = data.split("-").map(Number)
  if (periodo === "ano") return String(ano)
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(ano, mes - 1, 1))
  )
}

/** "1 de 2 cupons usados em outubro de 2026". */
export function resumoDaCota(cota: CotaHospedagem, data: string): string {
  const usados = usadosNoPeriodo(cota, data)
  const cupons = cota.limite === 1 ? "cupom usado" : "cupons usados"
  return `${usados} de ${cota.limite} ${cupons} em ${rotuloDoPeriodo(data, cota.periodo)}`
}

/**
 * "1 pessoa no quarto: R$ 120,00 · 2 pessoas: R$ 80,00" — ou null sem
 * tarifa cadastrada (quem mostra diz "confirme com o sindicato"; nunca se
 * deduz "sem custo" da falta de tarifa).
 */
export function linhaDasTarifas(tarifas: { pessoas: number; valor: number }[]): string | null {
  if (tarifas.length === 0) return null
  return tarifas
    .map((t, i) =>
      i === 0
        ? `${t.pessoas} ${t.pessoas === 1 ? "pessoa" : "pessoas"} no quarto: ${formatarMoeda(t.valor)}`
        : `${t.pessoas} ${t.pessoas === 1 ? "pessoa" : "pessoas"}: ${formatarMoeda(t.valor)}`
    )
    .join(" · ")
}
