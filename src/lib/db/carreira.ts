import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { criarNotificacao } from "@/lib/db/notificacoes"
import { enviarEmail } from "@/lib/email"
import { SITE_URL } from "@/lib/env"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Carreira do funcionário — anuênios e níveis salariais.
 *
 * Modelo medido no banco (2026-07-18):
 * - `pessoal_anuenio_base` (31): degraus do anuênio — `nivel` (anos de
 *   casa, 0–30) e `aliquota` (fração do salário básico, ex.: 0.046).
 * - `pessoal_anuenio` (493): lançamentos por funcionário; `nivel_atual_id`
 *   e `proximo_nivel_id` apontam para a base; o avanço é automático no
 *   aniversário de emprego (`proximo_nivel_data` = data atual + 1 ano).
 * - `pessoal_nivel_salarial_base` (178): tabela salarial do ACT — cargo
 *   (`pessoal_cargo`, 5) × nível vertical (ex.: "428") × horizontal (A/B)
 *   × carreira (Júnior/Pleno/Sênior) → `salario_base`; `ordem` ordena.
 * - `pessoal_nivel_salarial` (54): lançamentos por funcionário com
 *   `tipo_avanco` (Automático, Por mérito, Ajuste salarial, Inicial).
 *
 * `mes`/`ano` dos lançamentos são texto (referência, ex.: "Outubro"/"2023")
 * e aqui são derivados de `nivel_atual_data` na gravação.
 */

export const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const

/** '2023-10-01' → { mes: 'Outubro', ano: '2023' } (referência do lançamento). */
export function referenciaDaData(dataISO: string): {
  mes: string | null
  ano: string | null
} {
  const m = /^(\d{4})-(\d{2})/.exec(dataISO)
  if (!m) return { mes: null, ano: null }
  return { mes: MESES_PT[Number(m[2]) - 1] ?? null, ano: m[1] }
}

/** 0.046 → '4,6%'. */
export function formatarAliquota(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—"
  return `${(valor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
}

// ── Tabelas base ───────────────────────────────────────────────────────────

export type AnuenioBase = {
  id: string
  nivel: number | null
  aliquota: number | null
}

export async function listarAnuenioBase(): Promise<AnuenioBase[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_anuenio_base")
    .select("id, nivel, aliquota")
    .order("nivel", { ascending: true, nullsFirst: false })
  if (error)
    throw new Error(`Falha ao listar a tabela de anuênios: ${error.message}`)
  return data ?? []
}

export type Cargo = {
  id: string
  nome: string | null
}

export async function listarCargos(): Promise<Cargo[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_cargo")
    .select("id, nome")
    .order("nome", { ascending: true })
  if (error) throw new Error(`Falha ao listar cargos: ${error.message}`)
  return data ?? []
}

export type NivelSalarialBase = {
  id: string
  ordem: number | null
  nivel_vertical: string | null
  nivel_horizontal: string | null
  nivel_carreira: string | null
  salario_base: number | null
  cargo_id: string | null
  cargoNome: string | null
}

/** Rótulo curto do degrau: '428-B · Júnior'. */
export function rotuloNivelSalarial(
  n: Pick<
    NivelSalarialBase,
    "nivel_vertical" | "nivel_horizontal" | "nivel_carreira"
  > | null
): string {
  if (!n) return "—"
  const degrau = [n.nivel_vertical, n.nivel_horizontal]
    .filter(Boolean)
    .join("-")
  return [degrau, n.nivel_carreira].filter(Boolean).join(" · ") || "—"
}

export async function listarNivelSalarialBase(): Promise<NivelSalarialBase[]> {
  const admin = await createAdminClient()
  const [{ data, error }, cargos] = await Promise.all([
    admin
      .from("pessoal_nivel_salarial_base")
      .select(
        "id, ordem, nivel_vertical, nivel_horizontal, nivel_carreira, salario_base, cargo_id"
      )
      .order("ordem", { ascending: true, nullsFirst: false }),
    listarCargos(),
  ])
  if (error)
    throw new Error(`Falha ao listar a tabela salarial: ${error.message}`)
  const nomes = new Map(cargos.map((c) => [c.id, c.nome]))
  return (data ?? []).map((n) => ({
    ...n,
    cargoNome: n.cargo_id ? (nomes.get(n.cargo_id) ?? null) : null,
  }))
}

// ── Lançamentos ────────────────────────────────────────────────────────────

export const TIPOS_AVANCO = [
  "Inicial",
  "Automático",
  "Por mérito",
  "Ajuste salarial",
] as const

type EmbedAnuenioBase = {
  nivel: number | null
  aliquota: number | null
} | null

type EmbedNivelBase = {
  nivel_vertical: string | null
  nivel_horizontal: string | null
  nivel_carreira: string | null
  salario_base: number | null
  cargo_id: string | null
} | null

/** Embed many-to-one do PostgREST: normaliza objeto/array (sem tipos gerados). */
function umaLinha<T>(valor: unknown): T | null {
  if (Array.isArray(valor)) return (valor[0] as T) ?? null
  return (valor as T) ?? null
}

export type AnuenioLancamento = {
  id: string
  funcionario_id: string | null
  funcionarioNome: string | null
  mes: string | null
  ano: string | null
  nivel_atual_id: string | null
  nivel_atual_data: string | null
  proximo_nivel_id: string | null
  proximo_nivel_data: string | null
  informado_contabilidade: boolean | null
  nivelAtual: EmbedAnuenioBase
  proximoNivel: EmbedAnuenioBase
}

async function nomesDosUsuarios(ids: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  if (ids.length === 0) return nomes
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra")
    .in("id", ids)
  for (const u of data ?? []) {
    const nome = [u.nome_completo, u.nome_guerra].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomes.set(u.id, nome)
  }
  return nomes
}

// Dois joins na mesma tabela base: desambigua pelo nome da coluna FK.
const SELECT_ANUENIO =
  "id, funcionario_id, mes, ano, nivel_atual_id, nivel_atual_data, proximo_nivel_id, proximo_nivel_data, informado_contabilidade, " +
  "nivelAtual:pessoal_anuenio_base!nivel_atual_id(nivel, aliquota), " +
  "proximoNivel:pessoal_anuenio_base!proximo_nivel_id(nivel, aliquota)"

function normalizarAnuenio(
  a: Record<string, unknown>,
  nomes: Map<string, string>
): AnuenioLancamento {
  return {
    id: String(a.id),
    funcionario_id: (a.funcionario_id as string | null) ?? null,
    funcionarioNome: a.funcionario_id
      ? (nomes.get(String(a.funcionario_id)) ?? null)
      : null,
    mes: (a.mes as string | null) ?? null,
    ano: (a.ano as string | null) ?? null,
    nivel_atual_id: (a.nivel_atual_id as string | null) ?? null,
    nivel_atual_data: (a.nivel_atual_data as string | null) ?? null,
    proximo_nivel_id: (a.proximo_nivel_id as string | null) ?? null,
    proximo_nivel_data: (a.proximo_nivel_data as string | null) ?? null,
    informado_contabilidade:
      (a.informado_contabilidade as boolean | null) ?? null,
    nivelAtual: umaLinha<NonNullable<EmbedAnuenioBase>>(a.nivelAtual),
    proximoNivel: umaLinha<NonNullable<EmbedAnuenioBase>>(a.proximoNivel),
  }
}

/** ~500 lançamentos: busca/filtro/paginação acontecem em memória na página. */
export async function listarAnuenios(): Promise<AnuenioLancamento[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_anuenio")
    .select(SELECT_ANUENIO)
    .order("nivel_atual_data", { ascending: false, nullsFirst: false })
  if (error) throw new Error(`Falha ao listar anuênios: ${error.message}`)
  const linhas = (data ?? []) as unknown as Record<string, unknown>[]
  const nomes = await nomesDosUsuarios([
    ...new Set(
      linhas
        .map((a) => a.funcionario_id as string | null)
        .filter((v): v is string => Boolean(v))
    ),
  ])
  return linhas.map((a) => normalizarAnuenio(a, nomes))
}

export async function buscarAnuenio(
  id: string
): Promise<AnuenioLancamento | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_anuenio")
    .select(SELECT_ANUENIO)
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar anuênio: ${error.message}`)
  if (!data) return null
  const bruto = data as unknown as Record<string, unknown>
  const nomes = await nomesDosUsuarios(
    bruto.funcionario_id ? [String(bruto.funcionario_id)] : []
  )
  return normalizarAnuenio(bruto, nomes)
}

export type NivelLancamento = {
  id: string
  funcionario_id: string | null
  funcionarioNome: string | null
  mes: string | null
  ano: string | null
  tipo_avanco: string | null
  nivel_atual_id: string | null
  nivel_atual_data: string | null
  proximo_nivel_id: string | null
  proximo_nivel_data: string | null
  proximo_nivel_texto: string | null
  nivelAtual: EmbedNivelBase
  proximoNivel: EmbedNivelBase
  cargoNome: string | null
}

const SELECT_NIVEL =
  "id, funcionario_id, mes, ano, tipo_avanco, nivel_atual_id, nivel_atual_data, proximo_nivel_id, proximo_nivel_data, proximo_nivel_texto, " +
  "nivelAtual:pessoal_nivel_salarial_base!nivel_atual_id(nivel_vertical, nivel_horizontal, nivel_carreira, salario_base, cargo_id), " +
  "proximoNivel:pessoal_nivel_salarial_base!proximo_nivel_id(nivel_vertical, nivel_horizontal, nivel_carreira, salario_base, cargo_id)"

async function normalizarNiveis(
  brutos: Record<string, unknown>[]
): Promise<NivelLancamento[]> {
  const [nomes, cargos] = await Promise.all([
    nomesDosUsuarios([
      ...new Set(
        brutos
          .map((n) => n.funcionario_id as string | null)
          .filter((v): v is string => Boolean(v))
      ),
    ]),
    listarCargos(),
  ])
  const nomesCargos = new Map(cargos.map((c) => [c.id, c.nome]))
  return brutos.map((n) => {
    const nivelAtual = umaLinha<NonNullable<EmbedNivelBase>>(n.nivelAtual)
    return {
      id: String(n.id),
      funcionario_id: (n.funcionario_id as string | null) ?? null,
      funcionarioNome: n.funcionario_id
        ? (nomes.get(String(n.funcionario_id)) ?? null)
        : null,
      mes: (n.mes as string | null) ?? null,
      ano: (n.ano as string | null) ?? null,
      tipo_avanco: (n.tipo_avanco as string | null) ?? null,
      nivel_atual_id: (n.nivel_atual_id as string | null) ?? null,
      nivel_atual_data: (n.nivel_atual_data as string | null) ?? null,
      proximo_nivel_id: (n.proximo_nivel_id as string | null) ?? null,
      proximo_nivel_data: (n.proximo_nivel_data as string | null) ?? null,
      proximo_nivel_texto: (n.proximo_nivel_texto as string | null) ?? null,
      nivelAtual,
      proximoNivel: umaLinha<NonNullable<EmbedNivelBase>>(n.proximoNivel),
      cargoNome: nivelAtual?.cargo_id
        ? (nomesCargos.get(nivelAtual.cargo_id) ?? null)
        : null,
    }
  })
}

export async function listarNiveisSalariais(): Promise<NivelLancamento[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_nivel_salarial")
    .select(SELECT_NIVEL)
    .order("nivel_atual_data", { ascending: false, nullsFirst: false })
  if (error)
    throw new Error(`Falha ao listar níveis salariais: ${error.message}`)
  return normalizarNiveis((data ?? []) as unknown as Record<string, unknown>[])
}

export async function buscarNivelSalarial(
  id: string
): Promise<NivelLancamento | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_nivel_salarial")
    .select(SELECT_NIVEL)
    .eq("id", id)
    .maybeSingle()
  if (error)
    throw new Error(`Falha ao buscar nível salarial: ${error.message}`)
  if (!data) return null
  const [linha] = await normalizarNiveis([data as unknown as Record<string, unknown>])
  return linha ?? null
}

// ── Carreira de UM funcionário (perfil da gestão e autosserviço) ───────────

export type CarreiraFuncionario = {
  anuenios: AnuenioLancamento[]
  niveis: NivelLancamento[]
}

export async function carreiraDoFuncionario(
  usuarioId: string
): Promise<CarreiraFuncionario> {
  const admin = await createAdminClient()
  const [anuenios, niveis] = await Promise.all([
    admin
      .from("pessoal_anuenio")
      .select(SELECT_ANUENIO)
      .eq("funcionario_id", usuarioId)
      .order("nivel_atual_data", { ascending: false, nullsFirst: false }),
    admin
      .from("pessoal_nivel_salarial")
      .select(SELECT_NIVEL)
      .eq("funcionario_id", usuarioId)
      .order("nivel_atual_data", { ascending: false, nullsFirst: false }),
  ])
  if (anuenios.error)
    throw new Error(`Falha ao buscar anuênios: ${anuenios.error.message}`)
  if (niveis.error)
    throw new Error(
      `Falha ao buscar níveis salariais: ${niveis.error.message}`
    )
  const nomes = new Map<string, string>() // perfil já mostra o nome no topo
  return {
    anuenios: ((anuenios.data ?? []) as unknown as Record<string, unknown>[]).map((a) =>
      normalizarAnuenio(a, nomes)
    ),
    niveis: await normalizarNiveis(
      (niveis.data ?? []) as unknown as Record<string, unknown>[]
    ),
  }
}

// ── Gravação ───────────────────────────────────────────────────────────────

export type DadosAnuenio = {
  funcionario_id: string
  nivel_atual_id: string
  nivel_atual_data: string
  informado_contabilidade: boolean
}

/**
 * Próximo nível do anuênio é automático: degrau `nivel + 1` da base (se
 * existir) e data um ano após a atual — o aniversário de emprego seguinte.
 */
async function completarAnuenio(dados: DadosAnuenio) {
  const base = await listarAnuenioBase()
  const atual = base.find((b) => b.id === dados.nivel_atual_id)
  if (!atual) return { erro: "Nível de anuênio não encontrado na tabela." }
  const proximo =
    atual.nivel === null
      ? null
      : (base.find((b) => b.nivel === atual.nivel! + 1) ?? null)

  const dataProxima = /^(\d{4})(-\d{2}-\d{2})/.exec(dados.nivel_atual_data)
  const { mes, ano } = referenciaDaData(dados.nivel_atual_data)
  return {
    registro: {
      funcionario_id: dados.funcionario_id,
      nivel_atual_id: dados.nivel_atual_id,
      nivel_atual_data: dados.nivel_atual_data,
      informado_contabilidade: dados.informado_contabilidade,
      proximo_nivel_id: proximo?.id ?? null,
      proximo_nivel_data:
        proximo && dataProxima
          ? `${Number(dataProxima[1]) + 1}${dataProxima[2]}`
          : null,
      mes,
      ano,
    },
  }
}

/**
 * Aviso de mudança de carreira ao funcionário: notificação interna (sino +
 * histórico) e email. Falha do email não interrompe (enviarEmail já engole);
 * falha da notificação interna também não desfaz a gravação — só loga.
 */
export async function notificarMudancaCarreira(
  funcionarioId: string,
  assunto: string,
  mensagem: string
): Promise<void> {
  try {
    await criarNotificacao({ usuarioId: funcionarioId, texto: mensagem })
  } catch (e) {
    console.error("Falha ao notificar mudança de carreira:", e)
  }

  const admin = await createAdminClient()
  const { data: usuario } = await admin
    .from("usuarios")
    .select("email, nome_completo, nome_guerra")
    .eq("id", funcionarioId)
    .maybeSingle()
  if (!usuario?.email) return

  const nome = usuario.nome_completo ?? usuario.nome_guerra ?? null
  await enviarEmail({
    email: usuario.email,
    nome,
    assunto: `${assunto} — {ENTIDADE}`,
    html: `<p>Olá${nome ? `, ${String(nome).split(" ")[0]}` : ""}!</p><p>${mensagem}</p><p>Acompanhe seu histórico em <a href="${SITE_URL}/painel/perfil/contracheques">${SITE_URL}/painel/perfil/contracheques</a>.</p><p>Confluir — {ENTIDADE}</p>`,
  })
}

async function avisarAnuenio(dados: DadosAnuenio): Promise<void> {
  const base = await listarAnuenioBase()
  const atual = base.find((b) => b.id === dados.nivel_atual_id)
  await notificarMudancaCarreira(
    dados.funcionario_id,
    "Anuênio atualizado",
    `Seu anuênio foi atualizado: nível ${atual?.nivel ?? "?"} (${formatarAliquota(atual?.aliquota)} sobre o salário básico), válido desde ${formatarData(dados.nivel_atual_data)}.`
  )
}

export async function criarAnuenio(
  dados: DadosAnuenio
): Promise<{ erro?: string }> {
  const completo = await completarAnuenio(dados)
  if ("erro" in completo) return completo
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_anuenio").insert({
    ...completo.registro,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível criar: ${error.message}` }
  await avisarAnuenio(dados)
  return {}
}

export async function atualizarAnuenio(
  id: string,
  dados: DadosAnuenio
): Promise<{ erro?: string }> {
  const completo = await completarAnuenio(dados)
  if ("erro" in completo) return completo
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_anuenio")
    .update(completo.registro, { count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Lançamento não encontrado." }
  await avisarAnuenio(dados)
  return {}
}

export type DadosNivelSalarial = {
  funcionario_id: string
  tipo_avanco: string
  nivel_atual_id: string
  nivel_atual_data: string
  proximo_nivel_id: string | null
  proximo_nivel_data: string | null
}

function registroNivel(dados: DadosNivelSalarial) {
  const { mes, ano } = referenciaDaData(dados.nivel_atual_data)
  return { ...dados, mes, ano }
}

async function avisarNivelSalarial(dados: DadosNivelSalarial): Promise<void> {
  const base = await listarNivelSalarialBase()
  const atual = base.find((b) => b.id === dados.nivel_atual_id) ?? null
  await notificarMudancaCarreira(
    dados.funcionario_id,
    "Nível salarial atualizado",
    `Seu nível salarial foi atualizado: ${rotuloNivelSalarial(atual)} — salário básico ${formatarMoeda(atual?.salario_base)}, válido desde ${formatarData(dados.nivel_atual_data)}.`
  )
}

export async function criarNivelSalarial(
  dados: DadosNivelSalarial
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_nivel_salarial").insert({
    ...registroNivel(dados),
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível criar: ${error.message}` }
  await avisarNivelSalarial(dados)
  return {}
}

export async function atualizarNivelSalarial(
  id: string,
  dados: DadosNivelSalarial
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_nivel_salarial")
    .update(registroNivel(dados), { count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Lançamento não encontrado." }
  await avisarNivelSalarial(dados)
  return {}
}

/**
 * Reajuste salarial linear (acordo anual): aplica o mesmo percentual a TODOS
 * os degraus da tabela salarial, arredondando a 2 casas. Funcionários com
 * lançamento de nível recebem aviso interno (sem email — o valor individual
 * aparece no painel).
 */
export async function aplicarReajusteSalarial(
  percentual: number
): Promise<{ erro?: string; atualizados?: number; avisados?: number }> {
  const base = await listarNivelSalarialBase()
  const comSalario = base.filter((b) => b.salario_base !== null)
  if (comSalario.length === 0) {
    return { erro: "A tabela salarial está vazia — nada a reajustar." }
  }

  const fator = 1 + percentual / 100
  const admin = await createAdminClient()
  let atualizados = 0
  for (const b of comSalario) {
    const novo = Math.round(b.salario_base! * fator * 100) / 100
    const { error } = await admin
      .from("pessoal_nivel_salarial_base")
      .update({ salario_base: novo })
      .eq("id", b.id)
    if (error) {
      return {
        erro: `Reajuste interrompido após ${atualizados} de ${comSalario.length} degraus: ${error.message}. Reaplicar apenas nos degraus restantes.`,
        atualizados,
      }
    }
    atualizados++
  }

  // Aviso interno a quem tem nível salarial lançado.
  const { data: lancamentos } = await admin
    .from("pessoal_nivel_salarial")
    .select("funcionario_id")
  const funcionarios = [
    ...new Set(
      (lancamentos ?? [])
        .map((l) => l.funcionario_id)
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const pct = percentual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
  let avisados = 0
  for (const funcionarioId of funcionarios) {
    try {
      await criarNotificacao({
        usuarioId: funcionarioId,
        texto: `A tabela salarial recebeu reajuste de ${pct}%. Consulte seu nível salarial e o novo salário básico no painel.`,
      })
      avisados++
    } catch (e) {
      console.error("Falha ao avisar reajuste:", e)
    }
  }

  return { atualizados, avisados }
}

/** Degrau da base só sai se nenhum lançamento apontar para ele. */
export async function baseEmUso(
  tabela: "pessoal_anuenio" | "pessoal_nivel_salarial",
  baseId: string
): Promise<number> {
  const admin = await createAdminClient()
  const { count } = await admin
    .from(tabela)
    .select("id", { count: "exact", head: true })
    .or(`nivel_atual_id.eq.${baseId},proximo_nivel_id.eq.${baseId}`)
  return count ?? 0
}
