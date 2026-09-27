import "server-only"

import { assinantesVigentes } from "@/lib/db/diretoria"
import { enderecoDaSede, listarSedes, obterOrganizacao } from "@/lib/db/organizacao"
import { esquemaAusente } from "@/lib/db/comum"
import { formatarCnpjCpf } from "@/lib/formato"
import {
  pendenciasDaMinuta,
  type ParametrosMinuta,
} from "@/lib/contratos-minutas-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Assistente de minutas de contrato. A minuta guarda os dados informados
 * (`parametros`) e o texto atual; cada mudança de texto vira uma linha em
 * `contratos_minutas_versoes`. Ver supabase/contratos-minutas.sql.
 */

export const AVISO_SQL_MINUTAS =
  "O assistente de minutas usa tabelas novas — rode supabase/contratos-minutas.sql no Supabase."

export type MinutaLista = {
  id: string
  titulo: string | null
  tipo: string | null
  contratoId: string | null
  contratoCodigo: string | null
  outraParte: string | null
  versao: number
  finalizada: boolean
  pendencias: number
  updatedAt: string | null
}

export type VersaoMinuta = {
  id: string
  versao: number
  texto: string
  origem: string
  pedido: string | null
  autor: string | null
  createdAt: string | null
}

export type MinutaDetalhe = MinutaLista & {
  parametros: ParametrosMinuta
  texto: string | null
  versoes: VersaoMinuta[]
}

type Linha = Record<string, unknown>

const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

function paraLista(r: Linha, codigos: Map<string, string | null>): MinutaLista {
  const parametros = (r.parametros ?? {}) as Partial<ParametrosMinuta>
  const contratoId = txt(r.contrato_id)
  return {
    id: r.id as string,
    titulo: txt(r.titulo),
    tipo: txt(r.tipo),
    contratoId,
    contratoCodigo: contratoId ? (codigos.get(contratoId) ?? null) : null,
    outraParte: txt(parametros.outraParteNome),
    versao: Number(r.versao ?? 0),
    finalizada: r.finalizada === true,
    pendencias: pendenciasDaMinuta(txt(r.texto)).length,
    updatedAt: txt(r.updated_at),
  }
}

async function codigosDosContratos(ids: string[]): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>()
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("contratos")
    .select("id, codigo")
    .in("id", unicos)
    .eq("emp_proprietaria_id", await tenantAtual())
  for (const c of data ?? []) mapa.set(c.id as string, txt(c.codigo))
  return mapa
}

export async function listarMinutas(
  filtro: { contratoId?: string } = {}
): Promise<{ disponivel: boolean; minutas: MinutaLista[] }> {
  const admin = await createAdminClient()
  let q = admin
    .from("contratos_minutas")
    .select("id, titulo, tipo, contrato_id, parametros, texto, versao, finalizada, updated_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("deletado", false)
    .order("updated_at", { ascending: false })
    .limit(500)
  if (filtro.contratoId) q = q.eq("contrato_id", filtro.contratoId)
  const { data, error } = await q
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, minutas: [] }
    throw new Error(`Falha ao listar as minutas: ${error.message}`)
  }
  const linhas = (data ?? []) as Linha[]
  const codigos = await codigosDosContratos(
    linhas.map((l) => txt(l.contrato_id)).filter((v): v is string => Boolean(v))
  )
  return { disponivel: true, minutas: linhas.map((l) => paraLista(l, codigos)) }
}

export async function obterMinuta(id: string): Promise<MinutaDetalhe | null> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data, error } = await admin
    .from("contratos_minutas")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .eq("deletado", false)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao abrir a minuta: ${error.message}`)
  }
  if (!data) return null
  const r = data as Linha

  const { data: versoesBrutas } = await admin
    .from("contratos_minutas_versoes")
    .select("id, versao, texto, origem, pedido, criado_por_id, created_at")
    .eq("minuta_id", id)
    .eq("emp_proprietaria_id", empId)
    .order("versao", { ascending: false })
  const autoresIds = [
    ...new Set((versoesBrutas ?? []).map((v) => txt(v.criado_por_id)).filter(Boolean)),
  ] as string[]
  const autores = new Map<string, string>()
  if (autoresIds.length) {
    const { data: us } = await admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra")
      .in("id", autoresIds)
    for (const u of us ?? []) {
      autores.set(u.id as string, txt(u.nome_guerra) ?? txt(u.nome_completo) ?? "")
    }
  }

  const codigos = await codigosDosContratos(txt(r.contrato_id) ? [r.contrato_id as string] : [])
  return {
    ...paraLista(r, codigos),
    parametros: (r.parametros ?? {}) as ParametrosMinuta,
    texto: txt(r.texto),
    versoes: (versoesBrutas ?? []).map((v) => ({
      id: v.id as string,
      versao: Number(v.versao),
      texto: String(v.texto ?? ""),
      origem: String(v.origem ?? "ia"),
      pedido: txt(v.pedido),
      autor: txt(v.criado_por_id) ? (autores.get(v.criado_por_id as string) ?? null) : null,
      createdAt: txt(v.created_at),
    })),
  }
}

// ── Qualificação das partes (vai para o prompt) ─────────────────────────────

export type Qualificacoes = {
  entidade: string
  entidadeNome: string
  assinante: string | null
  outraParte: string
  outraParteNome: string | null
  cidade: string | null
}

/** Nome, documento e endereço de uma `empresa` cadastrada (fornecedor). */
async function qualificacaoDaEmpresa(
  id: string
): Promise<{ nome: string | null; texto: string } | null> {
  const admin = await createAdminClient()
  const { data: e } = await admin
    .from("empresa")
    .select("nome_razao, nome_fantasia, cnpj_cpf, pessoa_juridica")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!e) return null
  const { data: end } = await admin
    .from("enderecos")
    .select("logradouro, numero, complemento, bairro, cidade, estado, cep")
    .eq("empresa_id", id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  const nome = txt(e.nome_razao) ?? txt(e.nome_fantasia)
  const doc = txt(e.cnpj_cpf)
  const pj = e.pessoa_juridica !== false && (doc?.replace(/\D/g, "").length ?? 14) > 11
  const endereco = end
    ? [
        [txt(end.logradouro), txt(end.numero)].filter(Boolean).join(", "),
        txt(end.complemento),
        txt(end.bairro),
        [txt(end.cidade), txt(end.estado)].filter(Boolean).join("/"),
        txt(end.cep) ? `CEP ${end.cep}` : null,
      ]
        .filter(Boolean)
        .join(" — ")
    : null
  return {
    nome,
    texto: [
      nome ?? "[PREENCHER: nome]",
      doc ? `${pj ? "CNPJ" : "CPF"} ${formatarCnpjCpf(doc)}` : null,
      endereco ? `com endereço em ${endereco}` : null,
    ]
      .filter(Boolean)
      .join(", "),
  }
}

export async function qualificacoesDaMinuta(p: ParametrosMinuta): Promise<Qualificacoes> {
  const [org, { sedes }, assinantes, empresa] = await Promise.all([
    obterOrganizacao(),
    listarSedes(),
    assinantesVigentes(),
    p.outraParteId ? qualificacaoDaEmpresa(p.outraParteId) : Promise.resolve(null),
  ])
  const sede = sedes.find((s) => s.id === p.sedeId) ?? sedes[0] ?? null
  const endSede = sede ? enderecoDaSede(sede) : null
  const entidadeNome = org?.nomeRazao ?? org?.nomeFantasia ?? "a entidade"
  const assinante = assinantes.find((a) => a.id === p.assinanteId) ?? null

  const outraParteNome = p.outraParteNome ?? empresa?.nome ?? null
  const outraParte = [
    empresa?.texto,
    p.outraParteQualificacao,
    p.outraParteRepresentante ? `neste ato representada por ${p.outraParteRepresentante}` : null,
  ]
    .filter(Boolean)
    .join("; ")

  return {
    entidadeNome,
    entidade: [
      entidadeNome,
      org?.cnpjCpf ? `CNPJ ${formatarCnpjCpf(org.cnpjCpf)}` : null,
      endSede ? `com sede em ${endSede}` : null,
    ]
      .filter(Boolean)
      .join(", "),
    assinante: assinante ? `${assinante.nome}${assinante.cargo ? `, ${assinante.cargo}` : ""}` : null,
    outraParte: outraParte || outraParteNome || "",
    outraParteNome,
    cidade: sede?.cidade ?? null,
  }
}

// ── Escrita ─────────────────────────────────────────────────────────────────

export async function criarMinuta(dados: {
  titulo: string
  parametros: ParametrosMinuta
  contratoId: string | null
  texto: string
  usuarioId: string
}): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data, error } = await admin
    .from("contratos_minutas")
    .insert({
      emp_proprietaria_id: empId,
      titulo: dados.titulo,
      tipo: dados.parametros.tipoNome,
      tipo_id: dados.parametros.tipoId,
      parametros: dados.parametros,
      contrato_id: dados.contratoId,
      texto: dados.texto,
      versao: 1,
      criado_por_id: dados.usuarioId,
      atualizado_por_id: dados.usuarioId,
    })
    .select("id")
    .single()
  if (error || !data) {
    if (error && esquemaAusente(error)) return { erro: AVISO_SQL_MINUTAS }
    return { erro: `Não foi possível criar a minuta: ${error?.message ?? "?"}` }
  }
  const { error: erroVersao } = await admin.from("contratos_minutas_versoes").insert({
    emp_proprietaria_id: empId,
    minuta_id: data.id,
    versao: 1,
    texto: dados.texto,
    origem: "ia",
    criado_por_id: dados.usuarioId,
  })
  if (erroVersao) return { erro: `Minuta criada, mas a versão não foi guardada: ${erroVersao.message}` }
  return { id: data.id as string }
}

/** Grava um novo texto como a próxima versão (IA, ajuste, edição ou restauração). */
export async function novaVersaoMinuta(dados: {
  id: string
  texto: string
  origem: "ia" | "ajuste" | "edicao" | "restauracao"
  pedido?: string | null
  usuarioId: string
  parametros?: ParametrosMinuta
}): Promise<{ versao?: number; erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: atual } = await admin
    .from("contratos_minutas")
    .select("versao, texto")
    .eq("id", dados.id)
    .eq("emp_proprietaria_id", empId)
    .eq("deletado", false)
    .maybeSingle()
  if (!atual) return { erro: "Minuta não encontrada." }
  if (dados.origem === "edicao" && (atual.texto ?? "") === dados.texto) {
    return { versao: Number(atual.versao) }
  }
  const versao = Number(atual.versao ?? 0) + 1
  const { error } = await admin.from("contratos_minutas_versoes").insert({
    emp_proprietaria_id: empId,
    minuta_id: dados.id,
    versao,
    texto: dados.texto,
    origem: dados.origem,
    pedido: dados.pedido ?? null,
    criado_por_id: dados.usuarioId,
  })
  if (error) return { erro: `Não foi possível guardar a versão: ${error.message}` }
  const { error: erroMinuta } = await admin
    .from("contratos_minutas")
    .update({
      texto: dados.texto,
      versao,
      atualizado_por_id: dados.usuarioId,
      updated_at: new Date().toISOString(),
      ...(dados.parametros
        ? { parametros: dados.parametros, tipo: dados.parametros.tipoNome, tipo_id: dados.parametros.tipoId }
        : {}),
    })
    .eq("id", dados.id)
    .eq("emp_proprietaria_id", empId)
  if (erroMinuta) return { erro: `Não foi possível salvar a minuta: ${erroMinuta.message}` }
  return { versao }
}

export async function atualizarDadosMinuta(
  id: string,
  dados: { titulo?: string; contratoId?: string | null; finalizada?: boolean },
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const mudancas: Record<string, unknown> = {
    atualizado_por_id: usuarioId,
    updated_at: new Date().toISOString(),
  }
  if (dados.titulo !== undefined) mudancas.titulo = dados.titulo
  if (dados.contratoId !== undefined) mudancas.contrato_id = dados.contratoId
  if (dados.finalizada !== undefined) mudancas.finalizada = dados.finalizada
  const { error, count } = await admin
    .from("contratos_minutas")
    .update(mudancas, { count: "exact" })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("deletado", false)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Minuta não encontrada." }
  return {}
}

export async function excluirMinuta(id: string, usuarioId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("contratos_minutas")
    .update({ deletado: true, atualizado_por_id: usuarioId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return {}
}

/** Contrato cadastrado → dados iniciais da minuta (objeto, valor, vigência, outra parte). */
export async function parametrosDoContrato(
  contratoId: string
): Promise<Partial<ParametrosMinuta> | null> {
  const admin = await createAdminClient()
  const { data: c } = await admin
    .from("contratos")
    .select("id, objeto, valor, vigencia_inicio, vigencia_termino, fornecedor_id")
    .eq("id", contratoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!c) return null
  const data = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split("-").reverse().join("/") : null)
  const inicio = data(c.vigencia_inicio)
  const fim = data(c.vigencia_termino)
  return {
    outraParteId: txt(c.fornecedor_id),
    objeto: txt(c.objeto) ?? "",
    valor:
      typeof c.valor === "number"
        ? c.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : null,
    vigencia: inicio || fim ? [inicio ? `de ${inicio}` : null, fim ? `até ${fim}` : null].filter(Boolean).join(" ") : null,
  }
}
