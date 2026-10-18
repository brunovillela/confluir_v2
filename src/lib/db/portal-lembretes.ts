import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { lembretesPixVencendo, type ResultadoLembretesPix } from "@/lib/db/contribuicao-avisos"
import { lembretesVesperaEventos, type ResultadoVesperaEventos } from "@/lib/db/eventos-portal"
import { lembretesCartaOposicao, type ResultadoLembretesCarta } from "@/lib/db/oposicao"
import { lembretesPrazoAtendimento, type ResultadoLembretesPrazo } from "@/lib/db/portal-atendimentos"
import { lerConfigPortal } from "@/lib/db/portal-partes"
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
 *  - Pix vencendo em até N dias (A102; padrão 3, ajustável na Área do
 *    associado) — uma vez por cobrança;
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
 *
 * Área do associado (Filiados): cada etapa segue a parte de que fala — ver
 * `etapasPuladas`. A leitura é uma por entidade, pelo client de serviço e o
 * tenant da volta; falhando, tudo roda como antes.
 */

type Ambiente = { client: SupabaseClient; tenantId: string; contexto: ContextoEmail }

export type ResultadoLembretesDoPortal = {
  pix?: ResultadoLembretesPix
  votacaoUltimoDia?: ResultadoLembretesVotacao
  votacaoResultado?: ResultadoLembretesResultado
  eventosVespera?: ResultadoVesperaEventos
  cartaOposicao?: ResultadoLembretesCarta
  prazoAtendimento?: ResultadoLembretesPrazo
  /** Etapas que não rodaram nesta entidade por escolha da Área do associado. */
  puladas?: string[]
  /** "etapa: motivo" de cada etapa que lançou ou devolveu `erro`. */
  erros: string[]
}

type NomeEtapa = Exclude<keyof ResultadoLembretesDoPortal, "puladas" | "erros">

/**
 * O que a Área do associado tira do dia: a etapa da parte desabilitada, a
 * opção desligada e, com o portal fora do ar, tudo o que é só do associado.
 * Ficam sempre a carta da oposição (direito com prazo, aberto mesmo com o
 * portal fora do ar) e o prazo do atendimento, que também avisa a equipe —
 * a parte do associado cai sozinha em `avisarFiliado` quando o Atendimento
 * está desabilitado (e vai só para o sino com o portal fora do ar).
 */
async function etapasPuladas(amb: Ambiente): Promise<Set<NomeEtapa>> {
  const cfg = await lerConfigPortal({ client: amb.client, tenantId: amb.tenantId }).catch(() => null)
  const pular = new Set<NomeEtapa>()
  if (!cfg) return pular
  const { portal, contribuicao, votacao, eventos } = cfg.partes
  const foraDoAr = portal.estado === "desabilitada"
  if (foraDoAr || contribuicao.estado === "desabilitada" || contribuicao.opcoes.lembrete_pix_dias === 0) pular.add("pix")
  // Lembra de votar NO PORTAL: só com a cédula dele recebendo voto (portal e Votação habilitados).
  if (portal.estado !== "habilitada" || votacao.estado !== "habilitada" || !votacao.opcoes.lembrete_ultimo_dia) {
    pular.add("votacaoUltimoDia")
  }
  if (foraDoAr || votacao.estado === "desabilitada" || !votacao.opcoes.mostrar_resultado) pular.add("votacaoResultado")
  if (foraDoAr || eventos.estado === "desabilitada" || !eventos.opcoes.lembrete_vespera) pular.add("eventosVespera")
  return pular
}

export async function lembretesDoPortal(amb: Ambiente): Promise<ResultadoLembretesDoPortal> {
  const r: ResultadoLembretesDoPortal = { erros: [] }
  const pular = await etapasPuladas(amb)
  // Uma etapa por chave do resultado; allSettled: a que lança não apaga a contagem das outras.
  const todas = [
    ["pix", () => lembretesPixVencendo(amb)],
    ["votacaoUltimoDia", () => lembretesUltimoDiaVotacao(amb)],
    ["votacaoResultado", () => lembretesResultadoVotacao(amb)],
    ["eventosVespera", () => lembretesVesperaEventos(amb)],
    ["cartaOposicao", () => lembretesCartaOposicao(amb)],
    ["prazoAtendimento", () => lembretesPrazoAtendimento(amb)],
  ] as const
  const etapas = todas.filter(([nome]) => !pular.has(nome))
  if (pular.size > 0) r.puladas = [...pular]
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
