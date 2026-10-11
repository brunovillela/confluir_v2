import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { lembretesPixVencendo, type ResultadoLembretesPix } from "@/lib/db/contribuicao-avisos"
import { lembretesVesperaEventos, type ResultadoVesperaEventos } from "@/lib/db/eventos-portal"
import { lembretesCartaOposicao, type ResultadoLembretesCarta } from "@/lib/db/oposicao"
import { lembretesPrazoAtendimento, type ResultadoLembretesPrazo } from "@/lib/db/portal-atendimentos"
import {
  lembretesResultadoVotacao,
  lembretesUltimoDiaVotacao,
  type ResultadoLembretesResultado,
  type ResultadoLembretesVotacao,
} from "@/lib/db/votacao-aviso"
import { type ContextoEmail } from "@/lib/email"

/**
 * LEMBRETES DO PORTAL DO ASSOCIADO (avaliação do portal, onda 2): as rotinas
 * diárias que avisam o associado no sino e por e-mail (conforme a preferência
 * de cada evento). Rodam no tick diário de pendências (/api/pendencias/tick),
 * uma entidade por vez, FORA de requisição: service client, entidade e
 * identidade do e-mail vão explícitos.
 *
 *  - Pix vencendo em até 3 dias (A102) — uma vez por cobrança;
 *  - votação: últimas 24 h para quem ainda não votou e reserva do aviso
 *    "Resultado publicado" (A49) — uma vez por pessoa e assembleia;
 *  - eventos: lembrete da véspera (A122) — uma vez por inscrição e data;
 *  - oposição: carta assinada ainda pendente perto do fim do prazo (A16) —
 *    uma vez por oposição;
 *  - atendimento: prazo de resposta estourado (A121), à equipe e ao associado.
 *
 * Todas são idempotentes: rodar de novo no mesmo dia não repete aviso. Uma
 * etapa que lança ou devolve `erro` não impede as outras. A hospedagem (não
 * comparecimento e oferta da lista de espera) roda no tick dela.
 */

type Ambiente = { client: SupabaseClient; tenantId: string; contexto: ContextoEmail }

export type ResultadoLembretesDoPortal = {
  pix?: ResultadoLembretesPix
  votacaoUltimoDia?: ResultadoLembretesVotacao
  votacaoResultado?: ResultadoLembretesResultado
  eventosVespera?: ResultadoVesperaEventos
  cartaOposicao?: ResultadoLembretesCarta
  prazoAtendimento?: ResultadoLembretesPrazo
  /** "etapa: motivo" de cada etapa que lançou ou devolveu `erro`. */
  erros: string[]
}

export async function lembretesDoPortal(amb: Ambiente): Promise<ResultadoLembretesDoPortal> {
  const r: ResultadoLembretesDoPortal = { erros: [] }
  // Uma etapa por chave do resultado; allSettled: a que lança não apaga a contagem das outras.
  const etapas = [
    ["pix", () => lembretesPixVencendo(amb)],
    ["votacaoUltimoDia", () => lembretesUltimoDiaVotacao(amb)],
    ["votacaoResultado", () => lembretesResultadoVotacao(amb)],
    ["eventosVespera", () => lembretesVesperaEventos(amb)],
    ["cartaOposicao", () => lembretesCartaOposicao(amb)],
    ["prazoAtendimento", () => lembretesPrazoAtendimento(amb)],
  ] as const
  const feitos = await Promise.allSettled(etapas.map(([, rodar]) => rodar()))
  feitos.forEach((feito, i) => {
    const nome = etapas[i][0]
    if (feito.status === "rejected") {
      const motivo = feito.reason instanceof Error ? feito.reason.message : String(feito.reason)
      r.erros.push(`${nome}: ${motivo}`)
      return
    }
    Object.assign(r, { [nome]: feito.value })
    if (feito.value.erro) r.erros.push(`${nome}: ${feito.value.erro}`)
  })
  return r
}
