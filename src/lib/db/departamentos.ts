import "server-only"

import { nomesDosUsuarios, texto } from "@/lib/db/comum"
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
 * por departamento), Demandas e o quadro de pessoas atribuíveis (coordenadores).
 */

export type IntegranteDepartamento = { usuarioId: string; nome: string }

export type Departamento = {
  id: string
  nome: string
  coordenadorId: string | null
  coordenadorNome: string | null
  integrantes: IntegranteDepartamento[]
  /** Referências que impedem a exclusão. */
  usoEmCompras: number
  usoEmDemandas: number
}

export async function listarDepartamentosCompletos(): Promise<Departamento[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("empresa_departamentos")
    .select("id, departamento, coordenador_id")
    .eq("emp_proprietaria_id", emp)
    .order("departamento", { ascending: true })
  if (error) throw new Error(`Falha ao listar departamentos: ${error.message}`)
  const linhas = (data ?? []) as Record<string, unknown>[]
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

  const nomes = await nomesDosUsuarios([
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
    const cpfs = [...new Set(linhas.map((i) => texto(i.cpf)).filter(Boolean))] as string[]
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

export async function criarDepartamento(
  dados: DadosDepartamento
): Promise<{ id?: string; erro?: string }> {
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

/** Exclui só departamento sem uso em Compras e Demandas; integrantes vão junto. */
export async function excluirDepartamento(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [compras, demandas] = await Promise.all([
    admin
      .from("permissoes_compras_depto")
      .select("departamento_id", { count: "exact", head: true })
      .eq("departamento_id", id),
    admin
      .from("demandas_departamentos")
      .select("departamento_id", { count: "exact", head: true })
      .eq("departamento_id", id),
  ])
  if ((compras.count ?? 0) > 0 || (demandas.count ?? 0) > 0) {
    return {
      erro: "Este departamento é usado em Compras ou Demandas — desvincule antes de excluir.",
    }
  }
  await admin.from("empresa_departamentos_integrantes").delete().eq("departamento_id", id)
  const { error } = await admin
    .from("empresa_departamentos")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return {}
}
