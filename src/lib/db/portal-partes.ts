import "server-only"

import { cache } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"

import { esquemaAusente, hojeSP } from "@/lib/db/comum"
import {
  CHAVES_PARTES,
  definicaoDaParte,
  ehChaveParte,
  estadoEfetivo,
  estadosPermitidos,
  mensagemDaSituacao,
  normalizarOpcoes,
  opcoesPadrao,
  rotaDoMenu,
  type ChaveParte,
  type EstadoParte,
  type OpcoesDe,
} from "@/lib/portal-partes-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Área do associado: o que cada entidade escolheu para as partes do portal
 * (tabela portal_partes, criada na linha de base das migrações,
 * supabase/migrations/20261018000000_linha_de_base.sql; catálogo em
 * src/lib/portal-partes-constantes.ts).
 *
 * Regra de ouro: na dúvida, a parte vale. Sem a tabela, sem linha ou com a
 * leitura falhando, tudo fica habilitado com as opções padrão — o portal
 * continua exatamente como era.
 *
 * Dentro de requisição: configDoPortal() (React cache, uma leitura dividida
 * entre a casca, a página e as ações). Fora dela (ticks), passe o client de
 * serviço e o tenant: tenantAtual() ali é o do .env, não o do laço (A19).
 */

type Ambiente = { client?: SupabaseClient; tenantId?: string }

export type SituacaoParte = {
  /** O que vale hoje (o retorno previsto já alcançado devolve "habilitada"). */
  estado: EstadoParte
  /** O que está gravado (o painel mostra os dois). */
  estadoGravado: EstadoParte
  mensagem: string | null
  retornoPrevisto: string | null
  atualizadaEm: string | null
  atualizadaPor: string | null
}

export type ConfigParte<K extends ChaveParte> = SituacaoParte & { opcoes: OpcoesDe<K> }

export type ConfigPortal = {
  /** false: falta rodar o SQL (tudo segue habilitado). */
  disponivel: boolean
  /**
   * false: a leitura falhou ou falta a tabela; as partes valem pelo padrão,
   * mas o primeiro acesso não trava e o painel não grava por cima.
   */
  lida: boolean
  partes: { [K in ChaveParte]: ConfigParte<K> }
}

function padraoDaParte<K extends ChaveParte>(chave: K): ConfigParte<K> {
  return {
    estado: "habilitada",
    estadoGravado: "habilitada",
    mensagem: null,
    retornoPrevisto: null,
    atualizadaEm: null,
    atualizadaPor: null,
    opcoes: opcoesPadrao(chave),
  }
}

function configPadrao(disponivel: boolean, lida: boolean): ConfigPortal {
  const partes = {} as Record<ChaveParte, ConfigParte<ChaveParte>>
  for (const chave of CHAVES_PARTES) partes[chave] = padraoDaParte(chave)
  return { disponivel, lida, partes: partes as ConfigPortal["partes"] }
}

const ESTADOS: readonly string[] = ["habilitada", "suspensa", "desabilitada"]

export async function lerConfigPortal(amb: Ambiente = {}): Promise<ConfigPortal> {
  const client = amb.client ?? (await createAdminClient())
  const tenantId = amb.tenantId ?? (await tenantAtual())
  const { data, error } = await client
    .from("portal_partes")
    .select("parte, estado, mensagem, retorno_previsto, opcoes, atualizada_por, updated_at, created_at")
    .eq("emp_proprietaria_id", tenantId)
  if (error) {
    if (!esquemaAusente(error)) console.error("portal_partes:", error.message)
    return configPadrao(!esquemaAusente(error), false)
  }
  const config = configPadrao(true, true)
  const hoje = hojeSP()
  const partes = config.partes as Record<ChaveParte, ConfigParte<ChaveParte>>
  for (const linha of data ?? []) {
    const chave = linha.parte as unknown
    if (!ehChaveParte(chave)) continue
    const def = definicaoDaParte(chave)
    // Estado que a parte não admite (catálogo mudou depois de gravado) vale como habilitada.
    const gravado = ESTADOS.includes(linha.estado as string) ? (linha.estado as EstadoParte) : "habilitada"
    const estado = estadosPermitidos(def).includes(gravado) ? gravado : "habilitada"
    const retornoPrevisto = (linha.retorno_previsto as string | null) ?? null
    partes[chave] = {
      estado: estadoEfetivo(estado, retornoPrevisto, hoje),
      estadoGravado: estado,
      mensagem: ((linha.mensagem as string | null) ?? "").trim() || null,
      retornoPrevisto,
      atualizadaEm: (linha.updated_at as string | null) ?? (linha.created_at as string | null) ?? null,
      atualizadaPor: (linha.atualizada_por as string | null) ?? null,
      opcoes: normalizarOpcoes(chave, linha.opcoes),
    }
  }
  return config
}

/** Uma leitura por requisição, dividida entre casca, Início, páginas e ações. */
export const configDoPortal = cache((): Promise<ConfigPortal> => lerConfigPortal())

function ler(amb?: Ambiente): Promise<ConfigPortal> {
  return amb ? lerConfigPortal(amb) : configDoPortal()
}

export async function configDaParte<K extends ChaveParte>(chave: K, amb?: Ambiente): Promise<ConfigParte<K>> {
  return (await ler(amb)).partes[chave] as ConfigParte<K>
}

export async function opcoesDaParte<K extends ChaveParte>(chave: K, amb?: Ambiente): Promise<OpcoesDe<K>> {
  return (await configDaParte(chave, amb)).opcoes
}

/** O estado que vale hoje (só da parte; o do portal inteiro é a parte "portal"). */
export async function estadoDaParte(chave: ChaveParte, amb?: Ambiente): Promise<EstadoParte> {
  return (await configDaParte(chave, amb)).estado
}

/** Partes desabilitadas hoje (sem a parte "portal"). */
export async function partesDesabilitadas(amb?: Ambiente): Promise<ChaveParte[]> {
  const cfg = await ler(amb)
  return CHAVES_PARTES.filter((c) => c !== "portal" && cfg.partes[c].estado === "desabilitada")
}

/** Rotas do menu das partes desabilitadas — o que sai da lateral, da barra e do Início. */
export async function rotasDesabilitadas(amb?: Ambiente): Promise<string[]> {
  return (await partesDesabilitadas(amb)).map(rotaDoMenu).filter((r): r is string => r !== null)
}

/**
 * Partes que o primeiro acesso pendente não trava: os caminhos de cumpri-lo
 * (Meu cadastro, Privacidade e dados), os direitos com prazo (Minha filiação,
 * contribuição assistencial), os avisos e a Ajuda — as mesmas rotas abertas
 * do portão (ROTAS_LIVRES_DO_PRIMEIRO_ACESSO).
 */
const LIVRES_DO_PRIMEIRO_ACESSO: readonly ChaveParte[] = [
  "portal",
  "primeiro_acesso",
  "cadastro",
  "lgpd",
  "desfiliacao",
  "oposicao",
  "avisos",
  "ajuda",
]

/**
 * A recusa das ações que GRAVAM em nome do associado: o texto para devolver
 * como erro, ou null quando pode gravar. Confere o portal inteiro (suspenso
 * = modo de consulta; desabilitado = fora do ar), a parte e, dentro de
 * requisição (sem `amb`), o primeiro acesso pendente da sessão real do
 * portal (src/lib/db/portal-primeiro-acesso.ts, por import dinâmico: aquele
 * módulo lê a configuração por aqui).
 *
 * Não use em: Sair, desligar avisos/comunicados (opt-out), contribuição
 * assistencial (direito com prazo) e cancelamentos que evitam punição — cada
 * ação decide; ver o catálogo.
 *
 * `ignorarPrimeiroAcesso`: pula só a conferência do primeiro acesso (o
 * portal e a parte continuam valendo). Para as rotas públicas fora de
 * /portal, que o portão não alcança (a oferta da lista de espera), e para o
 * pedido de desfiliação pelo Atendimento (direito do associado).
 */
export async function bloqueioDaParte(
  chave: ChaveParte,
  amb?: Ambiente,
  op: { ignorarPrimeiroAcesso?: boolean } = {}
): Promise<string | null> {
  const cfg = await ler(amb)
  const geral = cfg.partes.portal
  if (geral.estado !== "habilitada") return mensagemDaSituacao("portal", geral)
  if (chave === "portal") return null
  const parte = cfg.partes[chave]
  if (parte.estado !== "habilitada") return mensagemDaSituacao(chave, parte)
  if (
    !amb &&
    !op.ignorarPrimeiroAcesso &&
    cfg.lida &&
    cfg.partes.primeiro_acesso.opcoes.exigir &&
    !LIVRES_DO_PRIMEIRO_ACESSO.includes(chave)
  ) {
    const { bloqueioDoPrimeiroAcesso } = await import("@/lib/db/portal-primeiro-acesso")
    return bloqueioDoPrimeiroAcesso()
  }
  return null
}

/** Só o portal inteiro: para a entrada (desabilitado barra o login). */
export async function situacaoDoPortal(amb?: Ambiente): Promise<SituacaoParte> {
  return (await ler(amb)).partes.portal
}

/** Para o cartão do hub em Filiados. */
export async function resumoDoPortal(): Promise<{
  disponivel: boolean
  portal: EstadoParte
  suspensas: number
  desabilitadas: number
}> {
  const cfg = await configDoPortal()
  const outras = CHAVES_PARTES.filter((c) => c !== "portal").map((c) => cfg.partes[c].estado)
  return {
    disponivel: cfg.disponivel,
    portal: cfg.partes.portal.estado,
    suspensas: outras.filter((e) => e === "suspensa").length,
    desabilitadas: outras.filter((e) => e === "desabilitada").length,
  }
}

// ── Escrita (painel) ────────────────────────────────────────────────────────

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Grava o estado e as opções de uma parte (upsert por entidade + parte).
 * Valida aqui o que é regra, não tela: estado permitido pela parte, retorno
 * no futuro e Atendimento + O sindicato nunca desabilitados juntos.
 */
export async function salvarParte(p: {
  parte: ChaveParte
  estado: EstadoParte
  mensagem: string | null
  retornoPrevisto: string | null
  opcoes: unknown
  usuarioId: string
}): Promise<{ erro?: string; campo?: string }> {
  const def = definicaoDaParte(p.parte)
  if (!estadosPermitidos(def).includes(p.estado)) {
    return { erro: `${def.titulo} não pode ficar ${p.estado}.`, campo: "estado" }
  }
  const habilitada = p.estado === "habilitada"
  const retorno = habilitada ? null : p.retornoPrevisto?.trim() || null
  if (retorno && (!DATA_ISO.test(retorno) || retorno <= hojeSP())) {
    return { erro: "A volta automática precisa ser uma data a partir de amanhã.", campo: "retorno_previsto" }
  }
  const mensagem = habilitada ? null : p.mensagem?.trim().slice(0, 600) || null

  const atual = await lerConfigPortal()
  if (!atual.disponivel) return { erro: "O banco ainda não tem a tabela da Área do associado (portal_partes): falta aplicar a migração." }
  // Leitura que falhou devolve o padrão: gravar por cima religaria, sem aviso,
  // uma parte desligada, e as regras abaixo seriam conferidas contra o padrão.
  if (!atual.lida) {
    return { erro: "Não foi possível ler a configuração atual do portal. Recarregue a página e tente de novo." }
  }
  if (p.estado === "desabilitada" && (p.parte === "atendimento" || p.parte === "sindicato")) {
    const outra = p.parte === "atendimento" ? "sindicato" : "atendimento"
    if (atual.partes[outra].estado === "desabilitada") {
      return {
        erro: "Atendimento e O sindicato não podem ficar desabilitados ao mesmo tempo: o associado precisa de um canal.",
        campo: "estado",
      }
    }
  }

  const admin = await createAdminClient()
  const { error } = await admin.from("portal_partes").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      parte: p.parte,
      estado: p.estado,
      mensagem,
      retorno_previsto: retorno,
      opcoes: normalizarOpcoes(p.parte, p.opcoes),
      atualizada_por: p.usuarioId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id,parte" }
  )
  if (error) {
    return { erro: esquemaAusente(error) ? "O banco ainda não tem a tabela da Área do associado (portal_partes): falta aplicar a migração." : error.message }
  }
  return {}
}
