import "server-only"

import { esquemaAusente, hojeSP, nomesDosUsuarios, texto } from "@/lib/db/comum"
import {
  MOTIVOS_OCUPACAO,
  ehCobertura,
  type MotivoOcupacao,
} from "@/lib/contas-funcao-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Contas de função — a conta é do POSTO (recepcao@…), não de uma pessoa. Quem
 * ocupa o posto usa a conta; `usuarios_ocupacoes` guarda quem ocupou em cada
 * período, e é por ela que uma ação da conta numa data aponta para a pessoa.
 * Uma cobertura (férias, afastamento, substituição) vale sobre o titular nos
 * dias dela. SQL: supabase/contas-funcao.sql.
 */

export const AVISO_SQL_CONTAS =
  "Rode supabase/contas-funcao.sql no Supabase para usar contas de função."

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/

export type Ocupacao = {
  id: string
  pessoaId: string
  pessoaNome: string | null
  inicio: string
  fim: string | null
  motivo: MotivoOcupacao
  observacao: string | null
  registradoPorNome: string | null
}

type OcupacaoBruta = Pick<Ocupacao, "pessoaId" | "inicio" | "fim" | "motivo">

/** Dia (AAAA-MM-DD) em São Paulo de um instante ISO; datas puras passam direto. */
export function diaSP(quando: string): string {
  if (RE_DATA.test(quando)) return quando
  const d = new Date(quando)
  if (Number.isNaN(d.getTime())) return quando.slice(0, 10)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d)
}

/** Quem ocupava o posto no dia: a cobertura vale sobre o titular. */
export function ocupanteNoDia<T extends OcupacaoBruta>(ocupacoes: T[], dia: string): T | null {
  const vigentes = ocupacoes.filter((o) => o.inicio <= dia && (!o.fim || o.fim >= dia))
  if (vigentes.length === 0) return null
  return [...vigentes].sort((a, b) => {
    const cobertura = Number(ehCobertura(b.motivo)) - Number(ehCobertura(a.motivo))
    return cobertura !== 0 ? cobertura : b.inicio.localeCompare(a.inicio)
  })[0]
}

function motivo(v: unknown): MotivoOcupacao {
  return (MOTIVOS_OCUPACAO.some((m) => m.valor === v) ? v : "titular") as MotivoOcupacao
}

// ── Leitura ─────────────────────────────────────────────────────────────────

/** A conta é de função? null quando o SQL ainda não rodou. */
export async function ehContaFuncao(usuarioId: string): Promise<boolean | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("usuarios")
    .select("conta_funcao")
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) return esquemaAusente(error) ? null : false
  return data?.conta_funcao === true
}

export async function listarOcupacoes(
  contaId: string
): Promise<{ disponivel: boolean; ocupacoes: Ocupacao[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("usuarios_ocupacoes")
    .select("id, pessoa_id, inicio, fim, motivo, observacao, registrado_por_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("conta_id", contaId)
    .order("inicio", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, ocupacoes: [] }
    throw new Error(`Falha ao listar quem ocupa o posto: ${error.message}`)
  }
  const linhas = (data ?? []) as Record<string, unknown>[]
  const nomes = await nomesDosUsuarios(
    linhas.flatMap((l) => [String(l.pessoa_id ?? ""), String(l.registrado_por_id ?? "")])
  )
  return {
    disponivel: true,
    ocupacoes: linhas.map((l) => ({
      id: String(l.id),
      pessoaId: String(l.pessoa_id),
      pessoaNome: nomes.get(String(l.pessoa_id)) ?? null,
      inicio: String(l.inicio),
      fim: texto(l.fim),
      motivo: motivo(l.motivo),
      observacao: texto(l.observacao),
      registradoPorNome: l.registrado_por_id
        ? (nomes.get(String(l.registrado_por_id)) ?? null)
        : null,
    })),
  }
}

/** Contas de função entre os ids, com as ocupações de cada uma. */
async function contasEOcupacoes(ids: string[]): Promise<Map<string, OcupacaoBruta[]>> {
  const contas = new Map<string, OcupacaoBruta[]>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return contas
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("usuarios")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("conta_funcao", true)
    .in("id", unicos)
  if (error || !data?.length) return contas
  for (const c of data) contas.set(String(c.id), [])
  const { data: ocs } = await admin
    .from("usuarios_ocupacoes")
    .select("conta_id, pessoa_id, inicio, fim, motivo")
    .eq("emp_proprietaria_id", emp)
    .in("conta_id", [...contas.keys()])
  for (const o of (ocs ?? []) as Record<string, unknown>[]) {
    contas.get(String(o.conta_id))?.push({
      pessoaId: String(o.pessoa_id),
      inicio: String(o.inicio),
      fim: texto(o.fim),
      motivo: motivo(o.motivo),
    })
  }
  return contas
}

/** Quem ocupa hoje cada conta de função (id da conta → nome da pessoa). */
export async function ocupantesAtuais(contaIds: string[]): Promise<Map<string, string | null>> {
  const contas = await contasEOcupacoes(contaIds)
  const hoje = hojeSP()
  const atuais = new Map<string, string | null>()
  const pessoas = new Map<string, string>()
  for (const [conta, ocs] of contas) {
    const o = ocupanteNoDia(ocs, hoje)
    atuais.set(conta, o?.pessoaId ?? null)
    if (o) pessoas.set(conta, o.pessoaId)
  }
  const nomes = await nomesDosUsuarios([...pessoas.values()])
  return new Map([...atuais].map(([conta, pessoa]) => [conta, pessoa ? (nomes.get(pessoa) ?? null) : null]))
}

/**
 * Rotula autores de registros: o nome da pessoa ou, numa conta de função,
 * "Recepção (quem ocupava o posto no dia)". Sem o SQL, só o nome.
 */
export async function rotuladorDeAutores(
  ids: string[]
): Promise<(id: string | null | undefined, quando: string | null | undefined) => string | null> {
  const [nomes, contas] = await Promise.all([nomesDosUsuarios(ids), contasEOcupacoes(ids)])
  const pessoas = await nomesDosUsuarios(
    [...contas.values()].flatMap((ocs) => ocs.map((o) => o.pessoaId))
  )
  return (id, quando) => {
    if (!id) return null
    const nome = nomes.get(id) ?? null
    const ocs = contas.get(id)
    if (!ocs || !quando) return nome
    const o = ocupanteNoDia(ocs, diaSP(quando))
    const pessoa = o ? pessoas.get(o.pessoaId) : null
    return pessoa ? `${nome ?? "Conta de função"} (${pessoa})` : nome
  }
}

// ── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Cria a conta do posto em `usuarios`. Se já existe uma conta de função com o
 * e-mail, devolve ela (para reconceder o acesso); se o e-mail é de uma pessoa,
 * recusa — o login é pelo e-mail.
 */
export async function criarContaFuncao(dados: {
  nome: string
  email: string
}): Promise<{ usuarioId?: string; erro?: string }> {
  const nome = dados.nome.trim().replace(/\s+/g, " ")
  const email = dados.email.trim().toLowerCase()
  if (nome.length < 3) return { erro: "Dê um nome à conta (ex.: Recepção)." }
  if (!RE_EMAIL.test(email)) return { erro: "E-mail inválido." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: existente, error: erroBusca } = await admin
    .from("usuarios")
    .select("id, nome_completo, conta_funcao")
    .eq("emp_proprietaria_id", emp)
    .eq("email", email)
    .not("deletado", "is", true)
    .limit(1)
    .maybeSingle()
  if (erroBusca) {
    return { erro: esquemaAusente(erroBusca) ? AVISO_SQL_CONTAS : erroBusca.message }
  }
  if (existente) {
    if (existente.conta_funcao === true) return { usuarioId: String(existente.id) }
    return {
      erro: `Este e-mail está no cadastro de ${texto(existente.nome_completo) ?? "uma pessoa"}. Troque o e-mail desse cadastro antes de criar a conta de função — o login é pelo e-mail.`,
    }
  }

  const { data, error } = await admin
    .from("usuarios")
    .insert({ nome_completo: nome, email, conta_funcao: true, emp_proprietaria_id: emp })
    .select("id")
    .single()
  if (error || !data) {
    return {
      erro: error && esquemaAusente(error)
        ? AVISO_SQL_CONTAS
        : `Não foi possível criar a conta: ${error?.message ?? "erro"}`,
    }
  }
  return { usuarioId: String(data.id) }
}

export type NovaOcupacao = {
  contaId: string
  pessoaId: string
  inicio: string
  fim: string | null
  motivo: string
  observacao: string | null
}

function sobrepoe(a: { inicio: string; fim: string | null }, b: { inicio: string; fim: string | null }) {
  return a.inicio <= (b.fim ?? "9999-12-31") && b.inicio <= (a.fim ?? "9999-12-31")
}

/**
 * Registra quem ocupa o posto. Titulares não se sobrepõem entre si, nem as
 * coberturas; um titular novo encerra, na véspera, o titular que estava em
 * aberto (a substituição definitiva).
 */
export async function registrarOcupacao(
  dados: NovaOcupacao,
  registradoPorId: string
): Promise<{ ok?: string; erro?: string }> {
  const m = MOTIVOS_OCUPACAO.find((x) => x.valor === dados.motivo)
  if (!m) return { erro: "Escolha o motivo." }
  if (!RE_DATA.test(dados.inicio)) return { erro: "Informe a data de início." }
  const fim = dados.fim && RE_DATA.test(dados.fim) ? dados.fim : null
  if (fim && fim < dados.inicio) return { erro: "O fim não pode ser antes do início." }
  if (ehCobertura(m.valor) && !fim) {
    return { erro: "Uma cobertura precisa da data de fim (o último dia de quem cobre)." }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: gente, error: erroGente } = await admin
    .from("usuarios")
    .select("id, nome_completo, conta_funcao, deletado")
    .eq("emp_proprietaria_id", emp)
    .in("id", [dados.contaId, dados.pessoaId])
  if (erroGente) return { erro: esquemaAusente(erroGente) ? AVISO_SQL_CONTAS : erroGente.message }
  const conta = gente?.find((u) => u.id === dados.contaId)
  const pessoa = gente?.find((u) => u.id === dados.pessoaId)
  if (!conta || conta.conta_funcao !== true) return { erro: "Conta de função não encontrada." }
  if (!pessoa || pessoa.deletado === true) return { erro: "Escolha a pessoa que ocupa o posto." }
  if (pessoa.conta_funcao === true) return { erro: "Escolha uma pessoa, não outra conta de função." }

  const { ocupacoes, disponivel } = await listarOcupacoes(dados.contaId)
  if (!disponivel) return { erro: AVISO_SQL_CONTAS }
  const nova = { inicio: dados.inicio, fim }
  const mesmaClasse = ocupacoes.filter((o) => ehCobertura(o.motivo) === ehCobertura(m.valor))

  // Substituição definitiva: o titular em aberto que começou antes é encerrado na véspera.
  const encerrar = !ehCobertura(m.valor)
    ? mesmaClasse.find((o) => !o.fim && o.inicio < dados.inicio)
    : undefined
  const conflito = mesmaClasse.find((o) => o.id !== encerrar?.id && sobrepoe(o, nova))
  if (conflito) {
    return {
      erro: `O período se sobrepõe ao de ${conflito.pessoaNome ?? "outra pessoa"} (${periodoBR(conflito.inicio, conflito.fim)}). Ajuste as datas ou encerre aquele período antes.`,
    }
  }

  let encerrado = ""
  if (encerrar) {
    const vespera = diaAnterior(dados.inicio)
    const { error } = await admin
      .from("usuarios_ocupacoes")
      .update({ fim: vespera, updated_at: new Date().toISOString() })
      .eq("id", encerrar.id)
      .eq("emp_proprietaria_id", emp)
    if (error) return { erro: `Não foi possível encerrar o titular anterior: ${error.message}` }
    encerrado = ` O período de ${encerrar.pessoaNome ?? "quem estava"} foi encerrado em ${dataBR(vespera)}.`
  }

  const { error } = await admin.from("usuarios_ocupacoes").insert({
    emp_proprietaria_id: emp,
    conta_id: dados.contaId,
    pessoa_id: dados.pessoaId,
    inicio: dados.inicio,
    fim,
    motivo: m.valor,
    observacao: dados.observacao?.trim() || null,
    registrado_por_id: registradoPorId,
  })
  if (error) return { erro: `Não foi possível registrar: ${error.message}` }
  return { ok: `${texto(pessoa.nome_completo) ?? "Pessoa"} registrada no posto.${encerrado}` }
}

export async function encerrarOcupacao(
  id: string,
  fim: string
): Promise<{ erro?: string }> {
  if (!RE_DATA.test(fim)) return { erro: "Informe a data de fim." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: o } = await admin
    .from("usuarios_ocupacoes")
    .select("inicio")
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!o) return { erro: "Período não encontrado." }
  if (fim < String(o.inicio)) return { erro: "O fim não pode ser antes do início." }
  const { error } = await admin
    .from("usuarios_ocupacoes")
    .update({ fim, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível encerrar: ${error.message}` }
  return {}
}

export async function excluirOcupacao(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("usuarios_ocupacoes")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return {}
}

// ── Datas ───────────────────────────────────────────────────────────────────

function diaAnterior(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

const dataBR = (d: string) => d.split("-").reverse().join("/")

function periodoBR(inicio: string, fim: string | null): string {
  return fim ? `${dataBR(inicio)} a ${dataBR(fim)}` : `desde ${dataBR(inicio)}`
}
