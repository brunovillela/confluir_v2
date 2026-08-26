import "server-only"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import { eAutomatico, type TipoOficio } from "@/lib/oficios-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Ofícios — documento numerado por ano. Ver supabase/oficios.sql e
 * [[confluir-ferramentas-administrativas]].
 *
 * • desfiliacao/filiacao são AUTOMÁTICOS: a lista sai de `filiacao_vinculos`
 *   da fonte pagadora (destinatario_empresa_id).
 * • O número é atribuído SÓ na emissão (max+1 do ano, ou informado), protegido
 *   pelo unique(emp, ano, numero) — colisão dispara nova tentativa.
 * • Nome/matrícula/assinante ficam em SNAPSHOT: ofício emitido é imutável.
 */

const AVISO_SQL = "Ofícios ainda não configurados — rode supabase/oficios.sql no Supabase."

function anoDe(data: string | null): number {
  return data ? Number(data.slice(0, 4)) : new Date().getFullYear()
}

// ── Lookups ─────────────────────────────────────────────────────────────────

export type OpcaoEmpresa = {
  id: string
  nome: string
  cnpj_cpf: string | null
  bloqueado: boolean
}

/** Empresas para o combobox de destinatário. */
export async function listarEmpresas(): Promise<OpcaoEmpresa[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa")
    .select("id, nome_razao, nome_fantasia, cnpj_cpf")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome_razao", { ascending: true })
    .limit(3000)
  return (data ?? [])
    .map((e) => ({
      id: e.id as string,
      nome: (texto(e.nome_fantasia) ?? texto(e.nome_razao) ?? "(sem nome)") as string,
      cnpj_cpf: texto(e.cnpj_cpf),
      bloqueado: false,
    }))
    .filter((e) => e.nome !== "(sem nome)")
}

// ── Listagem ────────────────────────────────────────────────────────────────

export type OficioLinha = {
  id: string
  tipo: string | null
  numero: number | null
  ano: number | null
  data: string | null
  assunto: string | null
  destinatarioNome: string | null
  situacao: string | null
}

export async function listarOficios(filtro: {
  ano?: number
  situacao?: string
  busca?: string
} = {}): Promise<{ disponivel: boolean; oficios: OficioLinha[] }> {
  const admin = await createAdminClient()
  let query = admin
    .from("oficios")
    .select(
      "id, tipo, numero, ano, data, assunto, situacao, destinatario_empresa_id, destinatario_texto"
    )
    .eq("emp_proprietaria_id", await tenantAtual())

  if (filtro.ano) query = query.eq("ano", filtro.ano)
  if (filtro.situacao) query = query.eq("situacao", filtro.situacao)
  const busca = (filtro.busca ?? "").trim()
  if (busca) query = query.ilike("assunto", `%${busca}%`)

  const { data, error } = await query
    .order("ano", { ascending: false, nullsFirst: true })
    .order("numero", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, oficios: [] }
    throw new Error(`Falha ao listar ofícios: ${error.message}`)
  }

  const linhas = data ?? []
  const nomes = await nomesDasEmpresas(
    linhas.map((o) => o.destinatario_empresa_id as string).filter(Boolean)
  )
  return {
    disponivel: true,
    oficios: linhas.map((o) => ({
      id: o.id as string,
      tipo: texto(o.tipo),
      numero: (o.numero as number | null) ?? null,
      ano: (o.ano as number | null) ?? null,
      data: texto(o.data),
      assunto: texto(o.assunto),
      destinatarioNome: o.destinatario_empresa_id
        ? (nomes.get(o.destinatario_empresa_id as string) ?? null)
        : texto(o.destinatario_texto),
      situacao: texto(o.situacao),
    })),
  }
}

async function nomesDasEmpresas(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa")
    .select("id, nome_razao, nome_fantasia")
    .in("id", unicos)
  for (const e of data ?? []) {
    const nome = texto(e.nome_fantasia) ?? texto(e.nome_razao)
    if (nome) mapa.set(e.id as string, nome)
  }
  return mapa
}

export async function resumoOficios(): Promise<{
  total: number
  rascunhos: number
  anoAtual: number
  emitidosAno: number
}> {
  const admin = await createAdminClient()
  const ano = new Date().getFullYear()
  const empId = await tenantAtual()
  const base = () =>
    admin
      .from("oficios")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", empId)
  // Contagens no banco (o teto de 1.000 linhas do PostgREST subestimaria em JS).
  const [{ count: total }, { count: rascunhos }, { count: emitidosAno }] =
    await Promise.all([
      base(),
      base().eq("situacao", "Rascunho"),
      base().eq("situacao", "Emitido").eq("ano", ano),
    ])
  return {
    total: total ?? 0,
    rascunhos: rascunhos ?? 0,
    anoAtual: ano,
    emitidosAno: emitidosAno ?? 0,
  }
}

// ── Detalhe ─────────────────────────────────────────────────────────────────

export type FiliadoOficio = {
  id: string
  nome: string | null
  matricula: string | null
  vinculoId: string | null
}

export type DetalheOficio = {
  id: string
  tipo: string | null
  numero: number | null
  ano: number | null
  data: string | null
  sedeId: string | null
  destinatarioEmpresaId: string | null
  destinatarioNome: string | null
  destinatarioTexto: string | null
  aosCuidados: string | null
  assunto: string | null
  corpo: string | null
  saudacao: string | null
  fecho: string | null
  assinanteIntegranteId: string | null
  assinanteNome: string | null
  assinanteCargo: string | null
  situacao: string | null
  filiados: FiliadoOficio[]
}

export async function obterOficio(id: string): Promise<DetalheOficio | null> {
  const admin = await createAdminClient()
  const { data: o } = await admin
    .from("oficios")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!o) return null

  const empresaId = texto(o.destinatario_empresa_id)
  const [nomes, { data: filiados }] = await Promise.all([
    empresaId ? nomesDasEmpresas([empresaId]) : Promise.resolve(new Map()),
    admin
      .from("oficios_filiados")
      .select("id, nome, matricula, vinculo_id, ordem")
      .eq("oficio_id", id)
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true }),
  ])

  return {
    id: o.id as string,
    tipo: texto(o.tipo),
    numero: (o.numero as number | null) ?? null,
    ano: (o.ano as number | null) ?? null,
    data: texto(o.data),
    sedeId: texto(o.sede_id),
    destinatarioEmpresaId: empresaId,
    destinatarioNome: empresaId ? (nomes.get(empresaId) ?? null) : null,
    destinatarioTexto: texto(o.destinatario_texto),
    aosCuidados: texto(o.aos_cuidados),
    assunto: texto(o.assunto),
    corpo: texto(o.corpo),
    saudacao: texto(o.saudacao),
    fecho: texto(o.fecho),
    assinanteIntegranteId: texto(o.assinante_integrante_id),
    assinanteNome: texto(o.assinante_nome),
    assinanteCargo: texto(o.assinante_cargo),
    situacao: texto(o.situacao),
    filiados: (filiados ?? []).map((f) => ({
      id: f.id as string,
      nome: texto(f.nome),
      matricula: texto(f.matricula),
      vinculoId: texto(f.vinculo_id),
    })),
  }
}

// ── Escrita (rascunho) ──────────────────────────────────────────────────────

export type DadosOficio = {
  tipo: TipoOficio
  data: string | null
  sede_id: string | null
  destinatario_empresa_id: string | null
  destinatario_texto: string | null
  aos_cuidados: string | null
  assunto: string | null
  corpo: string | null
  assinante_integrante_id: string | null
}

export async function criarOficio(
  dados: DadosOficio
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("oficios")
    .insert({
      ...dados,
      situacao: "Rascunho",
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Falha ao criar ofício: ${error.message}` }
  }
  return { id: data.id as string }
}

export async function atualizarOficio(
  id: string,
  dados: DadosOficio
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("oficios")
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "Rascunho")
  if (error) return { erro: `Falha ao salvar ofício: ${error.message}` }
  return {}
}

// ── Emissão (numeração atômica) ─────────────────────────────────────────────

/** Próximo número disponível para o ano do documento (default do campo de emissão). */
export async function proximoNumeroDoAno(data: string | null): Promise<number> {
  return proximoNumero(anoDe(data))
}

async function proximoNumero(ano: number): Promise<number> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("oficios")
    .select("numero")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ano", ano)
    .not("numero", "is", null)
    .order("numero", { ascending: false })
    .limit(1)
  const max = data?.[0]?.numero as number | undefined
  return (max ?? 0) + 1
}

export async function emitirOficio(
  id: string,
  numeroManual?: number | null
): Promise<{ erro?: string; numero?: number; ano?: number }> {
  const admin = await createAdminClient()
  const { data: o } = await admin
    .from("oficios")
    .select(
      "situacao, data, assinante_integrante_id, destinatario_empresa_id, destinatario_texto"
    )
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!o) return { erro: "Ofício não encontrado." }
  if (o.situacao !== "Rascunho") return { erro: "O ofício já foi emitido ou cancelado." }
  if (!o.assinante_integrante_id) return { erro: "Selecione o assinante (diretoria) antes de emitir." }
  if (!o.destinatario_empresa_id && !texto(o.destinatario_texto))
    return { erro: "Informe o destinatário antes de emitir." }

  // Snapshot do assinante a partir da diretoria.
  const { data: integrante } = await admin
    .from("diretoria_integrantes")
    .select("nome, cargo")
    .eq("id", o.assinante_integrante_id)
    .maybeSingle()
  if (!integrante) return { erro: "Assinante não encontrado na diretoria." }

  const ano = anoDe(texto(o.data))

  // Tenta atribuir número; em colisão (unique), recomputa e repete.
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const numero = numeroManual && tentativa === 0 ? numeroManual : await proximoNumero(ano)
    const { error } = await admin
      .from("oficios")
      .update({
        numero,
        ano,
        situacao: "Emitido",
        emitido_em: new Date().toISOString(),
        assinante_nome: texto(integrante.nome),
        assinante_cargo: texto(integrante.cargo),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("situacao", "Rascunho")
    if (!error) return { numero, ano }
    if (error.code !== "23505") return { erro: `Falha ao emitir: ${error.message}` }
    // 23505 = número já usado; se foi manual, avisa; senão repete com max+1.
    if (numeroManual && tentativa === 0) {
      return { erro: `O número ${numeroManual}/${ano} já existe. Deixe em branco para usar o próximo.` }
    }
  }
  return { erro: "Não foi possível atribuir o número. Tente novamente." }
}

export async function cancelarOficio(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("oficios")
    .update({ situacao: "Cancelado", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao cancelar: ${error.message}` }
  return {}
}

// ── Lista de filiados (automáticos) ─────────────────────────────────────────

export type CandidatoFiliado = {
  vinculoId: string
  filiacaoId: string | null
  nome: string | null
  matricula: string | null
  data: string | null
}

/**
 * Filiados/desfiliados de uma fonte pagadora ainda não incluídos em ofício
 * emitido — candidatos para um novo ofício automático.
 */
export async function candidatosDaEmpresa(
  empresaId: string,
  tipo: "desfiliacao" | "filiacao",
  janela: { de?: string; ate?: string } = {}
): Promise<CandidatoFiliado[]> {
  const admin = await createAdminClient()
  const campoData = tipo === "desfiliacao" ? "data_desfiliacao" : "data_filiacao"

  let query = admin
    .from("filiacao_vinculos")
    .select("id, filiado_id, matricula, fonte_pg_matricula, " + campoData)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("fonte_pagadora_id", empresaId)
    .not(campoData, "is", null)
  if (janela.de) query = query.gte(campoData, janela.de)
  if (janela.ate) query = query.lte(campoData, janela.ate)

  const { data, error } = await query.order(campoData, { ascending: false }).limit(500)
  if (error) throw new Error(`Falha ao buscar candidatos: ${error.message}`)
  // Select dinâmico (campoData) impede a inferência do tipo — tratamos como bruto.
  const vinculos = (data ?? []) as unknown as Record<string, unknown>[]
  if (vinculos.length === 0) return []

  // Exclui os já oficiados (em ofício não cancelado).
  const jaOficiados = await vinculosJaOficiados(vinculos.map((v) => v.id as string))

  // Nomes dos filiados.
  const filiadoIds = [...new Set(vinculos.map((v) => v.filiado_id).filter(Boolean))] as string[]
  const nomes = new Map<string, string>()
  if (filiadoIds.length > 0) {
    const { data: fs } = await admin
      .from("filiacoes")
      .select("id, nome_completo")
      .in("id", filiadoIds)
    for (const f of fs ?? []) {
      const n = texto(f.nome_completo)
      if (n) nomes.set(f.id as string, n)
    }
  }

  return vinculos
    .filter((v) => !jaOficiados.has(v.id as string))
    .map((v) => {
      const filiadoId = texto(v.filiado_id)
      return {
        vinculoId: v.id as string,
        filiacaoId: filiadoId,
        nome: filiadoId ? (nomes.get(filiadoId) ?? null) : null,
        matricula: texto(v.matricula) ?? texto(v.fonte_pg_matricula),
        data: texto(v[campoData]),
      }
    })
}

async function vinculosJaOficiados(vinculoIds: string[]): Promise<Set<string>> {
  const usados = new Set<string>()
  const ids = [...new Set(vinculoIds.filter(Boolean))]
  if (ids.length === 0) return usados
  const admin = await createAdminClient()
  const { data } = await admin
    .from("oficios_filiados")
    .select("vinculo_id, oficios!inner(situacao)")
    .in("vinculo_id", ids)
    .neq("oficios.situacao", "Cancelado")
  for (const r of data ?? []) {
    const v = (r as { vinculo_id: string | null }).vinculo_id
    if (v) usados.add(v)
  }
  return usados
}

export async function adicionarFiliados(
  oficioId: string,
  itens: { vinculoId?: string | null; filiacaoId?: string | null; nome: string; matricula: string | null }[]
): Promise<{ erro?: string; adicionados?: number }> {
  if (itens.length === 0) return { adicionados: 0 }
  const admin = await createAdminClient()
  const { error } = await admin.from("oficios_filiados").insert(
    itens.map((it, i) => ({
      oficio_id: oficioId,
      vinculo_id: it.vinculoId ?? null,
      filiacao_id: it.filiacaoId ?? null,
      nome: it.nome,
      matricula: it.matricula,
      ordem: i,
    }))
  )
  if (error) return { erro: `Falha ao adicionar filiados: ${error.message}` }
  return { adicionados: itens.length }
}

export async function removerFiliado(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("oficios_filiados").delete().eq("id", id)
  if (error) return { erro: `Falha ao remover: ${error.message}` }
  return {}
}

// ── Dados de impressão ──────────────────────────────────────────────────────

export type DadosImpressao = {
  oficio: DetalheOficio
  cidade: string | null
  organizacao: {
    nomeRazao: string | null
    nomeFantasia: string | null
    cnpjCpf: string | null
    logoUrl: string | null
  }
  sedes: { nome: string | null; linha1: string | null; cep: string | null; telefones: string | null }[]
}

export async function dadosImpressao(id: string): Promise<DadosImpressao | null> {
  const oficio = await obterOficio(id)
  if (!oficio) return null
  const admin = await createAdminClient()

  const [{ data: emp }, { data: sedeCab }, { data: sedes }] = await Promise.all([
    admin
      .from("empresa")
      .select("nome_razao, nome_fantasia, cnpj_cpf, logomarca")
      .eq("id", await tenantAtual())
      .maybeSingle(),
    oficio.sedeId
      ? admin.from("empresa_sede").select("cidade, nome").eq("id", oficio.sedeId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("empresa_sede")
      .select("nome, logradouro, numero, bairro, cidade, estado, cep, telefones")
      .eq("emp_proprietaria_id", await tenantAtual())
      .order("nome", { ascending: true }),
  ])

  let logoUrl: string | null = null
  const logo = texto(emp?.logomarca)
  if (logo) {
    if (/^(https?:)?\/\//.test(logo)) logoUrl = logo.startsWith("//") ? `https:${logo}` : logo
    else logoUrl = admin.storage.from("organizacao").getPublicUrl(logo).data.publicUrl
  }

  return {
    oficio,
    cidade: texto(sedeCab?.cidade) ?? texto(sedeCab?.nome),
    organizacao: {
      nomeRazao: texto(emp?.nome_razao),
      nomeFantasia: texto(emp?.nome_fantasia),
      cnpjCpf: texto(emp?.cnpj_cpf),
      logoUrl,
    },
    sedes: (sedes ?? []).map((s) => ({
      nome: texto(s.nome),
      linha1: [
        [texto(s.logradouro), texto(s.numero)].filter(Boolean).join(", "),
        texto(s.bairro),
        [texto(s.cidade), texto(s.estado)].filter(Boolean).join("/"),
      ]
        .filter(Boolean)
        .join(" — ") || null,
      cep: texto(s.cep),
      telefones: texto(s.telefones),
    })),
  }
}

export function eAutomaticoTipo(tipo: string | null): boolean {
  return eAutomatico(tipo)
}
