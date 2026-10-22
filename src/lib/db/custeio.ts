import "server-only"
import type { Apontamento } from "@/lib/auditoria-confirmacao"
import { inserirOrdensVerificadasCompat, type Confirmacao } from "@/lib/db/ordens-verificacao"
import { cpfConfiavel } from "@/lib/cpf"
import { esquemaAusente, hojeSP, texto } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import { gerarCodigoProcesso, listarFornecedores, subirComprovanteCompras } from "@/lib/db/compras"
import {
  meiosPagamentoFornecedor,
  type ContaFornecedor,
  type PixFornecedor,
} from "@/lib/db/compras-pagamento"
import {
  camposAutorizacaoInicial,
  camposRecorrenteAutorizada,
  cancelarOrdem,
  SITUACOES_ENCERRADAS,
  SITUACOES_NAO_AUTORIZADAS,
  registrarEvento,
  usuarioDaTrilha,
  SITUACAO_A_PAGAR,
  SITUACAO_AGUARDANDO_DOCUMENTO,
  SITUACAO_EM_AUTORIZACAO,
} from "@/lib/db/ordens-ciclo"
import { SITUACAO_PROCESSANDO } from "@/lib/ordens-situacoes"
import { obterFichaDiretor } from "@/lib/db/diretoria-ficha"
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
  canceladoPor: string | null
  ordens: {
    id: string
    codigo: string | null
    descricao: string | null
    situacao: string | null
    valor_inicial_cobranca: number | null
    valor_pago: number | null
    vencimento: string | null
    cancelamento_motivo: string | null
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

  if (tipo === "assessoria") {
    // Assessoria sai do cadastro de fornecedores; Pix e contas vêm de
    // dados_bancarios do fornecedor (meiosDoBeneficiario), não do snapshot.
    const { data } = await admin
      .from("empresa")
      .select("id, nome_fantasia, nome_razao, cnpj_cpf")
      .eq("id", beneficiarioId)
      .eq("emp_proprietaria_id", empId)
      .maybeSingle()
    if (!data) return SNAPSHOT_VAZIO
    return {
      ...SNAPSHOT_VAZIO,
      beneficiario_nome: texto(data.nome_fantasia) ?? texto(data.nome_razao),
      beneficiario_cpf: texto(data.cnpj_cpf),
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
    // Com filiação, os dados bancários são os da filiação (ver diretoria-ficha.ts).
    const ficha = await obterFichaDiretor(beneficiarioId)
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

  const usuarioIds = [custeio.criado_por_id, custeio.autorizador_id, custeio.cancelado_por_id].filter(
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
        "id, codigo, descricao, situacao, valor_inicial_cobranca, valor_pago, vencimento, cancelamento_motivo"
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
    canceladoPor: custeio.cancelado_por_id
      ? (nomes.get(String(custeio.cancelado_por_id)) ?? null)
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
  /** Forma completa (modelo de compras): o "para onde" do pagamento. */
  pagamento?: PagamentoCusteio
}

/** O "para onde" escolhido no custeio (fica no próprio custeio). */
export type PagamentoCusteio = {
  forma: string
  pix: string | null
  tipoChavePix: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  tipoConta: string | null
  favorecido: string | null
  pixCodigo: string | null
  caixaContaId: string | null
  arquivoBoleto: string | null
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
    fornecedor_id:
      dados.tipoBeneficiario === "assessoria" ? dados.beneficiarioId : null,
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
    ...(dados.pagamento
      ? {
          forma_pagamento: dados.pagamento.forma,
          ...(dados.pagamento.pix ? { pix: dados.pagamento.pix, tipo_chave_pix: dados.pagamento.tipoChavePix } : {}),
          ...(dados.pagamento.conta
            ? {
                banco: dados.pagamento.banco,
                agencia: dados.pagamento.agencia,
                conta: dados.pagamento.conta,
                tipo_conta: dados.pagamento.tipoConta,
                conta_favorecido: dados.pagamento.favorecido,
              }
            : {}),
          pix_codigo: dados.pagamento.pixCodigo,
          caixa_conta_id: dados.pagamento.caixaContaId,
          ...(dados.pagamento.arquivoBoleto ? { arquivo_boleto: dados.pagamento.arquivoBoleto } : {}),
        }
      : {}),
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

  const geracao = await gerarOrdensCusteio(c as Record<string, unknown>, empId, atorId)
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

/**
 * Reprovado → rascunho, para corrigir e submeter de novo. O motivo da
 * reprovação fica guardado (a tela o mostra no rascunho) até a próxima
 * avaliação; autorizador e data saem.
 */
export async function reabrirCusteioReprovado(id: string): Promise<ResultadoAcao> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("institucional_custeios")
    .update({
      situacao: "rascunho",
      autorizador_id: null,
      autorizado_em: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "reprovado")
    .select("id")
  if (error) return { erro: `Falha ao reabrir: ${error.message}` }
  if ((data ?? []).length === 0) return { erro: "Só custeio reprovado pode ser reaberto para correção." }
  return { ok: true, id }
}

const SITUACOES_CANCELAVEIS =["rascunho", "aguardando_autorizacao", "autorizado"]

/**
 * Cancela o custeio, com motivo. Autorizado: exige a permissão de autorizar
 * (`podeCancelarAutorizado`) e as ordens ainda não pagas são canceladas junto
 * (pelo mesmo caminho do Financeiro); as pagas ficam. Ordem já em pagamento
 * (Processando ou numa remessa enviada ao banco) bloqueia o cancelamento. Se
 * alguma ordem não puder ser cancelada, o custeio continua autorizado.
 */
export async function cancelarCusteio(
  id: string,
  atorId: string,
  motivo: string,
  podeCancelarAutorizado: boolean
): Promise<ResultadoAcao> {
  const m = motivo.trim()
  if (!m) return { erro: "Informe o motivo do cancelamento." }
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: atual } = await admin
    .from("institucional_custeios")
    .select("situacao")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .not("excluido", "is", true)
    .maybeSingle()
  if (!atual) return { erro: "Custeio não encontrado." }
  const situacao = String(atual.situacao)
  if (!SITUACOES_CANCELAVEIS.includes(situacao)) {
    return { erro: "Este custeio já está encerrado (reprovado ou cancelado)." }
  }

  if (situacao === "autorizado") {
    if (!podeCancelarAutorizado) {
      return { erro: "Cancelar um custeio já autorizado exige a permissão de autorizar custeios." }
    }
    const { data: ordens } = await admin
      .from("ordens_pagamento")
      .select("id, codigo, situacao")
      .eq("custeio_id", id)
      .eq("emp_proprietaria_id", empId)
      .not("excluido", "is", true)
    const abertas = (ordens ?? []).filter(
      (o) => !SITUACOES_ENCERRADAS.includes(String(o.situacao))
    )
    // Já em pagamento: o dinheiro pode estar saindo — o Financeiro resolve antes.
    const { data: itensRemessa } = abertas.length
      ? await admin
          .from("financeiro_remessa_itens")
          .select("ordem_id, situacao, remessa:remessa_id (situacao)")
          .in("ordem_id", abertas.map((o) => String(o.id)))
      : { data: [] }
    const emRemessa = new Set(
      (itensRemessa ?? [])
        .filter((i) => {
          const r = (Array.isArray(i.remessa) ? i.remessa[0] : i.remessa) as { situacao?: string } | null
          return i.situacao === "enviado" && r?.situacao !== "cancelada"
        })
        .map((i) => String(i.ordem_id))
    )
    const emPagamento = abertas.filter(
      (o) => o.situacao === SITUACAO_PROCESSANDO || emRemessa.has(String(o.id))
    )
    if (emPagamento.length > 0) {
      return {
        erro: `Há ordem(ns) já em pagamento (${emPagamento.map((o) => texto(o.codigo) ?? o.id).join(", ")}): em "Processando" ou numa remessa enviada ao banco. Peça ao Financeiro para resolvê-la(s) antes de cancelar o custeio.`,
      }
    }
    const falhas: string[] = []
    for (const o of abertas) {
      const r = await cancelarOrdem(String(o.id), atorId, `Custeio cancelado: ${m}`, {
        semRefletirNoCusteio: true,
      })
      if (r.erro) falhas.push(`${texto(o.codigo) ?? o.id}: ${r.erro}`)
    }
    if (falhas.length > 0) {
      return {
        erro: `Não foi possível cancelar ${falhas.length} ordem(ns), e o custeio continua autorizado. ${falhas.join(" · ")}`,
      }
    }
  }

  const agora = new Date().toISOString()
  // A situação no filtro evita sobrescrever uma mudança feita por outra pessoa.
  const { data, error } = await admin
    .from("institucional_custeios")
    .update({
      situacao: "cancelado",
      cancelamento_motivo: m,
      cancelado_em: agora,
      cancelado_por_id: atorId,
      updated_at: agora,
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .eq("situacao", situacao)
    .select("id")
  if (error) return { erro: `Falha ao cancelar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "O custeio mudou de situação enquanto você cancelava. Recarregue a página." }
  }
  return { ok: true, id }
}

/**
 * Reflete no custeio o cancelamento (ou a reabertura) de uma ordem dele pelo
 * Financeiro: todas as ordens canceladas → custeio cancelado; uma ordem
 * reaberta num custeio cancelado depois de autorizado → volta a autorizado.
 * Custeio com ordem paga e as demais canceladas segue autorizado.
 */
export async function refletirOrdemNoCusteio(
  ordemId: string,
  atorId: string,
  motivo: string | null
): Promise<void> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("custeio_id")
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  const custeioId = texto(ordem?.custeio_id)
  if (!custeioId) return

  const [{ data: c }, { data: ordens }] = await Promise.all([
    admin
      .from("institucional_custeios")
      .select("situacao, autorizado_em")
      .eq("id", custeioId)
      .eq("emp_proprietaria_id", empId)
      .maybeSingle(),
    admin
      .from("ordens_pagamento")
      .select("situacao")
      .eq("custeio_id", custeioId)
      .eq("emp_proprietaria_id", empId)
      .not("excluido", "is", true),
  ])
  if (!c) return
  const lista = ordens ?? []
  const canceladas = lista.filter((o) => o.situacao === "Cancelada").length
  const abertas = lista.filter((o) => !SITUACOES_ENCERRADAS.includes(String(o.situacao))).length
  const agora = new Date().toISOString()

  if (c.situacao === "autorizado" && lista.length > 0 && canceladas === lista.length) {
    const { error } = await admin
      .from("institucional_custeios")
      .update({
        situacao: "cancelado",
        cancelamento_motivo: `Todas as ordens foram canceladas no Financeiro${motivo?.trim() ? ` (${motivo.trim()})` : ""}.`,
        cancelado_em: agora,
        cancelado_por_id: atorId,
        updated_at: agora,
      })
      .eq("id", custeioId)
      .eq("situacao", "autorizado")
    if (error) console.error("refletirOrdemNoCusteio:", error.message)
  } else if (c.situacao === "cancelado" && c.autorizado_em && abertas > 0) {
    const { error } = await admin
      .from("institucional_custeios")
      .update({
        situacao: "autorizado",
        cancelamento_motivo: null,
        cancelado_em: null,
        cancelado_por_id: null,
        updated_at: agora,
      })
      .eq("id", custeioId)
      .eq("situacao", "cancelado")
    if (error) console.error("refletirOrdemNoCusteio:", error.message)
  }
}

/**
 * Gera as ordens_pagamento do custeio. Pontual = 1 ordem; recorrente = N
 * (bounded MAX_PARCELAS). Favorecido casa por CPF em `usuarios`; sem conta,
 * usa o favorecido avulso. Idempotente por vencimento (custeio_id).
 */
async function gerarOrdensCusteio(
  c: Record<string, unknown>,
  empId: string,
  autorizadorId: string
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

  // Favorecido: assessoria → o próprio fornecedor; pessoa → casa por CPF em
  // `usuarios`; sem conta → avulso.
  const fornecedorId =
    c.tipo_beneficiario === "assessoria" ? texto(c.fornecedor_id) : null
  const cpf = fornecedorId ? null : cpfConfiavel(texto(c.beneficiario_cpf))
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

  // Regra de 05/10: parcela RECORRENTE nasce autorizada pela autorização do
  // custeio e espera só o documento fiscal; pagamento único passa pela
  // autorização pontual (alçada + permissão de autorizar custeio).
  // 18/10: a formalização do custeio É o documento fiscal das suas ordens —
  // com ela, a parcela recorrente já nasce "A pagar".
  const formalizacao = texto(c.arquivo_formalizacao)
  const motivoRecorrente = `Parcela recorrente do custeio ${texto(c.codigo) ?? ""}, autorizado em ${hojeSP().split("-").reverse().join("/")} — ${formalizacao ? "a formalização do custeio é o documento fiscal." : "espera só o documento fiscal."}`
  const autorizacao = recorrente
    ? {
        ...camposRecorrenteAutorizada(motivoRecorrente, autorizadorId),
        ...(formalizacao ? { situacao: SITUACAO_A_PAGAR } : {}),
      }
    : { situacao: SITUACAO_EM_AUTORIZACAO }
  const registros = novos.map((venc, i) => ({
    codigo:
      recorrente && novos.length > 1
        ? `${texto(c.codigo) ?? gerarCodigoProcesso()}-${i + 1}`
        : (texto(c.codigo) ?? gerarCodigoProcesso()),
    tipo: "Custeio",
    descricao: recorrente
      ? `${descBase} — parcela ${i + 1}/${novos.length} (venc. ${venc.slice(8, 10)}/${venc.slice(5, 7)}/${venc.slice(0, 4)})`
      : descBase,
    ...autorizacao,
    valor_inicial_cobranca: valor,
    forma_pagamento: formaPagamento,
    pix_codigo: texto(c.pix_codigo),
    caixa_conta_id: texto(c.caixa_conta_id),
    arquivo_boleto: recorrente ? null : texto(c.arquivo_boleto),
    arquivo_nota_fiscal: formalizacao,
    vencimento: venc,
    beneficiario_usuario_id: usuarioId,
    beneficiario_fornecedor_id: fornecedorId,
    beneficiario_nome_avulso: usuarioId || fornecedorId ? null : nome,
    beneficiario_doc_avulso:
      usuarioId || fornecedorId ? null : texto(c.beneficiario_cpf),
    centro_custo_despesa_id: centroCusto,
    custeio_id: custeioId,
    excluido: false,
    emp_proprietaria_id: empId,
  }))

  const { data: criadas, error: erroIns } = await inserirOrdensVerificadasCompat(registros, {})
  if (erroIns) {
    if (esquemaAusente(erroIns)) return { erro: AVISO_SCHEMA }
    return { erro: `Falha ao gerar as ordens: ${erroIns.message}` }
  }
  await registrarEvento(
    (criadas ?? []).map((o) => o.id),
    "criada",
    autorizadorId,
    recorrente
      ? `Gerada na autorização do custeio ${texto(c.codigo) ?? ""}: nasceu autorizada e ${formalizacao ? "segue para pagamento (a formalização do custeio é o documento fiscal)" : "aguarda o documento fiscal"}.`
      : `Gerada na autorização do custeio ${texto(c.codigo) ?? ""}: pagamento único, passa pela autorização pontual.`
  )
  return { geradas: novos.length, puladas }
}

// ── Pagamento do beneficiário, formalização e extraordinário (05/10) ─────────

/**
 * Chaves Pix e contas conhecidas do beneficiário, no formato do seletor das
 * compras: as do cadastro (convidado, ficha do diretor) e, para filiado, as
 * contas da filiação. Os ids são do seletor — a action resolve de volta.
 */
export async function meiosDoBeneficiario(
  tipo: string,
  beneficiarioId: string
): Promise<{ pix: PixFornecedor[]; contas: ContaFornecedor[] }> {
  if (!tipo || !beneficiarioId) return { pix: [], contas: [] }
  if (tipo === "assessoria") return meiosPagamentoFornecedor(beneficiarioId)
  const snap = await resolverSnapshot(tipo, beneficiarioId)
  const pix: PixFornecedor[] = []
  const contas: ContaFornecedor[] = []
  if (snap.pix) pix.push({ id: "cad-pix", chave: snap.pix, tipo: snap.tipo_chave_pix })
  if (snap.banco && snap.conta) {
    contas.push({
      id: "cad-conta",
      banco: snap.banco,
      agencia: snap.agencia,
      conta: snap.conta,
      tipo_conta: snap.tipo_conta,
      favorecido: snap.beneficiario_nome,
    })
  }
  if (tipo === "filiado") {
    const admin = await createAdminClient()
    const { data } = await admin
      .from("dados_bancarios")
      .select("id, banco, agencia, conta, tipo_conta, pix, pix_tipo, favorecido")
      .eq("filiado_id", beneficiarioId)
      .limit(10)
    for (const d of (data ?? []) as Record<string, string | null>[]) {
      if (d.pix?.trim()) pix.push({ id: `db-pix-${d.id}`, chave: d.pix.trim(), tipo: d.pix_tipo })
      if (d.banco?.trim() && d.conta?.trim()) {
        contas.push({
          id: `db-conta-${d.id}`,
          banco: d.banco.trim(),
          agencia: d.agencia,
          conta: d.conta.trim(),
          tipo_conta: d.tipo_conta,
          favorecido: d.favorecido ?? snap.beneficiario_nome,
        })
      }
    }
  }
  return { pix, contas }
}

/** Sobe (ou troca) o documento que formaliza o custeio. */
export async function salvarFormalizacaoCusteio(
  id: string,
  arquivo: File
): Promise<ResultadoAcao> {
  const up = await subirComprovanteCompras(`formalizacoes/custeios/${id}`, arquivo)
  if (up.erro || !up.caminho) return { erro: up.erro ?? "Falha ao subir a formalização." }
  const admin = await createAdminClient()
  const { data: antes } = await admin
    .from("institucional_custeios")
    .select("arquivo_formalizacao")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  const { error } = await admin
    .from("institucional_custeios")
    .update({ arquivo_formalizacao: up.caminho, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    await admin.storage.from("compras").remove([up.caminho])
    if (esquemaAusente(error) || error.code === "PGRST204") {
      return { erro: "Rode supabase/diarias-remessas-autorizacao-custeio.sql antes de anexar a formalização." }
    }
    return { erro: `Falha ao salvar a formalização: ${error.message}` }
  }
  await formalizacaoNasOrdens(id, up.caminho, texto(antes?.arquivo_formalizacao))
  return { ok: true, id }
}

/**
 * A formalização é o documento fiscal das ordens do custeio (18/10): vai para
 * a nota das ordens em aberto que não têm nota própria (ou tinham a
 * formalização anterior). Parcela que aguardava o documento segue — nasceu
 * autorizada → "A pagar"; anterior à regra de 05/10 → autorização pontual.
 */
async function formalizacaoNasOrdens(custeioId: string, caminho: string, anterior: string | null) {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: ordens } = await admin
    .from("ordens_pagamento")
    .select("id, situacao, arquivo_nota_fiscal, autorizacao_esta_autorizado")
    .eq("custeio_id", custeioId)
    .eq("emp_proprietaria_id", empId)
    .not("excluido", "is", true)
    .not("situacao", "in", '("Paga","Cancelada","Estornado")')
  const alvo = (ordens ?? []).filter((o) => {
    const nota = texto(o.arquivo_nota_fiscal)
    return !nota || nota === anterior
  })
  if (!alvo.length) return
  const usuario = await usuarioDaTrilha()
  for (const o of alvo) {
    const aguardando = o.situacao === SITUACAO_AGUARDANDO_DOCUMENTO
    const campos: Record<string, unknown> = { arquivo_nota_fiscal: caminho }
    if (aguardando) {
      Object.assign(
        campos,
        o.autorizacao_esta_autorizado === true ? { situacao: SITUACAO_A_PAGAR } : camposAutorizacaoInicial(null)
      )
    }
    const { error } = await admin.from("ordens_pagamento").update(campos).eq("id", o.id).eq("situacao", String(o.situacao))
    if (error) {
      console.error("formalizacaoNasOrdens:", error.message)
      continue
    }
    const destino = aguardando ? String(campos.situacao) : null
    await registrarEvento(
      String(o.id),
      "documento_fiscal",
      usuario,
      `Formalização do custeio ${texto(o.arquivo_nota_fiscal) ? "substituída" : "anexada"} — vale como documento fiscal da ordem${
        destino === SITUACAO_A_PAGAR ? "; seguiu para pagamento" : destino ? "; seguiu para autorização" : ""
      }.`,
      { arquivo_nota_fiscal: caminho, nota_anterior: o.arquivo_nota_fiscal ?? null }
    )
  }
  // O evento "documento_fiscal" já reavalia a auditoria de cada ordem.
  const emAutorizacao = alvo.filter((o) => o.situacao === SITUACAO_AGUARDANDO_DOCUMENTO && o.autorizacao_esta_autorizado !== true)
  if (emAutorizacao.length) {
    const { avisarOrdensEmAutorizacao, depoisDaResposta } = await import("@/lib/db/avisos")
    depoisDaResposta(() => avisarOrdensEmAutorizacao(emAutorizacao.map((o) => String(o.id))))
  }
}

/** URL assinada da formalização (1 h). */
export async function urlFormalizacaoCusteio(caminho: string | null): Promise<string | null> {
  if (!caminho) return null
  const admin = await createAdminClient()
  const { data } = await admin.storage.from("compras").createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

// ── Novas ordens a partir do custeio autorizado (22/10/2026) ─────────────────

/** Id do beneficiário no cadastro de origem, conforme o tipo do custeio. */
function beneficiarioIdDoCusteio(c: Record<string, unknown>): string | null {
  switch (c.tipo_beneficiario) {
    case "diretor":
      return texto(c.diretoria_integrante_id)
    case "filiado":
      return texto(c.filiacao_id)
    case "convidado":
      return texto(c.convidado_id)
    case "assessoria":
      return texto(c.fornecedor_id)
    default:
      return null
  }
}

/** Ids das opções que são a chave/conta gravadas no próprio custeio. */
export const MEIO_PIX_DO_CUSTEIO = "custeio-pix"
export const MEIO_CONTA_DO_CUSTEIO = "custeio-conta"

/**
 * Chaves Pix e contas para as novas ordens do custeio: primeiro as gravadas
 * no custeio (a forma já validada), depois as do cadastro do beneficiário.
 */
export async function meiosDoCusteio(
  custeioId: string
): Promise<{ pix: PixFornecedor[]; contas: ContaFornecedor[] }> {
  const admin = await createAdminClient()
  const { data: c } = await admin
    .from("institucional_custeios")
    .select("*")
    .eq("id", custeioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!c) return { pix: [], contas: [] }
  const beneficiarioId = beneficiarioIdDoCusteio(c)
  const doCadastro = beneficiarioId
    ? await meiosDoBeneficiario(String(c.tipo_beneficiario), beneficiarioId)
    : { pix: [], contas: [] }
  const pix: PixFornecedor[] = []
  const contas: ContaFornecedor[] = []
  const chave = texto(c.pix)
  if (chave) pix.push({ id: MEIO_PIX_DO_CUSTEIO, chave, tipo: texto(c.tipo_chave_pix) })
  const conta = texto(c.conta)
  if (conta && texto(c.banco)) {
    contas.push({
      id: MEIO_CONTA_DO_CUSTEIO,
      banco: String(c.banco),
      agencia: texto(c.agencia),
      conta,
      tipo_conta: texto(c.tipo_conta),
      favorecido: texto(c.conta_favorecido) ?? texto(c.beneficiario_nome),
    })
  }
  pix.push(...doCadastro.pix.filter((p) => p.chave !== chave))
  contas.push(...doCadastro.contas.filter((x) => !(x.conta === conta && x.banco === texto(c.banco))))
  return { pix, contas }
}

/**
 * Texto do "para onde" de uma ordem de custeio (chave Pix ou conta). Fica na
 * ordem (forma_detalhe) quando ela é gerada depois da autorização — a forma
 * pode ter mudado em relação à do custeio.
 */
function destinoDoPagamento(p: PagamentoCusteio, nome: string | null): string | null {
  if (p.forma === "Pix" && p.pix) {
    return `Chave Pix do beneficiário — ${p.tipoChavePix ? `${p.tipoChavePix}: ` : ""}${p.pix}`
  }
  if (p.forma === "Depósito bancário (TED)" && p.conta) {
    return `Conta do beneficiário — ${p.banco ?? "—"}, ag. ${p.agencia ?? "—"}, conta ${p.conta} (${p.favorecido ?? nome ?? "—"})`
  }
  return null
}

/** Favorecido das ordens: assessoria → fornecedor; pessoa → usuário pelo CPF; senão avulso. */
async function favorecidoDoCusteio(c: Record<string, unknown>, empId: string) {
  const admin = await createAdminClient()
  const fornecedorId = c.tipo_beneficiario === "assessoria" ? texto(c.fornecedor_id) : null
  const cpf = fornecedorId ? null : cpfConfiavel(texto(c.beneficiario_cpf))
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
  return {
    beneficiario_usuario_id: usuarioId,
    beneficiario_fornecedor_id: fornecedorId,
    beneficiario_nome_avulso: usuarioId || fornecedorId ? null : nome,
    beneficiario_doc_avulso: usuarioId || fornecedorId ? null : texto(c.beneficiario_cpf),
  }
}

export type NovasOrdensCusteio = {
  periodicidade: Periodicidade
  quantidade: number
  valorParcela: number
  primeiroVencimento: string
  /** Por que o custeio precisa de mais ordens — vai para a descrição e a trilha. */
  motivo: string
  pagamento: PagamentoCusteio
  /** Forma Boleto: um arquivo por parcela, na ordem dos vencimentos. */
  boletos: File[]
  confirmacao?: Confirmacao
}

/**
 * Gera NOVAS ordens de um custeio autorizado, como o "Gerar ordens" do
 * contrato. Estendem o que foi autorizado, então nascem "Em autorização" —
 * salvo parcela recorrente gerada por quem tem a permissão de autorizar
 * custeio: essa nasce autorizada, como as originais, e espera só o documento
 * fiscal (com a formalização anexada, já "A pagar"). Vencimentos que já têm
 * ordem viva do custeio são pulados; os de ordens canceladas podem ser
 * gerados de novo.
 */
export async function gerarNovasOrdensCusteio(
  custeioId: string,
  p: NovasOrdensCusteio,
  atorId: string,
  podeAutorizar: boolean
): Promise<{ geradas?: number; puladas?: number; erro?: string; apontamentos?: Apontamento[] }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: c } = await admin
    .from("institucional_custeios")
    .select("*")
    .eq("id", custeioId)
    .eq("emp_proprietaria_id", empId)
    .not("excluido", "is", true)
    .maybeSingle()
  if (!c) return { erro: "Custeio não encontrado." }
  if (c.situacao !== "autorizado") return { erro: "Só custeio autorizado gera novas ordens." }
  if (!(p.valorParcela > 0)) return { erro: "Informe um valor de parcela maior que zero." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.primeiroVencimento)) return { erro: "Informe a data do primeiro vencimento." }
  const motivo = p.motivo.trim()
  if (!motivo) return { erro: "Diga por que o custeio precisa de novas ordens." }

  const recorrente = p.periodicidade !== "unica"
  const qtd = recorrente ? Math.min(Math.max(Math.trunc(p.quantidade), 1), MAX_PARCELAS) : 1
  const alvos = Array.from({ length: qtd }, (_, i) => vencimentoParcela(p.primeiroVencimento, p.periodicidade, i))

  const { data: existentes, error: erroExist } = await admin
    .from("ordens_pagamento")
    .select("vencimento, situacao, excluido")
    .eq("custeio_id", custeioId)
    .eq("emp_proprietaria_id", empId)
  if (erroExist) return { erro: `Falha ao checar ordens: ${erroExist.message}` }
  const jaTem = new Set(
    (existentes ?? [])
      .filter((o) => o.excluido !== true && o.situacao !== "Cancelada")
      .map((o) => texto(o.vencimento)?.slice(0, 10))
      .filter((v): v is string => Boolean(v))
  )
  const novos = alvos.filter((v) => !jaTem.has(v))
  const puladas = alvos.length - novos.length
  if (novos.length === 0) return { geradas: 0, puladas }

  if (p.pagamento.forma === "Boleto" && p.boletos.length !== novos.length) {
    return {
      erro: `Serão geradas ${novos.length} ordem(ns)${puladas ? ` (${puladas} vencimento(s) já tinham ordem)` : ""}: anexe ${novos.length} boleto(s), um por ordem — vieram ${p.boletos.length}.`,
    }
  }
  const caminhosBoletos: string[] = []
  if (p.pagamento.forma === "Boleto") {
    for (let i = 0; i < novos.length; i++) {
      const r = await subirComprovanteCompras(`boletos/custeios/${custeioId}/${novos[i]}`, p.boletos[i])
      if (r.erro || !r.caminho) {
        if (caminhosBoletos.length) await admin.storage.from("compras").remove(caminhosBoletos)
        return { erro: r.erro ?? "Falha ao subir o boleto." }
      }
      caminhosBoletos.push(r.caminho)
    }
  }

  const codigo = texto(c.codigo) ?? gerarCodigoProcesso()
  const nome = texto(c.beneficiario_nome)
  const descBase = texto(c.descricao) ?? nome ?? "Custeio"
  const formalizacao = texto(c.arquivo_formalizacao)
  const autorizada = recorrente && podeAutorizar
  const hoje = hojeSP().split("-").reverse().join("/")
  const autorizacao = autorizada
    ? {
        ...camposRecorrenteAutorizada(
          `Parcela adicional do custeio ${codigo}, gerada em ${hoje} por quem pode autorizar custeio — ${formalizacao ? "a formalização do custeio é o documento fiscal." : "espera só o documento fiscal."}`,
          atorId
        ),
        ...(formalizacao ? { situacao: SITUACAO_A_PAGAR } : {}),
      }
    : { situacao: SITUACAO_EM_AUTORIZACAO }
  const favorecido = await favorecidoDoCusteio(c, empId)
  const destino = destinoDoPagamento(p.pagamento, nome)
  // Código continua a numeração do custeio (conta também as excluídas).
  const base = (existentes ?? []).length
  const registros = novos.map((venc, i) => ({
    codigo: `${codigo}-${base + i + 1}`,
    tipo: "Custeio",
    descricao: `${descBase} — ${recorrente ? `parcela adicional ${i + 1}/${novos.length}` : "pagamento adicional"} (venc. ${venc.slice(8, 10)}/${venc.slice(5, 7)}/${venc.slice(0, 4)}): ${motivo}`,
    ...autorizacao,
    valor_inicial_cobranca: p.valorParcela,
    forma_pagamento: p.pagamento.forma,
    forma_detalhe: destino,
    pix_codigo: p.pagamento.pixCodigo,
    caixa_conta_id: p.pagamento.caixaContaId,
    arquivo_boleto: caminhosBoletos[i] ?? null,
    arquivo_nota_fiscal: formalizacao,
    vencimento: venc,
    ...favorecido,
    centro_custo_despesa_id: texto(c.centro_custo_despesa_id),
    custeio_id: custeioId,
    excluido: false,
    emp_proprietaria_id: empId,
  }))

  const { data: criadas, error: erroIns } = await inserirOrdensVerificadasCompat(
    registros,
    p.confirmacao ? { confirmacao: p.confirmacao } : {}
  )
  if (erroIns) {
    if (caminhosBoletos.length) await admin.storage.from("compras").remove(caminhosBoletos)
    if (erroIns.apontamentos) return { apontamentos: erroIns.apontamentos }
    if (esquemaAusente(erroIns)) return { erro: AVISO_SCHEMA }
    return { erro: `Falha ao gerar as ordens: ${erroIns.message}` }
  }
  await registrarEvento(
    (criadas ?? []).map((o) => o.id),
    "criada",
    atorId,
    autorizada
      ? `Nova ordem do custeio ${codigo} (${motivo}): nasceu autorizada por quem pode autorizar custeio e ${formalizacao ? "segue para pagamento" : "aguarda o documento fiscal"}.`
      : `Nova ordem do custeio ${codigo} (${motivo}): estende o autorizado e passa pela autorização pontual.`
  )
  return { geradas: novos.length, puladas }
}

/**
 * Exclui, de uma vez, ordens do custeio ainda NÃO autorizadas (aguardando
 * documento fiscal, em autorização ou aguardando informações), como no
 * contrato. As autorizadas se cancelam no Financeiro.
 */
export async function excluirOrdensCusteio(
  custeioId: string,
  ordemIds: string[]
): Promise<{ erro?: string; excluidas?: number; recusadas?: number }> {
  const ids = [...new Set(ordemIds.filter(Boolean))]
  if (ids.length === 0) return { erro: "Marque as ordens a excluir." }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("ordens_pagamento")
    .select("id, situacao, data_pagamento")
    .eq("custeio_id", custeioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("excluido", "is", true)
    .in("id", ids)
  if (error) return { erro: `Falha ao carregar as ordens: ${error.message}` }
  const podem = (data ?? [])
    .filter((o) => SITUACOES_NAO_AUTORIZADAS.includes(String(o.situacao)) && !o.data_pagamento)
    .map((o) => String(o.id))
  if (podem.length === 0) {
    return { erro: "Nenhuma das ordens marcadas pode ser excluída — só as ainda não autorizadas." }
  }
  const { data: feitas, error: erroUpd } = await admin
    .from("ordens_pagamento")
    .update({ excluido: true })
    .in("id", podem)
    .in("situacao", SITUACOES_NAO_AUTORIZADAS)
    .select("id")
  if (erroUpd) return { erro: `Não foi possível excluir: ${erroUpd.message}` }
  const excluidasIds = (feitas ?? []).map((o) => String(o.id))
  await registrarEvento(excluidasIds, "excluida", await usuarioDaTrilha(), "Excluída pelo custeio (não autorizada).")
  return { excluidas: excluidasIds.length, recusadas: ids.length - excluidasIds.length }
}

/** "Pago com" das ordens de custeio: a chave/conta escolhida no custeio. */
export async function pagoComDoCusteio(custeioId: string, forma: string | null): Promise<string | null> {
  const admin = await createAdminClient()
  const { data: c } = await admin
    .from("institucional_custeios")
    .select("pix, tipo_chave_pix, banco, agencia, conta, conta_favorecido, beneficiario_nome")
    .eq("id", custeioId)
    .maybeSingle()
  if (!c) return null
  if (forma === "Pix" && texto(c.pix)) {
    return `Chave Pix do beneficiário — ${texto(c.tipo_chave_pix) ? `${c.tipo_chave_pix}: ` : ""}${c.pix}`
  }
  if (forma === "Depósito bancário (TED)" && texto(c.conta)) {
    return `Conta do beneficiário — ${c.banco ?? "—"}, ag. ${c.agencia ?? "—"}, conta ${c.conta} (${texto(c.conta_favorecido) ?? texto(c.beneficiario_nome) ?? "—"})`
  }
  return null
}

/** Opções do beneficiário "Assessoria": o cadastro de fornecedores do tenant. */
export async function listarAssessoriasParaCusteio(): Promise<
  { id: string; nome: string; cnpj_cpf: string | null; razao: string | null; bloqueado: boolean }[]
> {
  const fornecedores = await listarFornecedores()
  return fornecedores.map((f) => ({
    id: f.id,
    nome: f.nome,
    cnpj_cpf: f.cnpj_cpf,
    razao: f.nome_razao,
    bloqueado: f.bloqueado,
  }))
}
