import "server-only"

import { cache } from "react"

import { esquemaAusente } from "@/lib/db/comum"
import { cifrarSegredo, decifrarSegredo, decifrarSegredoDetalhado, segredosConfigurados } from "@/lib/segredos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Configuração da IA da entidade (tabela ia_config) — Gestão › Inteligência
 * Artificial. A chave de API própria é gravada cifrada (lib/segredos.ts) e só
 * sai daqui decifrada para lib/ia.ts, no servidor. A tela recebe
 * `ConfigIAPublica`, que não tem a chave nem o texto cifrado.
 */

export type ConfigIAPublica = {
  disponivel: boolean
  temChave: boolean
  chaveFinal: string | null
  chaveDefinidaEm: string | null
  chaveDefinidaPor: string | null
  chaveTestadaEm: string | null
  chaveTesteErro: string | null
  /** A chave existe mas não decifra (chave de cifra do servidor mudou). */
  chaveIlegivel: boolean
  /** Legível, mas guardada com uma chave de cifra que não é a atual: recifrar. */
  chaveRecifrar: boolean
  modelo: string | null
  iaAtiva: boolean
  modulosDesligados: string[]
  limiteMensalUsd: number | null
  bloquearNoLimite: boolean
  precoEntrada: number | null
  precoEntradaCache: number | null
  precoSaida: number | null
  /** Modelo por processo (chave de lib/ia-processos.ts → modelo). */
  modelosProcesso: Record<string, string>
  /** Preços dos modelos além do geral (US$ por 1 milhão de tokens). */
  precosModelos: Record<string, PrecosModelo>
  /** Cota mensal por departamento (id → US$). */
  cotasDepartamento: Record<string, number>
  /** R$ por US$ 1 (informado na Gestão); null = só dólar. */
  cotacaoUsdBrl: number | null
  segredosConfigurados: boolean
}

export type PrecosModelo = { entrada: number | null; cache: number | null; saida: number | null }

/** Nome de modelo aceito (o mesmo critério do modelo geral). */
export function modeloValido(m: string): boolean {
  return /^[A-Za-z0-9._:-]{2,64}$/.test(m)
}

type Linha = Record<string, unknown>

const COLUNAS =
  "chave_cifrada, chave_versao, chave_final, chave_definida_em, chave_definida_por, chave_testada_em, chave_teste_erro, modelo, ia_ativa, modulos_desligados, limite_mensal_usd, bloquear_no_limite, preco_entrada_usd_milhao, preco_entrada_cache_usd_milhao, preco_saida_usd_milhao, modelos_processo, precos_modelos, cotas_departamento, cotacao_usd_brl"

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Linha crua da entidade (com a chave cifrada) — só para este módulo e ia.ts. */
const linhaDaEntidade = cache(async (emp: string): Promise<{ disponivel: boolean; linha: Linha | null }> => {
  try {
    const admin = await createAdminClient()
    const { data, error } = await admin.from("ia_config").select(COLUNAS).eq("emp_proprietaria_id", emp).maybeSingle()
    if (error) return { disponivel: !esquemaAusente(error), linha: null }
    return { disponivel: true, linha: (data as Linha | null) ?? null }
  } catch {
    return { disponivel: false, linha: null }
  }
})

function lerModelos(v: unknown): Record<string, string> {
  const r: Record<string, string> = {}
  if (!v || typeof v !== "object" || Array.isArray(v)) return r
  for (const [k, m] of Object.entries(v as Record<string, unknown>)) if (typeof m === "string" && modeloValido(m)) r[k] = m
  return r
}

function lerCotas(v: unknown): Record<string, number> {
  const r: Record<string, number> = {}
  if (!v || typeof v !== "object" || Array.isArray(v)) return r
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    const x = num(n)
    if (x !== null && x > 0) r[k] = x
  }
  return r
}

function lerPrecos(v: unknown): Record<string, PrecosModelo> {
  const r: Record<string, PrecosModelo> = {}
  if (!v || typeof v !== "object" || Array.isArray(v)) return r
  for (const [k, p] of Object.entries(v as Record<string, unknown>)) {
    if (!p || typeof p !== "object") continue
    const o = p as Record<string, unknown>
    r[k] = { entrada: num(o.entrada), cache: num(o.cache), saida: num(o.saida) }
  }
  return r
}

/**
 * Preços que valem para um modelo: os próprios (precos_modelos) ou, se for o
 * modelo geral da entidade, os preços gerais. Sem preço de entrada e saída,
 * null (o custo daquela chamada fica sem estimativa).
 */
export function precosDoModelo(config: ConfigIAPublica, modelo: string, modeloGeral: string): PrecosModelo | null {
  const proprio = config.precosModelos[modelo]
  if (proprio && proprio.entrada !== null && proprio.saida !== null) return proprio
  if (modelo === modeloGeral && config.precoEntrada !== null && config.precoSaida !== null) {
    return { entrada: config.precoEntrada, cache: config.precoEntradaCache, saida: config.precoSaida }
  }
  return null
}

function publica(disponivel: boolean, l: Linha | null, emp: string): ConfigIAPublica {
  const temChave = Boolean(l?.chave_cifrada)
  const leitura = temChave
    ? decifrarSegredoDetalhado(String(l!.chave_cifrada), Number(l!.chave_versao ?? 0), emp)
    : { texto: null, recifrar: false }
  return {
    disponivel,
    temChave,
    chaveFinal: (l?.chave_final as string) ?? null,
    chaveDefinidaEm: (l?.chave_definida_em as string) ?? null,
    chaveDefinidaPor: (l?.chave_definida_por as string) ?? null,
    chaveTestadaEm: (l?.chave_testada_em as string) ?? null,
    chaveTesteErro: (l?.chave_teste_erro as string) ?? null,
    chaveIlegivel: temChave && leitura.texto === null,
    chaveRecifrar: temChave && leitura.texto !== null && leitura.recifrar,
    modelo: (l?.modelo as string) || null,
    iaAtiva: l ? l.ia_ativa !== false : true,
    modulosDesligados: Array.isArray(l?.modulos_desligados) ? (l!.modulos_desligados as string[]) : [],
    limiteMensalUsd: num(l?.limite_mensal_usd),
    bloquearNoLimite: l?.bloquear_no_limite === true,
    precoEntrada: num(l?.preco_entrada_usd_milhao),
    precoEntradaCache: num(l?.preco_entrada_cache_usd_milhao),
    precoSaida: num(l?.preco_saida_usd_milhao),
    modelosProcesso: lerModelos(l?.modelos_processo),
    precosModelos: lerPrecos(l?.precos_modelos),
    cotasDepartamento: lerCotas(l?.cotas_departamento),
    cotacaoUsdBrl: num(l?.cotacao_usd_brl),
    segredosConfigurados: segredosConfigurados(),
  }
}

export async function obterConfigIA(): Promise<ConfigIAPublica> {
  const emp = await tenantAtual()
  const { disponivel, linha } = await linhaDaEntidade(emp)
  return publica(disponivel, linha, emp)
}

/** Para lib/ia.ts: a configuração e a chave própria decifrada (ou null). */
export async function configIAParaChamada(emp: string): Promise<{ config: ConfigIAPublica; chave: string | null }> {
  const { disponivel, linha } = await linhaDaEntidade(emp)
  const config = publica(disponivel, linha, emp)
  const chave =
    linha?.chave_cifrada ? decifrarSegredo(String(linha.chave_cifrada), Number(linha.chave_versao ?? 0), emp) : null
  return { config, chave }
}

/** Custo estimado do mês corrente (fuso de Brasília), para o teto. */
export function inicioDoMes(agora = new Date()): Date {
  // Meia-noite do dia 1 em Brasília (UTC-3, sem horário de verão desde 2019).
  const br = new Date(agora.getTime() - 3 * 3600_000)
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1, 3, 0, 0))
}

/** Do início do mês corrente até agora (com folga de 1 min). */
export function mesAtual(): { de: Date; ate: Date } {
  return { de: inicioDoMes(), ate: new Date(Date.now() + 60_000) }
}

export const custoDoMes = cache(async (emp: string): Promise<number> => {
  try {
    const admin = await createAdminClient()
    const { data, error } = await admin.rpc("ia_uso_custo_desde", { p_emp: emp, p_de: inicioDoMes().toISOString() })
    if (error) return 0
    return Number(data ?? 0) || 0
  } catch {
    return 0
  }
})

/** Custo estimado do mês corrente por departamento (cota por departamento). */
export const custoPorDepartamentoNoMes = cache(async (emp: string): Promise<Map<string, number>> => {
  try {
    const admin = await createAdminClient()
    const { data, error } = await admin.rpc("ia_uso_custo_por_departamento", { p_emp: emp, p_de: inicioDoMes().toISOString() })
    if (error) return new Map()
    return new Map(((data ?? []) as Linha[]).map((l) => [String(l.departamento_id), Number(l.custo ?? 0) || 0]))
  } catch {
    return new Map()
  }
})

async function registrarEvento(acao: string, detalhe: string | null, usuarioId: string): Promise<void> {
  const admin = await createAdminClient()
  await admin.from("gestao_eventos").insert({
    emp_proprietaria_id: await tenantAtual(),
    usuario_id: usuarioId,
    area: "ia",
    acao,
    detalhe,
  })
}

export { registrarEvento as registrarEventoGestaoIA }

async function gravar(campos: Linha, usuarioId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("ia_config")
    .upsert(
      { emp_proprietaria_id: emp, ...campos, atualizado_por: usuarioId, updated_at: new Date().toISOString() },
      { onConflict: "emp_proprietaria_id" }
    )
  if (error) return { erro: esquemaAusente(error) ? "Falta aplicar a migração da Gestão (ia_config)." : `Falha ao salvar: ${error.message}` }
  return {}
}

/** Formato plausível de chave da OpenAI (sk-…, sk-proj-…, sk-svcacct-…). */
export function chaveParecida(chave: string): boolean {
  return /^sk-[A-Za-z0-9_-]{20,}$/.test(chave)
}

export async function salvarChaveIA(chave: string, usuarioId: string): Promise<{ erro?: string }> {
  const limpa = chave.trim()
  if (!chaveParecida(limpa)) return { erro: "Isso não parece uma chave da OpenAI (começa com sk- e não tem espaços)." }
  if (!segredosConfigurados()) return { erro: "O servidor não tem chave de cifra (SEGREDOS_CHAVE). Sem ela a chave não pode ser guardada com segurança." }
  const emp = await tenantAtual()
  const { cifrado, versao } = cifrarSegredo(limpa, emp)
  const r = await gravar(
    {
      chave_cifrada: cifrado,
      chave_versao: versao,
      chave_final: limpa.slice(-4),
      chave_definida_por: usuarioId,
      chave_definida_em: new Date().toISOString(),
      chave_testada_em: null,
      chave_teste_erro: null,
    },
    usuarioId
  )
  if (!r.erro) await registrarEvento("chave_cadastrada", `Chave terminada em ${limpa.slice(-4)}`, usuarioId)
  return r
}

export async function removerChaveIA(usuarioId: string): Promise<{ erro?: string }> {
  const atual = await obterConfigIA()
  const r = await gravar(
    { chave_cifrada: null, chave_versao: null, chave_final: null, chave_definida_por: null, chave_definida_em: null, chave_testada_em: null, chave_teste_erro: null },
    usuarioId
  )
  if (!r.erro) await registrarEvento("chave_removida", atual.chaveFinal ? `Chave terminada em ${atual.chaveFinal}` : null, usuarioId)
  return r
}

export async function registrarTesteChaveIA(erro: string | null, usuarioId: string): Promise<void> {
  await gravar({ chave_testada_em: new Date().toISOString(), chave_teste_erro: erro }, usuarioId)
}

export type PreferenciasIA = {
  modelo: string | null
  iaAtiva: boolean
  modulosDesligados: string[]
  limiteMensalUsd: number | null
  bloquearNoLimite: boolean
  precoEntrada: number | null
  precoEntradaCache: number | null
  precoSaida: number | null
  cotacaoUsdBrl: number | null
}

export async function salvarPreferenciasIA(p: PreferenciasIA, usuarioId: string): Promise<{ erro?: string }> {
  if (p.modelo && !modeloValido(p.modelo)) return { erro: "Nome de modelo inválido." }
  if (p.limiteMensalUsd !== null && p.limiteMensalUsd <= 0) return { erro: "O teto mensal precisa ser maior que zero." }
  if (p.limiteMensalUsd !== null && (p.precoEntrada === null || p.precoSaida === null)) {
    return { erro: "Para usar o teto mensal, informe os preços de entrada e de saída (o custo é estimado por eles)." }
  }
  const antes = await obterConfigIA()
  const r = await gravar(
    {
      modelo: p.modelo,
      ia_ativa: p.iaAtiva,
      modulos_desligados: p.modulosDesligados,
      limite_mensal_usd: p.limiteMensalUsd,
      bloquear_no_limite: p.bloquearNoLimite,
      preco_entrada_usd_milhao: p.precoEntrada,
      preco_entrada_cache_usd_milhao: p.precoEntradaCache,
      preco_saida_usd_milhao: p.precoSaida,
      cotacao_usd_brl: p.cotacaoUsdBrl,
    },
    usuarioId
  )
  if (r.erro) return r
  const mudancas: string[] = []
  if (antes.iaAtiva !== p.iaAtiva) mudancas.push(p.iaAtiva ? "IA ligada" : "IA desligada")
  if ((antes.modelo ?? "") !== (p.modelo ?? "")) mudancas.push(`modelo: ${p.modelo ?? "padrão da plataforma"}`)
  if (antes.limiteMensalUsd !== p.limiteMensalUsd) mudancas.push(`teto mensal: ${p.limiteMensalUsd === null ? "sem teto" : `US$ ${p.limiteMensalUsd}`}`)
  if (antes.bloquearNoLimite !== p.bloquearNoLimite) mudancas.push(p.bloquearNoLimite ? "bloqueia no teto" : "só avisa no teto")
  const desl = [...p.modulosDesligados].sort().join(",")
  if ([...antes.modulosDesligados].sort().join(",") !== desl) mudancas.push(`módulos desligados: ${desl || "nenhum"}`)
  if (antes.cotacaoUsdBrl !== p.cotacaoUsdBrl) mudancas.push(`cotação: ${p.cotacaoUsdBrl === null ? "só dólar" : `R$ ${p.cotacaoUsdBrl}`}`)
  if (antes.precoEntrada !== p.precoEntrada || antes.precoSaida !== p.precoSaida || antes.precoEntradaCache !== p.precoEntradaCache) mudancas.push("preços atualizados")
  if (mudancas.length) await registrarEvento("preferencias", mudancas.join("; "), usuarioId)
  return {}
}

/**
 * Modelo por processo e os preços dos modelos além do geral. Processos fora
 * do catálogo e modelos inválidos já chegam filtrados pela action.
 */
export async function salvarModelosProcessoIA(
  modelos: Record<string, string>,
  precos: Record<string, PrecosModelo>,
  usuarioId: string
): Promise<{ erro?: string }> {
  for (const m of Object.values(modelos)) if (!modeloValido(m)) return { erro: `Nome de modelo inválido: ${m}` }
  const antes = await obterConfigIA()
  const r = await gravar({ modelos_processo: modelos, precos_modelos: precos }, usuarioId)
  if (r.erro) return r
  const mudou = Object.keys({ ...antes.modelosProcesso, ...modelos }).filter(
    (k) => (antes.modelosProcesso[k] ?? "") !== (modelos[k] ?? "")
  )
  const detalhe: string[] = []
  if (mudou.length) {
    detalhe.push(
      mudou
        .slice(0, 8)
        .map((k) => `${k}: ${modelos[k] ?? "modelo geral"}`)
        .join("; ") + (mudou.length > 8 ? ` (+${mudou.length - 8})` : "")
    )
  }
  if (JSON.stringify(antes.precosModelos) !== JSON.stringify(precos)) detalhe.push("preços por modelo atualizados")
  if (detalhe.length) await registrarEvento("modelos_processo", detalhe.join(" · "), usuarioId)
  return {}
}

/** Cotas mensais por departamento (US$). Departamento sem cota = sem limite próprio. */
export async function salvarCotasIA(cotas: Record<string, number>, nomes: Map<string, string>, usuarioId: string): Promise<{ erro?: string }> {
  const antes = await obterConfigIA()
  const r = await gravar({ cotas_departamento: cotas }, usuarioId)
  if (r.erro) return r
  const mudou = Object.keys({ ...antes.cotasDepartamento, ...cotas }).filter((k) => antes.cotasDepartamento[k] !== cotas[k])
  if (mudou.length) {
    await registrarEvento(
      "cotas_departamento",
      mudou
        .slice(0, 8)
        .map((k) => `${nomes.get(k) ?? "departamento"}: ${cotas[k] ? `US$ ${cotas[k]}` : "sem cota"}`)
        .join("; ") + (mudou.length > 8 ? ` (+${mudou.length - 8})` : ""),
      usuarioId
    )
  }
  return {}
}

/**
 * Regrava a chave da entidade com a chave de cifra atual (depois de trocar a
 * SEGREDOS_CHAVE, ou de cadastrá-la quando só havia a derivada). A chave de
 * API não muda e não sai do servidor.
 */
export async function recifrarChaveIA(usuarioId: string): Promise<{ erro?: string }> {
  const emp = await tenantAtual()
  const { linha } = await linhaDaEntidade(emp)
  if (!linha?.chave_cifrada) return { erro: "Não há chave da entidade cadastrada." }
  const { texto } = decifrarSegredoDetalhado(String(linha.chave_cifrada), Number(linha.chave_versao ?? 0), emp)
  if (texto === null) {
    return { erro: "A chave guardada não decifra com nenhuma chave de cifra deste servidor. Configure a antiga em SEGREDOS_CHAVE_ANTERIOR ou cadastre a chave de novo." }
  }
  const { cifrado, versao } = cifrarSegredo(texto, emp)
  const r = await gravar({ chave_cifrada: cifrado, chave_versao: versao }, usuarioId)
  if (!r.erro) await registrarEvento("chave_recifrada", `Chave terminada em ${String(linha.chave_final ?? "")} regravada com a chave de cifra atual`, usuarioId)
  return r
}
