import "server-only"
import { cpfConfiavel } from "@/lib/cpf"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { listarMandatos } from "@/lib/db/diretoria"
import { listarFuncionarios } from "@/lib/db/pessoal"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Departamentos da organização (Institucional → Organização).
 *
 * Tabelas do Bubble reaproveitadas: `empresa_departamentos` (nome, coordenador,
 * slug) e `empresa_departamentos_integrantes` (departamento_id × usuario_id —
 * veio VAZIA do Bubble; o vínculo das pessoas nasce aqui). Quem entra num
 * departamento é uma PESSOA com conta em `usuarios`: funcionários (vínculo
 * trabalhista com o sindicato) e diretores do mandato vigente (cruzados por
 * CPF). Diretor sem conta de usuário não pode ser vinculado — aparece na
 * lista como indisponível.
 *
 * Quem lê os departamentos: Compras (departamento da solicitação e alçada
 * por departamento), Demandas, Ofícios (quem vê cada ofício) e o quadro de
 * pessoas atribuíveis (coordenadores).
 *
 * O coordenador é uma das pessoas vinculadas. Departamento não se apaga: vira
 * LEGADO (supabase/departamentos-ajustes.sql) depois de retiradas as pessoas —
 * compras, ofícios e contas continuam apontando para ele.
 */

export type IntegranteDepartamento = { usuarioId: string; nome: string }

export type Departamento = {
  id: string
  nome: string
  coordenadorId: string | null
  coordenadorNome: string | null
  integrantes: IntegranteDepartamento[]
  /** Referências (informativo: o departamento vira legado, não é apagado). */
  usoEmCompras: number
  usoEmDemandas: number
  /** Desativado: fora das listas de escolha, mantido nos registros antigos. */
  legado: boolean
}

export async function listarDepartamentosCompletos(): Promise<Departamento[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const consulta = (colunas: string) =>
    admin
      .from("empresa_departamentos")
      .select(colunas)
      .eq("emp_proprietaria_id", emp)
      .order("departamento", { ascending: true })
  let { data, error } = await consulta("id, departamento, coordenador_id, legado")
  // Sem supabase/departamentos-ajustes.sql: nenhum é legado.
  if (error && esquemaAusente(error)) ({ data, error } = await consulta("id, departamento, coordenador_id"))
  if (error) throw new Error(`Falha ao listar departamentos: ${error.message}`)
  const linhas = (data ?? []) as unknown as Record<string, unknown>[]
  const ids = linhas.map((d) => String(d.id))
  if (ids.length === 0) return []

  const [integrantesRes, comprasRes, demandasRes] = await Promise.all([
    admin
      .from("empresa_departamentos_integrantes")
      .select("departamento_id, usuario_id")
      .in("departamento_id", ids),
    admin
      .from("permissoes_compras_depto")
      .select("departamento_id")
      .in("departamento_id", ids),
    admin
      .from("demandas_departamentos")
      .select("departamento_id")
      .in("departamento_id", ids),
  ])
  const integrantes = (integrantesRes.data ?? []) as Record<string, unknown>[]
  const contar = (rows: { departamento_id?: unknown }[] | null) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) {
      const k = String(r.departamento_id ?? "")
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }
  const emCompras = contar(comprasRes.data)
  const emDemandas = contar(demandasRes.data)

  const nomes = await nomesDePessoas([
    ...linhas.map((d) => String(d.coordenador_id ?? "")),
    ...integrantes.map((i) => String(i.usuario_id ?? "")),
  ])

  return linhas.map((d) => {
    const id = String(d.id)
    return {
      id,
      nome: texto(d.departamento) ?? "(sem nome)",
      coordenadorId: texto(d.coordenador_id),
      coordenadorNome: d.coordenador_id
        ? (nomes.get(String(d.coordenador_id)) ?? null)
        : null,
      integrantes: integrantes
        .filter((i) => String(i.departamento_id) === id && i.usuario_id)
        .map((i) => ({
          usuarioId: String(i.usuario_id),
          nome: nomes.get(String(i.usuario_id)) ?? "(usuário removido)",
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      usoEmCompras: emCompras.get(id) ?? 0,
      usoEmDemandas: emDemandas.get(id) ?? 0,
      legado: d.legado === true,
    }
  })
}

export type PessoaDepartamento = {
  usuarioId: string | null
  nome: string
  origem: "funcionario" | "diretor"
  cargo: string | null
}

/**
 * Pessoas vinculáveis: funcionários ativos e diretores do mandato vigente.
 * Diretor sem conta de usuário vem com `usuarioId: null` (não dá para vincular
 * — a tabela de integrantes aponta para `usuarios`).
 */
export async function pessoasParaDepartamento(): Promise<PessoaDepartamento[]> {
  const admin = await createAdminClient()
  const [funcionarios, mandatos] = await Promise.all([
    listarFuncionarios({ situacao: "ativos" }),
    listarMandatos(),
  ])
  const pessoas = new Map<string, PessoaDepartamento>()
  for (const f of funcionarios.linhas) {
    pessoas.set(f.usuarioId, {
      usuarioId: f.usuarioId,
      nome: f.nome ?? "(sem nome)",
      origem: "funcionario",
      cargo: f.cargo,
    })
  }

  const vigente = mandatos.find((m) => m.vigente) ?? mandatos[0]
  if (vigente) {
    const { data: integrantes } = await admin
      .from("diretoria_integrantes")
      .select("nome, cargo, cpf")
      .eq("mandato_id", vigente.id)
    const linhas = (integrantes ?? []) as Record<string, unknown>[]
    const cpfs = [...new Set(linhas.map((i) => cpfConfiavel(texto(i.cpf))).filter(Boolean))] as string[]
    const usuarioPorCpf = new Map<string, string>()
    if (cpfs.length > 0) {
      const { data: us } = await admin
        .from("usuarios")
        .select("id, cpf")
        .in("cpf", cpfs)
      for (const u of us ?? []) {
        if (u.cpf && !usuarioPorCpf.has(String(u.cpf))) {
          usuarioPorCpf.set(String(u.cpf), String(u.id))
        }
      }
    }
    for (const i of linhas) {
      const cpf = texto(i.cpf)
      const usuarioId = cpf ? (usuarioPorCpf.get(cpf) ?? null) : null
      const chave = usuarioId ?? `diretor:${texto(i.nome) ?? cpf ?? Math.random()}`
      if (usuarioId && pessoas.has(usuarioId)) {
        // Funcionário que também é diretor: mantém como funcionário, soma o cargo.
        const p = pessoas.get(usuarioId)!
        p.cargo = [p.cargo, texto(i.cargo)].filter(Boolean).join(" · ") || null
        continue
      }
      pessoas.set(chave, {
        usuarioId,
        nome: texto(i.nome) ?? "(sem nome)",
        origem: "diretor",
        cargo: texto(i.cargo),
      })
    }
  }
  return [...pessoas.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

function slugDe(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export type DadosDepartamento = {
  nome: string
  coordenadorId: string | null
  integrantes: string[]
}

/** O coordenador é uma das pessoas vinculadas ao departamento. */
function erroCoordenador(dados: DadosDepartamento): string | null {
  if (dados.coordenadorId && !dados.integrantes.includes(dados.coordenadorId)) {
    return "O coordenador precisa ser uma das pessoas vinculadas ao departamento — marque-o na lista."
  }
  return null
}

export async function criarDepartamento(
  dados: DadosDepartamento
): Promise<{ id?: string; erro?: string }> {
  const erroCoord = erroCoordenador(dados)
  if (erroCoord) return { erro: erroCoord }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("empresa_departamentos")
    .insert({
      departamento: dados.nome,
      coordenador_id: dados.coordenadorId,
      slug: slugDe(dados.nome),
      organizacao_id: emp,
      emp_proprietaria_id: emp,
    })
    .select("id")
    .single()
  if (error) return { erro: `Não foi possível criar: ${error.message}` }
  const id = String(data.id)
  const { erro } = await definirIntegrantes(id, dados.integrantes)
  if (erro) return { erro }
  return { id }
}

export async function atualizarDepartamento(
  id: string,
  dados: DadosDepartamento
): Promise<{ erro?: string }> {
  const erro = erroCoordenador(dados)
  if (erro) return { erro }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("empresa_departamentos")
    .update({
      departamento: dados.nome,
      coordenador_id: dados.coordenadorId,
      slug: slugDe(dados.nome),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .select("id")
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if ((data ?? []).length === 0) return { erro: "Departamento não encontrado." }
  return definirIntegrantes(id, dados.integrantes)
}

/** Substitui o conjunto de integrantes (a tabela é um par simples, sem id). */
async function definirIntegrantes(
  departamentoId: string,
  usuarioIds: string[]
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const unicos = [...new Set(usuarioIds.filter(Boolean))]
  const { error: erroApagar } = await admin
    .from("empresa_departamentos_integrantes")
    .delete()
    .eq("departamento_id", departamentoId)
  if (erroApagar) return { erro: `Não foi possível salvar os integrantes: ${erroApagar.message}` }
  if (unicos.length === 0) return {}
  const { error } = await admin
    .from("empresa_departamentos_integrantes")
    .insert(unicos.map((usuario_id) => ({ departamento_id: departamentoId, usuario_id })))
  if (error) return { erro: `Não foi possível salvar os integrantes: ${error.message}` }
  return {}
}

/**
 * Desativa o departamento (legado) em vez de apagar: compras, ofícios e contas
 * continuam apontando para ele. Só depois de retiradas as pessoas e o
 * coordenador — ninguém fica ligado a um departamento que não existe mais.
 */
export async function tornarLegado(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: dep }, { count }] = await Promise.all([
    admin
      .from("empresa_departamentos")
      .select("id, coordenador_id")
      .eq("id", id)
      .eq("emp_proprietaria_id", emp)
      .maybeSingle(),
    admin
      .from("empresa_departamentos_integrantes")
      .select("usuario_id", { count: "exact", head: true })
      .eq("departamento_id", id),
  ])
  if (!dep) return { erro: "Departamento não encontrado." }
  if ((count ?? 0) > 0 || dep.coordenador_id) {
    return {
      erro: "Antes de tornar legado, retire as pessoas vinculadas e o coordenador e salve o departamento.",
    }
  }
  const { error } = await admin
    .from("empresa_departamentos")
    .update({ legado: true, legado_em: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  if (error) {
    return {
      erro: esquemaAusente(error)
        ? "Rode supabase/departamentos-ajustes.sql no Supabase para tornar departamentos legados."
        : `Não foi possível tornar legado: ${error.message}`,
    }
  }
  return {}
}

export async function reativarDepartamento(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("empresa_departamentos")
    .update({ legado: false, legado_em: null })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível reativar: ${error.message}` }
  return {}
}

/**
 * Departamentos (nomes) de várias pessoas de uma vez — integrante ou
 * coordenador; legados ficam de fora. Para a linha do membro do mandato.
 */
export async function departamentosPorUsuario(usuarioIds: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>()
  const unicos = [...new Set(usuarioIds.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const comLegado = await admin
    .from("empresa_departamentos")
    .select("id, departamento, coordenador_id, legado")
    .eq("emp_proprietaria_id", emp)
  const deps = ((comLegado.error
    ? (await admin.from("empresa_departamentos").select("id, departamento, coordenador_id").eq("emp_proprietaria_id", emp)).data
    : comLegado.data) ?? []) as Record<string, unknown>[]
  const ativos = deps.filter((d) => d.legado !== true)
  const nome = new Map(ativos.map((d) => [String(d.id), texto(d.departamento) ?? "(sem nome)"]))
  const somar = (usuario: string, depId: string) => {
    const n = nome.get(depId)
    if (!n) return
    const lista = mapa.get(usuario) ?? []
    if (!lista.includes(n)) lista.push(n)
    mapa.set(usuario, lista)
  }
  for (const d of ativos) if (d.coordenador_id && unicos.includes(String(d.coordenador_id))) somar(String(d.coordenador_id), String(d.id))
  const { data: integ } = await admin
    .from("empresa_departamentos_integrantes")
    .select("departamento_id, usuario_id")
    .in("usuario_id", unicos)
  for (const i of integ ?? []) somar(String(i.usuario_id), String(i.departamento_id))
  for (const lista of mapa.values()) lista.sort((a, b) => a.localeCompare(b, "pt-BR"))
  return mapa
}

/**
 * Nome de cada pessoa por usuário. Muitos cadastros de usuário vieram do
 * Bubble SEM nome (só CPF e e-mail — em 18/09, 3.287 no tenant real); para
 * eles o nome vem da diretoria (integrante ligado ao usuário ou ao CPF) e,
 * sem isso, da filiação pelo CPF.
 */
async function nomesDePessoas(ids: string[]): Promise<Map<string, string>> {
  const nomes = await nomesDosUsuarios(ids)
  const faltam = [...new Set(ids.filter((id) => id && !nomes.has(id)))]
  if (faltam.length === 0) return nomes
  const admin = await createAdminClient()
  const { data: us } = await admin.from("usuarios").select("id, cpf").in("id", faltam)
  const cpfDe = new Map(
    ((us ?? []) as Record<string, unknown>[]).map((u) => [String(u.id), cpfConfiavel(texto(u.cpf))])
  )
  const cpfs = [...new Set([...cpfDe.values()].filter((c): c is string => Boolean(c)))]
  const [{ data: dir }, { data: fil }] = await Promise.all([
    admin.from("diretoria_integrantes").select("usuario_id, cpf, nome").or(
      [`usuario_id.in.(${faltam.join(",")})`, ...(cpfs.length ? [`cpf.in.(${cpfs.join(",")})`] : [])].join(",")
    ),
    cpfs.length
      ? admin.from("filiacoes").select("cpf, nome_completo").in("cpf", cpfs)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const porUsuario = new Map<string, string>()
  const porCpf = new Map<string, string>()
  for (const d of (dir ?? []) as Record<string, unknown>[]) {
    const nome = texto(d.nome)
    if (!nome) continue
    if (d.usuario_id) porUsuario.set(String(d.usuario_id), nome)
    const cpf = cpfConfiavel(texto(d.cpf))
    if (cpf) porCpf.set(cpf, nome)
  }
  for (const f of (fil ?? []) as Record<string, unknown>[]) {
    const cpf = cpfConfiavel(texto(f.cpf))
    const nome = texto(f.nome_completo)
    if (cpf && nome && !porCpf.has(cpf)) porCpf.set(cpf, nome)
  }
  for (const id of faltam) {
    const cpf = cpfDe.get(id)
    const nome = porUsuario.get(id) ?? (cpf ? porCpf.get(cpf) : undefined)
    if (nome) nomes.set(id, nome)
  }
  return nomes
}
