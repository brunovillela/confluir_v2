import "server-only"

import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import {
  carregarBasePonto,
  comparacaoAnos,
  OCORRENCIAS,
  rotuloCompetenciaPonto,
  type ComparacaoAnos,
} from "@/lib/db/ponto-analise"
import { listarIsencoesPonto, type IsencaoPonto } from "@/lib/db/ponto-isencoes"
import type { FaixasHE } from "@/lib/faixas-he"

/**
 * RELATÓRIO DO PONTO POR FUNCIONÁRIO (16/11/2026) — o que a tela do
 * funcionário no Ponto mostra, num PDF para arquivar ou levar a uma conversa:
 * a comparação entre anos, os alertas de cada ano, o mês a mês (horas,
 * banco, ausências, ocorrências das marcações) e as isenções de registro.
 */

export type MesRelatorioPonto = {
  rotulo: string
  he70: number
  he100: number
  pagas: number
  saldo70: number
  saldo100: number
  atestados: number
  diasAtestado: number
  faltasJustificadas: number
  faltasInjustificadas: number
  /** null = marcações não lidas (sem espelho, escaneado ou erro). */
  ocorrencias: number | null
}

export type RelatorioPontoFuncionario = {
  funcionario: {
    nome: string
    matricula: string | null
    cargo: string | null
    departamento: string | null
    admissao: string | null
    demissao: string | null
  }
  faixas: FaixasHE
  comparacao: ComparacaoAnos
  /** Do mais recente ao mais antigo. */
  anos: { ano: string; alertas: string[]; meses: MesRelatorioPonto[] }[]
  isencoes: IsencaoPonto[]
  geradoEm: string
}

/** null quando o funcionário não é da área do Pessoal. */
export async function relatorioPontoFuncionario(usuarioId: string): Promise<RelatorioPontoFuncionario | null> {
  const [funcionario, base, isencoes] = await Promise.all([
    funcionarioDaArea(usuarioId),
    carregarBasePonto(),
    listarIsencoesPonto(usuarioId),
  ])
  if (!funcionario) return null
  const comparacao = comparacaoAnos(base, { funcionarioId: usuarioId })
  const registros = base.registros
    .filter((r) => r.funcionarioId === usuarioId)
    .sort((a, b) => a.competencia.localeCompare(b.competencia))
  const anos = comparacao.anos.map((a) => ({
    ano: a.ano,
    alertas: a.alertas,
    meses: registros
      .filter((r) => r.competencia.startsWith(a.ano))
      .map((r) => {
        const aus = base.ausencias.get(`${usuarioId}|${r.competencia}`)
        return {
          rotulo: rotuloCompetenciaPonto(r.competencia),
          he70: r.he70,
          he100: r.he100,
          pagas: r.pagas,
          saldo70: r.saldo70,
          saldo100: r.saldo100,
          atestados: aus?.atestados ?? 0,
          diasAtestado: aus?.diasAtestado ?? 0,
          faltasJustificadas: aus?.justificadas ?? 0,
          faltasInjustificadas: aus?.injustificadas ?? 0,
          ocorrencias: r.lido && r.jornada ? OCORRENCIAS.reduce((s, o) => s + r.jornada![o.id].length, 0) : null,
        }
      }),
  }))
  return {
    funcionario: {
      nome: funcionario.nome,
      matricula: funcionario.matricula,
      cargo: funcionario.cargo,
      departamento: funcionario.departamento,
      admissao: funcionario.admissao,
      demissao: funcionario.demissao,
    },
    faixas: base.faixas,
    comparacao,
    anos,
    isencoes,
    geradoEm: new Date().toISOString(),
  }
}
