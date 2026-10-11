"use server"

import { requirePermissao } from "@/lib/auth"
import {
  AVISOS_POR_VEZ,
  avisarFaltasDaRemessa,
  type ConferenciaFaltas,
  conferirFaltasDaRemessa,
  type MotivoSemAviso,
} from "@/lib/db/contribuicao-avisos"

/**
 * "Contribuições não localizadas" na página da remessa (onda 2, A20): dois
 * passos, nada automático. A conferência só lê; o aviso pede confirmação na
 * tela e refaz a conferência na hora. Mesma permissão da página de receitas.
 * A tela recebe só o que mostra — nada de CPF nem e-mail.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Quantas pessoas a lista curta mostra; o resto vira "e mais N". */
const LISTA_CURTA = 30

export type FaltaNaTela = {
  filiacaoId: string
  nome: string | null
  matricula: string | null
  fontes: string[]
  semAviso: MotivoSemAviso | null
}

export type ConferenciaNaTela = {
  competencia: string
  naoSeAplica: string | null
  fontesConferidas: number
  total: number
  /** Com CPF, sem suspensão e ainda sem o aviso desta competência. */
  aAvisar: number
  jaAvisados: number
  semCpf: number
  comSuspensao: number
  porPix: number
  /** Teto de avisos por clique (o resto sai no clique seguinte). */
  porVez: number
  /** Primeiro quem vai receber o aviso, depois os demais — por nome. */
  lista: FaltaNaTela[]
}

export type AvisoNaTela = {
  avisados: number
  porEmail: number
  falhas: number
  restantes: number
}

function paraTela(c: ConferenciaFaltas): ConferenciaNaTela {
  const conta = (m: MotivoSemAviso | null) => c.emFalta.filter((f) => f.semAviso === m).length
  const ordenada = [...c.emFalta.filter((f) => f.semAviso === null), ...c.emFalta.filter((f) => f.semAviso !== null)]
  return {
    competencia: c.competencia,
    naoSeAplica: c.naoSeAplica,
    fontesConferidas: c.fontesConferidas,
    total: c.emFalta.length,
    aAvisar: conta(null),
    jaAvisados: conta("ja_avisado"),
    semCpf: conta("sem_cpf"),
    comSuspensao: conta("suspensao"),
    porPix: c.porPix,
    porVez: AVISOS_POR_VEZ,
    lista: ordenada.slice(0, LISTA_CURTA).map((f) => ({
      filiacaoId: f.filiacaoId,
      nome: f.nome,
      matricula: f.matricula,
      fontes: f.fontes,
      semAviso: f.semAviso,
    })),
  }
}

export async function conferirFaltas(remessaId: string): Promise<{ erro: string } | { conferencia: ConferenciaNaTela }> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  if (!UUID.test(remessaId)) return { erro: "Remessa inválida." }
  const r = await conferirFaltasDaRemessa(remessaId)
  if ("erro" in r) return { erro: r.erro }
  return { conferencia: paraTela(r) }
}

export async function avisarFaltas(
  remessaId: string
): Promise<{ erro: string } | { conferencia: ConferenciaNaTela; aviso: AvisoNaTela }> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  if (!UUID.test(remessaId)) return { erro: "Remessa inválida." }
  const r = await avisarFaltasDaRemessa(remessaId)
  if ("erro" in r) return { erro: r.erro }
  return {
    conferencia: paraTela(r.conferencia),
    aviso: { avisados: r.avisados, porEmail: r.porEmail, falhas: r.falhas, restantes: r.restantes },
  }
}
