import "server-only"

import { unstable_rethrow } from "next/navigation"
import { cache } from "react"
import * as Sentry from "@sentry/nextjs"

import { cpfConfiavel } from "@/lib/cpf"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { registrosDoCpf } from "@/lib/db/filiado-portal"
import type { PendenciaAvaliacao } from "@/lib/db/hospedagem-avaliacoes"
import { meusAtendimentos, type Atendimento } from "@/lib/db/portal-atendimentos"
import { contarAvisosNaoLidos, parteDoAviso, type AvisoDoFiliado } from "@/lib/db/portal-avisos"
import { configDoPortal } from "@/lib/db/portal-partes"
import { CHAVES_PARTES, opcoesPadrao, type ChaveParte, type EstadoParte } from "@/lib/portal-partes-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * O que o Início do portal lê (onda 2 da avaliação de 11/10/2026: A2, A33,
 * A69, A96). Só leitura — o Início nunca marca aviso como lido (quem marca é
 * a lista de Avisos, para o sino e o Início contarem a mesma coisa) e, no
 * "Ver como filiado", não gera nada.
 *
 * Cada bloco da página carrega sozinho (A69): uma consulta que falha vira o
 * estado vazio daquele bloco e vai para o log/Sentry, sem derrubar o resto.
 */

/**
 * Roda a carga de um bloco do Início; se falhar, registra e devolve a
 * reserva. Recebe uma função (e não a promessa) para pegar também o erro
 * lançado antes da primeira espera. Os "erros" de controle do Next
 * (redirect, notFound, uso dinâmico) seguem adiante — não são falha do bloco.
 */
export async function seguro<T>(bloco: string, carregar: () => Promise<T>, reserva: T): Promise<T> {
  try {
    return await carregar()
  } catch (e) {
    unstable_rethrow(e)
    console.error(`início do portal (${bloco}):`, e instanceof Error ? e.message : e)
    Sentry.captureException(e, { tags: { area: "portal-inicio", bloco } })
    return reserva
  }
}

/**
 * Espera no máximo `ms`; passou disso, segue com a reserva. A consulta
 * original continua correndo e, se terminar, alimenta o cache dela para a
 * próxima abertura — é o caso das notícias do site da entidade, que não têm
 * prazo próprio (lib/db/painel.ts).
 */
export function noPrazo<T>(bloco: string, promessa: Promise<T>, ms: number, reserva: T): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined
  const prazo = new Promise<T>((resolve) => {
    relogio = setTimeout(() => {
      console.warn(`início do portal (${bloco}): passou de ${ms} ms`)
      resolve(reserva)
    }, ms)
  })
  return Promise.race([promessa, prazo]).finally(() => clearTimeout(relogio))
}

/** Ids dos registros do CPF — uma consulta por abertura, dividida entre os blocos. */
export const registrosDaPessoa = cache((cpf: string) => registrosDoCpf(cpf))

// ── Área do associado (Filiados › Área do associado) ─────────────────────────

/**
 * O que o Início precisa saber das partes do portal: cada bloco segue a parte
 * de onde vem — desabilitada, o bloco some (e nem é consultado); suspensa (ou
 * o portal inteiro em modo de consulta), os botões que gravam saem. A mesma
 * leitura da casca (configDoPortal, uma por requisição). Na dúvida (leitura
 * que falhou), tudo habilitado com as opções padrão: o Início de sempre.
 */
export type PartesDoInicio = {
  estados: Record<ChaveParte, EstadoParte>
  /** Recado da entidade no topo ("" = nenhum). */
  recado: string
  /** O que acontece com quem está em atraso (Contribuição). */
  textoAtraso: string
  /** Agenda de atividades no Início (opção da Agenda). */
  agendaNoInicio: boolean
}

export async function partesDoInicio(): Promise<PartesDoInicio> {
  const cfg = await configDoPortal().catch(() => null)
  const estados = Object.fromEntries(CHAVES_PARTES.map((c) => [c, cfg?.partes[c].estado ?? "habilitada"])) as Record<
    ChaveParte,
    EstadoParte
  >
  return {
    estados,
    recado: cfg?.partes.inicio.opcoes.recado ?? "",
    textoAtraso: cfg?.partes.contribuicao.opcoes.texto_atraso ?? opcoesPadrao("contribuicao").texto_atraso,
    agendaNoInicio: cfg?.partes.agenda.opcoes.mostrar_no_inicio ?? true,
  }
}

/** A parte aparece no Início (não está desabilitada). */
export function aparece(partes: PartesDoInicio, chave: ChaveParte): boolean {
  return partes.estados[chave] !== "desabilitada"
}

/**
 * Os botões que gravam na parte aparecem: o portal e a parte habilitados. Com
 * a parte suspensa ou o portal em modo de consulta, a ação seria recusada no
 * servidor (bloqueioDaParte) — o Início nem a oferece.
 */
export function aceitaAcao(partes: PartesDoInicio, chave: ChaveParte): boolean {
  return partes.estados.portal === "habilitada" && partes.estados[chave] === "habilitada"
}

/** Partes desabilitadas (sem o portal inteiro, que nem deixa o Início abrir). */
export function desabilitadasNoInicio(partes: PartesDoInicio): ChaveParte[] {
  return CHAVES_PARTES.filter((c) => c !== "portal" && partes.estados[c] === "desabilitada")
}

// ── Novidades para você (A33 + A96) ──────────────────────────────────────────

/**
 * Avisos NÃO lidos mais recentes e quantos são ao todo. `avisosDoFiliado`
 * corta pelo limite antes de olhar a leitura (poderia devolver só lidos);
 * aqui o filtro vem antes do corte. Sem a tabela, vazio.
 *
 * `ocultar`: partes desabilitadas em Filiados › Área do associado — o aviso
 * que leva a uma delas sai (busca-se uma folga para o corte não esvaziar a
 * lista). A parte do aviso é a mesma régua do sino e da lista de Avisos
 * (`parteDoAviso`: a do link e, na falta, a do tipo de uma parte só). Com
 * parte oculta, o total é o do sino (contarAvisosNaoLidos, a mesma régua
 * sobre todos os não lidos, e a mesma leitura da casca nesta requisição).
 */
export async function avisosNaoLidos(
  cpf: string,
  limite = 8,
  ocultar: readonly ChaveParte[] = []
): Promise<{ avisos: AvisoDoFiliado[]; total: number }> {
  const chave = cpfConfiavel(cpf)
  if (!chave) return { avisos: [], total: 0 }
  const admin = await createAdminClient()
  const { data, error, count } = await admin
    .from("portal_avisos")
    .select("id, evento, texto, link, lida_em, created_at", { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cpf", chave)
    .is("lida_em", null)
    .order("created_at", { ascending: false })
    .limit(ocultar.length > 0 ? Math.min(limite * 3, 60) : limite)
  if (error) {
    if (esquemaAusente(error)) return { avisos: [], total: 0 }
    throw new Error(`avisos não lidos: ${error.message}`)
  }
  const todos = (data ?? []).map((a) => ({
    id: String(a.id),
    evento: String(a.evento),
    texto: String(a.texto),
    link: texto(a.link),
    lidaEm: null,
    criadoEm: String(a.created_at),
  }))
  const visiveis = todos.filter((a) => {
    const parte = parteDoAviso(a.link, a.evento)
    return !parte || !ocultar.includes(parte)
  })
  const avisos = visiveis.slice(0, limite)
  const total =
    ocultar.length > 0
      ? await contarAvisosNaoLidos(cpf).catch(() => visiveis.length)
      : (count ?? todos.length)
  return { avisos, total: Math.max(total, avisos.length) }
}

/**
 * Solicitações em que a entidade respondeu e a vez é da pessoa (situação
 * "respondida"), a resposta mais nova primeiro.
 */
export async function respostasAguardando(cpf: string): Promise<Atendimento[]> {
  const { lista } = await meusAtendimentos(cpf)
  return lista
    .filter((a) => a.situacao === "respondida")
    .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))
}

// ── Pendências ───────────────────────────────────────────────────────────────

/**
 * Avaliações de hospedagem já pendentes, SEM gerar as que faltam — para o
 * "Ver como filiado", em que nada grava. (`pendenciasDaPessoa` cria antes as
 * pendências dos check-outs passados; o filiado logado continua por lá.) O
 * token do link de avaliação não sai daqui: quem avalia é o filiado.
 */
export async function avaliacoesPendentesSoLeitura(registros: string[]): Promise<PendenciaAvaliacao[]> {
  if (!registros.length) return []
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("hospedagem_avaliacoes")
    .select("id, hotel_id, check_in, check_out")
    .eq("emp_proprietaria_id", emp)
    .eq("situacao", "pendente")
    .in("filiado_id", registros)
    .order("check_out")
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`avaliações pendentes: ${error.message}`)
  }
  if (!data?.length) return []
  const hotelIds = [...new Set(data.map((a) => String(a.hotel_id)))]
  const { data: hoteis } = await admin.from("hospedagem_hotel").select("id, nome").eq("emp_proprietaria_id", emp).in("id", hotelIds)
  const nomes = new Map((hoteis ?? []).map((h) => [String(h.id), texto(h.nome)]))
  return data.map((a) => ({
    token: `visualizacao-${a.id}`,
    hotelNome: nomes.get(String(a.hotel_id)) ?? null,
    checkIn: texto(a.check_in),
    checkOut: String(a.check_out),
  }))
}
