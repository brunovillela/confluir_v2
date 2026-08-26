import "server-only"
import { esquemaAusente, hojeSP, texto } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import { gerarCodigoProcesso } from "@/lib/db/compras"
import {
  vencimentoParcela,
  MAX_PARCELAS,
  type Periodicidade,
} from "@/lib/custeio-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Custeio Institucional — a instituição banca despesas EM FAVOR DE pessoas
 * (diretores, filiados demitidos políticos, convidados de eventos). Decisões em
 * supabase/custeio-institucional.sql.
 *
 * Fluxo em dois portões: o custeio tem autorização interna própria
 * (rascunho → aguardando_autorizacao → autorizado) e só ao ser AUTORIZADO gera
 * ordens_pagamento (tipo "Custeio", situação "Em autorização"), que então
 * passam pela alçada do Financeiro como qualquer despesa.
 *
 * Favorecido: quando o beneficiário tem conta em `usuarios` (casado por CPF),
 * a ordem usa beneficiario_usuario_id; senão usa o favorecido avulso
 * (beneficiario_nome_avulso/_doc_avulso) — nunca cria fornecedor/empresa.
 *
 * Centro de custo: herdado da FINALIDADE no momento da criação; a ordem já
 * nasce classificada.
 */

function apenasDigitos(v: unknown): string {
  return typeof v === "string" ? v.replace(/\D/g, "") : ""
}

const AVISO_SCHEMA = "Rode supabase/custeio-institucional.sql antes de usar o Custeio."

// ── Tipos ────────────────────────────────────────────────────────────────────

export type FinalidadeLinha = {
  id: string
  nome: string
  descricao: string | null
  tipo_beneficiario_sugerido: string
  centro_custo_despesa_id: string | null
  ativa: boolean
  ordem: number
}

export type ConvidadoLinha = {
  id: string
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  tipo_conta: string | null
  pix: string | null
  tipo_chave_pix: string | null
  observacoes: string | null
}

export type CusteioLinha = {
  id: string
  codigo: string | null
  finalidade_id: string | null
  finalidade_nome: string | null
  tipo_beneficiario: string
  beneficiario_nome: string | null
  descricao: string | null
  cadencia: string
  valor_parcela: number | null
  num_parcelas: number
  situacao: string
  primeiro_vencimento: string | null
  created_at: string | null
}

export type DetalheCusteio = {
  custeio: Record<string, unknown> & {
    id: string
    codigo: string | null
    tipo_beneficiario: string
    situacao: string
  }
  finalidade: FinalidadeLinha | null
  centroCusto: { id: string; nome_da_conta: string | null } | null
  autorizador: string | null
  criadoPor: string | null
  ordens: {
    id: string
    codigo: string | null
    descricao: string | null
    situacao: string | null
    valor_inicial_cobranca: number | null
    valor_pago: number | null
    vencimento: string | null
  }[]
}

export type ResultadoAcao = { ok: true; id?: string } | { erro: string }
export type ResultadoGeracao =
  | { geradas: number; puladas: number }
  | { erro: string }

// ── Finalidades ──────────────────────────────────────────────────────────────

export async function listarFinalidades(
  incluirInativas = false
): Promise<FinalidadeLinha[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("institucional_custeio_finalidades")
    .select(
      "id, nome, descricao, tipo_beneficiario_sugerido, centro_custo_despesa_id, ativa, ordem"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
  if (!incluirInativas) q = q.eq("ativa", true)

  const { data, error } = await q
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar finalidades: ${error.message}`)
  }
  return (data ?? []) as FinalidadeLinha[]
}

export async function buscarFinalidade(
  id: string
): Promise<FinalidadeLinha | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("institucional_custeio_finalidades")
    .select(
      "id, nome, descricao, tipo_beneficiario_sugerido, centro_custo_despesa_id, ativa, ordem"
    )
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return (data as FinalidadeLinha) ?? null
}

export async function salvarFinalidade(dados: {
  id?: string
  nome: string
  descricao?: string | null
  tipoBeneficiarioSugerido: string
  centroCustoDespesaId?: string | null
  ativa: boolean
  ordem?: number
}): Promise<ResultadoAcao> {
  const nome = texto(dados.nome)
  if (!nome) return { erro: "Informe o nome da finalidade." }
  const admin = await createAdminClient()
  const registro = {
    nome,
    descricao: texto(dados.descricao),
    tipo_beneficiario_sugerido: dados.tipoBeneficiarioSugerido || "livre",
    centro_custo_despesa_id: texto(dados.centroCustoDespesaId),
    ativa: dados.ativa,
    ordem: dados.ordem ?? 0,
  }

  if (dados.id) {
    const { error } = await admin
      .from("institucional_custeio_finalidades")
      .update(registro)
      .eq("id", dados.id)
      .eq("emp_proprietaria_id", await tenantAtual())
    if (error) return { erro: `Falha ao salvar finalidade: ${error.message}` }
    return { ok: true, id: dados.id }
  }

  const { data, error } = await admin
    .from("institucional_custeio_finalidades")
    .insert({ ...registro, emp_proprietaria_id: await tenantAtual() })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SCHEMA }
    return { erro: `Falha ao criar finalidade: ${error.message}` }
  }
  return { ok: true, id: (data as { id: string }).id }
}

// ── Convidados externos ────────────────────────────────────────────────────

const SELECT_CONVIDADO =
  "id, nome, cpf, email, telefone, banco, agencia, conta, tipo_conta, pix, tipo_chave_pix, observacoes"

export async function listarConvidados(
  busca = ""
): Promise<ConvidadoLinha[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("institucional_custeio_convidados")
    .select(SELECT_CONVIDADO)
    .eq("emp_proprietaria_id", await tenantAtual())
  const termo = busca.trim()
  if (termo) {
    const escapado = termo.replace(/[%_\\]/g, "\\$&")
    q = q.or(`nome.ilike.%${escapado}%,cpf.ilike.%${escapado}%`)
  }
  const { data, error } = await q.order("nome", { ascending: true }).limit(200)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar convidados: ${error.message}`)
  }
  return (data ?? []) as ConvidadoLinha[]
}

export async function buscarConvidado(
  id: string
): Promise<ConvidadoLinha | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("institucional_custeio_convidados")
    .select(SELECT_CONVIDADO)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return (data as ConvidadoLinha) ?? null
}

export async function salvarConvidado(dados: {
  id?: string
  nome: string
  cpf?: string | null
  email?: string | null
  telefone?: string | null
  banco?: string | null
  agencia?: string | null
  conta?: string | null
  tipoConta?: string | null
  pix?: string | null
  tipoChavePix?: string | null
  observacoes?: string | null
}): Promise<ResultadoAcao> {
  const nome = texto(dados.nome)
  if (!nome) return { erro: "Informe o nome do convidado." }
  const admin = await createAdminClient()
  const registro = {
    nome,
    cpf: texto(dados.cpf),
    email: texto(dados.email),
    telefone: texto(dados.telefone),
    banco: texto(dados.banco),
    agencia: texto(dados.agencia),
    conta: texto(dados.conta),
    tipo_conta: texto(dados.tipoConta),
    pix: texto(dados.pix),
    tipo_chave_pix: texto(dados.tipoChavePix),
    observacoes: texto(dados.observacoes),
    updated_at: new Date().toISOString(),
  }

  if (dados.id) {
    const { error } = await admin
      .from("institucional_custeio_convidados")
      .update(registro)
      .eq("id", dados.id)
      .eq("emp_proprietaria_id", await tenantAtual())
    if (error) return { erro: `Falha ao salvar convidado: ${error.message}` }
    return { ok: true, id: dados.id }
  }

  const { data, error } = await admin
    .from("institucional_custeio_convidados")
    .insert({ ...registro, emp_proprietaria_id: await tenantAtual() })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SCHEMA }
    return { erro: `Falha ao criar convidado: ${error.message}` }
  }
  return { ok: true, id: (data as { id: string }).id }
}

// ── Beneficiários: busca e snapshot ──────────────────────────────────────────

export type BeneficiarioOpcao = {
  id: string
  nome: string
  detalhe: string | null
  cpf: string | null
}

/** Diretores (integrantes de mandatos) para o seletor de beneficiário. */
export async function listarDiretoresParaCusteio(): Promise<BeneficiarioOpcao[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("diretoria_integrantes")
    .select("id, nome, cargo, cpf")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome", { ascending: true })
    .limit(500)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar diretores: ${error.message}`)
  }
  return (data ?? []).map((d) => ({
    id: String(d.id),
    nome: texto(d.nome) ?? "(sem nome)",
    detalhe: texto(d.cargo),
    cpf: texto(d.cpf),
  }))
}

/** Busca filiados por nome ou CPF para o seletor de beneficiário. */
export async function buscarFiliadosParaCusteio(
  termo: string
): Promise<BeneficiarioOpcao[]> {
  const t = termo.trim()
  if (t.length < 2) return []
  const admin = await createAdminClient()
  const escapado = t.replace(/[%_\\]/g, "\\$&")
  const { data, error } = await admin
    .from("filiacoes")
    .select("id, nome_completo, cpf, matricula_sindical")
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("filiacao_excluida", "is", true)
    .or(`nome_completo.ilike.%${escapado}%,cpf.ilike.%${escapado}%`)
    .order("nome_completo", { ascending: true })
    .limit(20)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao buscar filiados: ${error.message}`)
  }
  return (data ?? []).map((f) => ({
    id: String(f.id),
    nome: texto(f.nome_completo) ?? "(sem nome)",
    detalhe: texto(f.matricula_sindical),
    cpf: texto(f.cpf),
  }))
}

type Snapshot = {
  beneficiario_nome: string | null
  beneficiario_cpf: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  tipo_conta: string | null
  pix: string | null
  tipo_chave_pix: string | null
}

const SNAPSHOT_VAZIO: Snapshot = {
  beneficiario_nome: null,
  beneficiario_cpf: null,
  banco: null,
  agencia: null,
  conta: null,
  tipo_conta: null,
  pix: null,
  tipo_chave_pix: null,
}

/** Resolve o snapshot (nome/CPF/banco) do beneficiário selecionado. */
async function resolverSnapshot(
  tipo: string,
  beneficiarioId: string
): Promise<Snapshot> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()

  if (tipo === "convidado") {
    const { data } = await admin
      .from("institucional_custeio_convidados")
      .select(SELECT_CONVIDADO)
      .eq("id", beneficiarioId)
      .eq("emp_proprietaria_id", empId)
      .maybeSingle()
    if (!data) return SNAPSHOT_VAZIO
    return {
      beneficiario_nome: texto(data.nome),
      beneficiario_cpf: texto(data.cpf),
      banco: texto(data.banco),
      agencia: texto(data.agencia),
      conta: texto(data.conta),
      tipo_conta: texto(data.tipo_conta),
      pix: texto(data.pix),
      tipo_chave_pix: texto(data.tipo_chave_pix),
    }
  }

  if (tipo === "diretor") {
    const { data: integrante } = await admin
      .from("diretoria_integrantes")
      .select("id, nome, cpf")
      .eq("id", beneficiarioId)
      .eq("emp_proprietaria_id", empId)
      .maybeSingle()
    if (!integrante) return SNAPSHOT_VAZIO
    const { data: ficha } = await admin
      .from("diretoria_ficha")
      .select("banco, agencia, conta_corrente, pix, tipo_chave_pix")
      .eq("integrante_id", beneficiarioId)
      .maybeSingle()
    return {
      beneficiario_nome: texto(integrante.nome),
      beneficiario_cpf: texto(integrante.cpf),
      banco: texto(ficha?.banco),
      agencia: texto(ficha?.agencia),
      conta: texto(ficha?.conta_corrente),
      tipo_conta: null,
      pix: texto(ficha?.pix),
      tipo_chave_pix: texto(ficha?.tipo_chave_pix),
    }
  }

  // filiado
  const { data: filiado } = await admin
    .from("filiacoes")
    .select("id, nome_completo, cpf")
    .eq("id", beneficiarioId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!filiado) return SNAPSHOT_VAZIO
  return {
    ...SNAPSHOT_VAZIO,
    beneficiario_nome: texto(filiado.nome_completo),
    beneficiario_cpf: texto(filiado.cpf),
  }
}

// ── Custeios: listagem, resumo, detalhe ──────────────────────────────────────

export type FiltrosCusteios = {
  busca?: string
  situacao?: string
  finalidadeId?: string
}

export async function listarCusteios(
  filtros: FiltrosCusteios = {}
): Promise<CusteioLinha[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("institucional_custeios")
    .select(
      "id, codigo, finalidade_id, tipo_beneficiario, beneficiario_nome, descricao, cadencia, valor_parcela, num_parcelas, situacao, primeiro_vencimento, created_at"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("excluido", "is", true)

  if (filtros.situacao && filtros.situacao !== "todas") {
    q = q.eq("situacao", filtros.situacao)
  }
  if (filtros.finalidadeId) q = q.eq("finalidade_id", filtros.finalidadeId)
  const termo = (filtros.busca ?? "").trim()
  if (termo) {
    const escapado = termo.replace(/[%_\\]/g, "\\$&")
    q = q.or(
      `codigo.ilike.%${escapado}%,beneficiario_nome.ilike.%${escapado}%,descricao.ilike.%${escapado}%`
    )
  }

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar custeios: ${error.message}`)
  }

  const finalidades = await listarFinalidades(true)
  const nomeFinalidade = new Map(finalidades.map((f) => [f.id, f.nome]))
  return (data ?? []).map((c) => ({
    id: String(c.id),
    codigo: texto(c.codigo),
    finalidade_id: texto(c.finalidade_id),
    finalidade_nome: c.finalidade_id
      ? (nomeFinalidade.get(String(c.finalidade_id)) ?? null)
      : null,
    tipo_beneficiario: String(c.tipo_beneficiario),
    beneficiario_nome: texto(c.beneficiario_nome),
    descricao: texto(c.descricao),
    cadencia: String(c.cadencia),
    valor_parcela: typeof c.valor_parcela === "number" ? c.valor_parcela : null,
    num_parcelas: typeof c.num_parcelas === "number" ? c.num_parcelas : 1,
    situacao: String(c.situacao),
    primeiro_vencimento: texto(c.primeiro_vencimento),
    created_at: texto(c.created_at),
  }))
}

export type ResumoCusteios = {
  aguardando: number
  autorizados: number
  total: number
}

export async function resumoCusteios(): Promise<ResumoCusteios> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const [aguardando, autorizados, total] = await Promise.all([
    admin
      .from("institucional_custeios")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", empId)
      .not("excluido", "is", true)
      .eq("situacao", "aguardando_autorizacao"),
    admin
      .from("institucional_custeios")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", empId)
      .not("excluido", "is", true)
      .eq("situacao", "autorizado"),
    admin
      .from("institucional_custeios")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", empId)
      .not("excluido", "is", true),
  ])
  return {
    aguardando: aguardando.count ?? 0,
    autorizados: autorizados.count ?? 0,
    total: total.count ?? 0,
  }
}

export async function detalheCusteio(
  id: string
): Promise<DetalheCusteio | null> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()

  const { data: custeio } = await admin
    .from("institucional_custeios")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .not("excluido", "is", true)
    .maybeSingle()
  if (!custeio) return null

  const usuarioIds = [custeio.criado_por_id, custeio.autorizador_id].filter(
    (v): v is string => Boolean(v)
  )

  const [finalidade, centro, usuarios, ordensRes] = await Promise.all([
    custeio.finalidade_id
      ? buscarFinalidade(String(custeio.finalidade_id))
      : Promise.resolve(null),
    custeio.centro_custo_despesa_id
      ? admin
          .from("centros_de_custo")
          .select("id, nome_da_conta")
          .eq("id", custeio.centro_custo_despesa_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    usuarioIds.length
      ? admin
          .from("usuarios")
          .select("id, nome_completo, nome_guerra")
          .in("id", [...new Set(usuarioIds)])
      : Promise.resolve({ data: [] }),
    admin
      .from("ordens_pagamento")
      .select(
        "id, codigo, descricao, situacao, valor_inicial_cobranca, valor_pago, vencimento"
      )
      .eq("custeio_id", id)
      .eq("emp_proprietaria_id", empId)
      .not("excluido", "is", true)
      .order("vencimento", { ascending: true, nullsFirst: false }),
  ])

  const nomes = new Map<string, string>()
  for (const u of usuarios.data ?? []) {
    const nome = [u.nome_completo, u.nome_guerra].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomes.set(u.id, nome)
  }

  return {
    custeio: custeio as DetalheCusteio["custeio"],
    finalidade,
    centroCusto: (centro.data as DetalheCusteio["centroCusto"]) ?? null,
    autorizador: custeio.autorizador_id
      ? (nomes.get(String(custeio.autorizador_id)) ?? null)
      : null,
    criadoPor: custeio.criado_por_id
      ? (nomes.get(String(custeio.criado_por_id)) ?? null)
      : null,
    ordens: (ordensRes.data ?? []) as DetalheCusteio["ordens"],
  }
}

// ── Custeios: escrita e fluxo de autorização ─────────────────────────────────

export type DadosCusteio = {
  finalidadeId: string
  tipoBeneficiario: string
  beneficiarioId: string
  descricao?: string | null
  evento?: string | null
  centroCustoDespesaId?: string | null
  cadencia: string
  valorParcela: number
  numParcelas?: number
  periodicidade?: Periodicidade
  primeiroVencimento?: string | null
  formaPagamento?: string | null
}

async function montarRegistroCusteio(
  dados: DadosCusteio
): Promise<{ registro: Record<string, unknown> } | { erro: string }> {
  if (!texto(dados.finalidadeId)) return { erro: "Escolha a finalidade." }
  if (!texto(dados.beneficiarioId)) return { erro: "Escolha o beneficiário." }
  if (!(dados.valorParcela > 0)) {
    return { erro: "Informe um valor de parcela maior que zero." }
  }
  const recorrente = dados.cadencia === "recorrente"
  if (recorrente) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.primeiroVencimento ?? "")) {
      return { erro: "Informe a data do primeiro vencimento." }
    }
    if (!((dados.numParcelas ?? 0) >= 1)) {
      return { erro: "Informe o número de parcelas." }
    }
  }

  const finalidade = await buscarFinalidade(dados.finalidadeId)
  if (!finalidade) return { erro: "Finalidade não encontrada." }
  const snapshot = await resolverSnapshot(
    dados.tipoBeneficiario,
    dados.beneficiarioId
  )
  if (!snapshot.beneficiario_nome) {
    return { erro: "Beneficiário não encontrado para o tipo selecionado." }
  }

  const centroCusto =
    texto(dados.centroCustoDespesaId) ?? finalidade.centro_custo_despesa_id

  return {
    registro: {
    finalidade_id: dados.finalidadeId,
    tipo_beneficiario: dados.tipoBeneficiario,
    diretoria_integrante_id:
      dados.tipoBeneficiario === "diretor" ? dados.beneficiarioId : null,
    filiacao_id:
      dados.tipoBeneficiario === "filiado" ? dados.beneficiarioId : null,
    convidado_id:
      dados.tipoBeneficiario === "convidado" ? dados.beneficiarioId : null,
    ...snapshot,
    descricao: texto(dados.descricao),
    evento: texto(dados.evento),
    centro_custo_despesa_id: centroCusto,
    cadencia: recorrente ? "recorrente" : "pontual",
    valor_parcela: dados.valorParcela,
    num_parcelas: recorrente ? Math.trunc(dados.numParcelas ?? 1) : 1,
    periodicidade: recorrente ? (dados.periodicidade ?? "mensal") : "unica",
    primeiro_vencimento: texto(dados.primeiroVencimento),
    forma_pagamento: texto(dados.formaPagamento),
    },
  }
}

export async function criarCusteio(
  dados: DadosCusteio,
  atorId: string
): Promise<ResultadoAcao> {
  const registro = await montarRegistroCusteio(dados)
  if ("erro" in registro) return registro
  const admin = await createAdminClient()

  const { data, error } = await admin
    .from("institucional_custeios")
    .insert({
      ...registro.registro,
      codigo: `CUST-${gerarCodigoProcesso()}`,
      situacao: "rascunho",
      criado_por_id: atorId,
      excluido: false,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SCHEMA }
    return { erro: `Falha ao criar custeio: ${error.message}` }
  }
  return { ok: true, id: (data as { id: string }).id }
}

/** Só edita enquanto rascunho. */
export async function atualizarCusteio(
  id: string,
  dados: DadosCusteio
): Promise<ResultadoAcao> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: atual } = await admin
    .from("institucional_custeios")
    .select("situacao")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!atual) return { erro: "Custeio não encontrado." }
  if (atual.situacao !== "rascunho") {
    return { erro: "Só é possível editar custeios em rascunho." }
  }

  const registro = await montarRegistroCusteio(dados)
  if ("erro" in registro) return registro

  const { error } = await admin
    .from("institucional_custeios")
    .update({ ...registro.registro, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao salvar custeio: ${error.message}` }
  return { ok: true, id }
}

export async function submeterCusteio(id: string): Promise<ResultadoAcao> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: atual } = await admin
    .from("institucional_custeios")
    .select("situacao")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!atual) return { erro: "Custeio não encontrado." }
  if (atual.situacao !== "rascunho") {
    return { erro: "Só é possível submeter custeios em rascunho." }
  }
  const { error } = await admin
    .from("institucional_custeios")
    .update({
      situacao: "aguardando_autorizacao",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao submeter: ${error.message}` }
  return { ok: true, id }
}

/** Autoriza e GERA as ordens de pagamento (portão interno → Financeiro). */
export async function autorizarCusteio(
  id: string,
  atorId: string
): Promise<ResultadoGeracao> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: c } = await admin
    .from("institucional_custeios")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!c) return { erro: "Custeio não encontrado." }
  if (c.situacao !== "aguardando_autorizacao") {
    return { erro: "Só é possível autorizar custeios aguardando autorização." }
  }

  const geracao = await gerarOrdensCusteio(c as Record<string, unknown>, empId)
  if ("erro" in geracao) return geracao

  const { error } = await admin
    .from("institucional_custeios")
    .update({
      situacao: "autorizado",
      autorizador_id: atorId,
      autorizado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao autorizar: ${error.message}` }
  return geracao
}

export async function reprovarCusteio(
  id: string,
  motivo: string,
  atorId: string
): Promise<ResultadoAcao> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: atual } = await admin
    .from("institucional_custeios")
    .select("situacao")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!atual) return { erro: "Custeio não encontrado." }
  if (atual.situacao !== "aguardando_autorizacao") {
    return { erro: "Só é possível reprovar custeios aguardando autorização." }
  }
  const { error } = await admin
    .from("institucional_custeios")
    .update({
      situacao: "reprovado",
      motivo_reprovacao: texto(motivo),
      autorizador_id: atorId,
      autorizado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao reprovar: ${error.message}` }
  return { ok: true, id }
}

export async function cancelarCusteio(id: string): Promise<ResultadoAcao> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { error } = await admin
    .from("institucional_custeios")
    .update({ situacao: "cancelado", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao cancelar: ${error.message}` }
  return { ok: true, id }
}

/**
 * Gera as ordens_pagamento do custeio. Pontual = 1 ordem; recorrente = N
 * (bounded MAX_PARCELAS). Favorecido casa por CPF em `usuarios`; sem conta,
 * usa o favorecido avulso. Idempotente por vencimento (custeio_id).
 */
async function gerarOrdensCusteio(
  c: Record<string, unknown>,
  empId: string
): Promise<ResultadoGeracao> {
  const admin = await createAdminClient()
  const custeioId = String(c.id)
  const valor = typeof c.valor_parcela === "number" ? c.valor_parcela : 0
  if (!(valor > 0)) return { erro: "Custeio sem valor de parcela." }

  const recorrente = c.cadencia === "recorrente"
  const periodicidade = (texto(c.periodicidade) ?? "unica") as Periodicidade
  const primeiro =
    texto(c.primeiro_vencimento)?.slice(0, 10) ?? hojeSP()
  const qtd = recorrente
    ? Math.min(
        Math.max(Math.trunc(Number(c.num_parcelas) || 1), 1),
        MAX_PARCELAS
      )
    : 1

  const alvos = Array.from({ length: qtd }, (_, i) =>
    vencimentoParcela(primeiro, recorrente ? periodicidade : "unica", i)
  )

  // Idempotência: pula vencimentos que já têm ordem deste custeio.
  const { data: existentes, error: erroExist } = await admin
    .from("ordens_pagamento")
    .select("vencimento")
    .eq("custeio_id", custeioId)
    .eq("emp_proprietaria_id", empId)
    .not("excluido", "is", true)
  if (erroExist) {
    if (esquemaAusente(erroExist)) return { erro: AVISO_SCHEMA }
    return { erro: `Falha ao checar ordens: ${erroExist.message}` }
  }
  const jaTem = new Set(
    (existentes ?? [])
      .map((o) => texto(o.vencimento)?.slice(0, 10))
      .filter((v): v is string => Boolean(v))
  )
  const novos = alvos.filter((v) => !jaTem.has(v))
  const puladas = alvos.length - novos.length
  if (novos.length === 0) return { geradas: 0, puladas }

  // Favorecido: casa por CPF em `usuarios`; sem conta → avulso.
  const cpf = apenasDigitos(c.beneficiario_cpf)
  let usuarioId: string | null = null
  if (cpf) {
    const { data: u } = await admin
      .from("usuarios")
      .select("id")
      .eq("cpf", cpf)
      .eq("emp_proprietaria_id", empId)
      .limit(1)
      .maybeSingle()
    usuarioId = u ? String(u.id) : null
  }

  const nome = texto(c.beneficiario_nome) ?? "Beneficiário"
  const centroCusto = texto(c.centro_custo_despesa_id)
  const formaPagamento = texto(c.forma_pagamento)
  const descBase = texto(c.descricao) ?? nome

  const registros = novos.map((venc, i) => ({
    codigo:
      recorrente && novos.length > 1
        ? `${texto(c.codigo) ?? gerarCodigoProcesso()}-${i + 1}`
        : (texto(c.codigo) ?? gerarCodigoProcesso()),
    tipo: "Custeio",
    descricao: recorrente
      ? `${descBase} — parcela ${i + 1}/${novos.length} (venc. ${venc.slice(8, 10)}/${venc.slice(5, 7)}/${venc.slice(0, 4)})`
      : descBase,
    situacao: "Em autorização",
    valor_inicial_cobranca: valor,
    forma_pagamento: formaPagamento,
    vencimento: venc,
    beneficiario_usuario_id: usuarioId,
    beneficiario_nome_avulso: usuarioId ? null : nome,
    beneficiario_doc_avulso: usuarioId ? null : texto(c.beneficiario_cpf),
    centro_custo_despesa_id: centroCusto,
    custeio_id: custeioId,
    excluido: false,
    emp_proprietaria_id: empId,
  }))

  const { error: erroIns } = await admin
    .from("ordens_pagamento")
    .insert(registros)
  if (erroIns) {
    if (esquemaAusente(erroIns)) return { erro: AVISO_SCHEMA }
    return { erro: `Falha ao gerar as ordens: ${erroIns.message}` }
  }
  return { geradas: novos.length, puladas }
}
