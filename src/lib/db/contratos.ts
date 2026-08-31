import "server-only"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { getSessaoPainel } from "@/lib/auth"
import { tenantAtual } from "@/lib/tenant"

import {
  gerarCodigoProcesso,
  hojeSP,
  listarDepartamentos,
  listarFornecedores,
  urlArquivoCompras,
} from "@/lib/db/compras"
import { listarCentrosCusto } from "@/lib/db/financeiro"
import { listarEntidadesApoiadas } from "@/lib/db/fornecedores"
import { listarUsuariosAtivos } from "@/lib/db/veiculos"
import {
  vigenciaDe,
  vencimentoParcela,
  MAX_PARCELAS,
  type Periodicidade,
  type SituacaoContrato,
  type Vigencia,
} from "@/lib/contratos-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Contratos — módulo de Compras sobre a tabela migrada `contratos` (480
 * linhas do Bubble). Decisões em supabase/contratos.sql.
 *
 * Regras de negócio que fogem do óbvio:
 * - Vigência é SEMPRE derivada das datas (vigenciaDe), nunca do campo `ativo`
 *   legado — 319 linhas têm ativo=true, mas 239 já venceram.
 * - `valor` é coluna nova; leituras usam `select *` para degradar sem erro
 *   caso contratos.sql ainda não tenha rodado.
 * - Ordens de pagamento: o contrato GERA as suas (gerarOrdensContrato) e o
 *   detalhe as lista pelo vínculo direto ordens_pagamento.contrato_id
 *   (contratos-ordens.sql). Antes dessa coluna existir, cai na via indireta do
 *   fornecedor (legado) — ver ordensDoContrato.
 */

function nomeEmpresa(e: Record<string, unknown> | undefined): string | null {
  if (!e) return null
  return (
    [e.nome_fantasia, e.nome_razao].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    ) ?? null
  )
}

export type ContratoLista = {
  id: string
  codigo: string | null
  objeto: string | null
  valor: number | null
  vigencia_inicio: string | null
  vigencia_termino: string | null
  fornecedorNome: string | null
  departamentoNome: string | null
  categoriaNome: string | null
  categoriaSigiloso: boolean
  aditivo: boolean
  sob_demanda: boolean
  apoio_institucional: boolean
  vigencia: Vigencia
  arquivo_contrato: string | null
}

export type Contrato = {
  id: string
  codigo: string | null
  objeto: string | null
  valor: number | null
  vigencia_inicio: string | null
  vigencia_termino: string | null
  aditivo: boolean
  sob_demanda: boolean
  apoio_institucional: boolean
  contrato_principal_id: string | null
  fornecedor_id: string | null
  departamento_id: string | null
  centro_custo_id: string | null
  responsavel_id: string | null
  categoria_id: string | null
  arquivo_contrato: string | null
  created_at: string | null
  updated_at: string | null
  vigencia: Vigencia
}

/** Categoria de contrato (`contratos_categorias`). `sigiloso` restringe a leitura. */
export type CategoriaContrato = {
  id: string
  nome: string | null
  sigiloso: boolean
  usos: number
}

type DadosCategoriaMapa = { nome: string | null; sigiloso: boolean }

export type OrdemContrato = {
  id: string
  codigo: string | null
  descricao: string | null
  tipo: string | null
  situacao: string | null
  valor: number | null
  vencimento: string | null
  data_pagamento: string | null
  processo_compra_id: string | null
  processoCodigo: string | null
}

export type ContratoDetalhe = {
  contrato: Contrato
  fornecedorNome: string | null
  departamentoNome: string | null
  categoriaNome: string | null
  categoriaSigiloso: boolean
  centroCustoNome: string | null
  responsavelNome: string | null
  arquivoUrl: string | null
  /** Resumo financeiro das ordens: previsto, pago e em aberto. */
  ordensResumo: { previsto: number; pago: number; aberto: number }
  /** Aditivos que apontam este contrato como principal. */
  aditivos: ContratoLista[]
  /** Contrato-principal, quando esta linha é um aditivo vinculado. */
  principal: { id: string; codigo: string | null; objeto: string | null } | null
  /** Marcado como aditivo mas sem principal vinculado (migração incompleta). */
  aditivoOrfao: boolean
  ordens: OrdemContrato[]
}

const SELECT_CONTRATO = "*"

function linhaContrato(
  c: Record<string, unknown>,
  hoje: string,
  fornecedores: Map<string, Record<string, unknown>>,
  departamentos: Map<string, string>,
  categorias: Map<string, DadosCategoriaMapa>
): ContratoLista {
  const fornecedorId = texto(c.fornecedor_id)
  const departamentoId = texto(c.departamento_id)
  const categoriaId = texto(c.categoria_id)
  const categoria = categoriaId ? categorias.get(categoriaId) : undefined
  return {
    id: String(c.id),
    codigo: texto(c.codigo),
    objeto: texto(c.objeto),
    valor: c.valor == null ? null : Number(c.valor),
    vigencia_inicio: texto(c.vigencia_inicio),
    vigencia_termino: texto(c.vigencia_termino),
    fornecedorNome: fornecedorId
      ? nomeEmpresa(fornecedores.get(fornecedorId))
      : null,
    departamentoNome: departamentoId
      ? (departamentos.get(departamentoId) ?? null)
      : null,
    categoriaNome: categoria?.nome ?? null,
    categoriaSigiloso: categoria?.sigiloso ?? false,
    aditivo: c.aditivo === true,
    sob_demanda: c.sob_demanda === true,
    apoio_institucional: c.apoio_institucional === true,
    vigencia: vigenciaDe(texto(c.vigencia_termino), hoje),
    arquivo_contrato: texto(c.arquivo_contrato),
  }
}

/** Mapa id→{nome, sigiloso} de todas as categorias do tenant (poucas linhas). */
async function mapaCategorias(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  empId: string
): Promise<Map<string, DadosCategoriaMapa>> {
  const { data, error } = await admin
    .from("contratos_categorias")
    .select("id, nome, sigiloso")
    .eq("emp_proprietaria_id", empId)
  if (error) return new Map() // tabela/uso ausente → sem categorias
  return new Map(
    ((data ?? []) as Record<string, unknown>[]).map((c) => [
      String(c.id),
      { nome: texto(c.nome), sigiloso: c.sigiloso === true },
    ])
  )
}

/** Resolve nomes de fornecedores e departamentos de um conjunto de linhas. */
async function resolverNomes(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  linhas: Record<string, unknown>[]
) {
  const fornecedorIds = [
    ...new Set(linhas.map((c) => texto(c.fornecedor_id)).filter(Boolean)),
  ] as string[]
  const departamentoIds = [
    ...new Set(linhas.map((c) => texto(c.departamento_id)).filter(Boolean)),
  ] as string[]

  const [fornRes, deptRes] = await Promise.all([
    fornecedorIds.length
      ? admin
          .from("empresa")
          .select("id, nome_fantasia, nome_razao")
          .in("id", fornecedorIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    departamentoIds.length
      ? admin
          .from("empresa_departamentos")
          .select("id, departamento")
          .in("id", departamentoIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  const fornecedores = new Map(
    ((fornRes.data ?? []) as Record<string, unknown>[]).map((e) => [
      String(e.id),
      e,
    ])
  )
  const departamentos = new Map(
    ((deptRes.data ?? []) as Record<string, unknown>[]).map((d) => [
      String(d.id),
      String(d.departamento ?? ""),
    ])
  )
  return { fornecedores, departamentos }
}

/** Opções de contrato para vincular a um hotel conveniado (select simples). */
export type OpcaoContrato = {
  id: string
  codigo: string | null
  objeto: string | null
  vigenciaTermino: string | null
  vigente: boolean
}

export async function opcoesContratos(): Promise<OpcaoContrato[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("contratos")
    .select("id, codigo, objeto, vigencia_termino")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("vigencia_termino", { ascending: false, nullsFirst: false })
  if (error) return []
  const hoje = hojeSP()
  return (data ?? []).map((c) => {
    const termino = texto(c.vigencia_termino)
    return {
      id: String(c.id),
      codigo: texto(c.codigo),
      objeto: texto(c.objeto),
      vigenciaTermino: termino,
      vigente: vigenciaDe(termino, hoje) !== "vencido",
    }
  })
}

export async function listarContratos(opcoes: {
  busca?: string
  situacao?: SituacaoContrato
  tipo?: string
  categoriaId?: string
  /** Falso = esconde contratos de categoria sigilosa (leitor sem edição). */
  verSigilosos?: boolean
  /**
   * Recorta pela origem: `false` = só contratos (Compras); `true` = só ajudas
   * institucionais; `undefined` = ambos. Ajudas e contratos compartilham a
   * tabela; a flag apoio_institucional os separa.
   */
  apoioInstitucional?: boolean
}): Promise<ContratoLista[]> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const [{ data, error }, categorias] = await Promise.all([
    admin
      .from("contratos")
      .select(SELECT_CONTRATO)
      .eq("emp_proprietaria_id", empId)
      .not("deletado", "is", true)
      .order("vigencia_termino", { ascending: false, nullsFirst: false })
      .limit(2000),
    mapaCategorias(admin, empId),
  ])
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar contratos: ${error.message}`)
  }

  let brutos = (data ?? []) as Record<string, unknown>[]
  if (opcoes.apoioInstitucional !== undefined) {
    brutos = brutos.filter(
      (c) => (c.apoio_institucional === true) === opcoes.apoioInstitucional
    )
  }
  if (opcoes.verSigilosos === false) {
    brutos = brutos.filter((c) => {
      const cid = texto(c.categoria_id)
      return !(cid && categorias.get(cid)?.sigiloso)
    })
  }
  if (opcoes.categoriaId) {
    brutos = brutos.filter(
      (c) => texto(c.categoria_id) === opcoes.categoriaId
    )
  }

  const { fornecedores, departamentos } = await resolverNomes(admin, brutos)
  const hoje = hojeSP()
  let linhas = brutos.map((c) =>
    linhaContrato(c, hoje, fornecedores, departamentos, categorias)
  )

  const busca = (opcoes.busca ?? "").trim().toLowerCase()
  if (busca) {
    linhas = linhas.filter((c) =>
      [c.codigo, c.objeto, c.fornecedorNome]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(busca))
    )
  }

  const s = opcoes.situacao ?? "todos"
  if (s !== "todos") {
    linhas = linhas.filter((c) =>
      s === "vigentes"
        ? c.vigencia === "vigente" || c.vigencia === "vencendo"
        : s === "vencendo"
          ? c.vigencia === "vencendo"
          : s === "vencidos"
            ? c.vigencia === "vencido"
            : c.vigencia === "sem_termo"
    )
  }

  const tipo = opcoes.tipo
  if (tipo === "aditivo") linhas = linhas.filter((c) => c.aditivo)
  else if (tipo === "sob_demanda") linhas = linhas.filter((c) => c.sob_demanda)
  else if (tipo === "apoio_institucional")
    linhas = linhas.filter((c) => c.apoio_institucional)

  return linhas
}

export type ResumoContratos = {
  total: number
  vigentes: number
  vencendo: number
  vencidos: number
  semTermo: number
  /** false enquanto contratos.sql (coluna `valor`) não rodou. */
  esquemaCompleto: boolean
}

export async function resumoContratos(
  verSigilosos = true,
  apoioInstitucional?: boolean
): Promise<ResumoContratos> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const [linhasRes, valorRes, categorias] = await Promise.all([
    admin
      .from("contratos")
      .select("vigencia_termino, deletado, categoria_id, apoio_institucional")
      .eq("emp_proprietaria_id", empId)
      .not("deletado", "is", true)
      .limit(5000),
    admin.from("contratos").select("valor").limit(1),
    mapaCategorias(admin, empId),
  ])

  const esquemaCompleto = !esquemaAusente(valorRes.error)
  if (linhasRes.error) {
    return {
      total: 0,
      vigentes: 0,
      vencendo: 0,
      vencidos: 0,
      semTermo: 0,
      esquemaCompleto,
    }
  }

  const hoje = hojeSP()
  let linhas = (linhasRes.data ?? []) as Record<string, unknown>[]
  if (apoioInstitucional !== undefined) {
    linhas = linhas.filter(
      (c) => (c.apoio_institucional === true) === apoioInstitucional
    )
  }
  if (!verSigilosos) {
    linhas = linhas.filter((c) => {
      const cid = texto(c.categoria_id)
      return !(cid && categorias.get(cid)?.sigiloso)
    })
  }
  const resumo = {
    total: linhas.length,
    vigentes: 0,
    vencendo: 0,
    vencidos: 0,
    semTermo: 0,
    esquemaCompleto,
  }
  for (const c of linhas) {
    const v = vigenciaDe(texto(c.vigencia_termino), hoje)
    if (v === "vigente") resumo.vigentes++
    else if (v === "vencendo") {
      resumo.vencendo++
      resumo.vigentes++
    } else if (v === "vencido") resumo.vencidos++
    else resumo.semTermo++
  }
  return resumo
}

/**
 * Ordens ligadas DIRETAMENTE ao contrato (contrato_id). Fallback para a via
 * indireta do fornecedor enquanto a coluna contrato_id não existe (legado,
 * antes de contratos-ordens.sql).
 */
async function ordensDoContrato(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  contratoId: string,
  fornecedorId: string | null,
  empId: string
): Promise<Record<string, unknown>[]> {
  const SEL =
    "id, codigo, descricao, tipo, situacao, valor_inicial_cobranca, valor_pago, vencimento, data_pagamento, processo_compra_id, excluido, fornecedor_id, beneficiario_fornecedor_id"
  const direto = await admin
    .from("ordens_pagamento")
    .select(SEL)
    .eq("contrato_id", contratoId)
    .eq("emp_proprietaria_id", empId)
    .not("excluido", "is", true)
    .order("vencimento", { ascending: true, nullsFirst: false })
    .limit(500)
  if (!direto.error) return (direto.data ?? []) as Record<string, unknown>[]
  if (!esquemaAusente(direto.error)) {
    throw new Error(`Falha ao listar ordens: ${direto.error.message}`)
  }
  // coluna contrato_id ainda não existe → via indireta do fornecedor (legado)
  if (!fornecedorId) return []
  const indireto = await admin
    .from("ordens_pagamento")
    .select(SEL)
    .or(
      `fornecedor_id.eq.${fornecedorId},beneficiario_fornecedor_id.eq.${fornecedorId}`
    )
    .eq("emp_proprietaria_id", empId)
    .eq("excluido", false)
    .order("created_at", { ascending: false })
    .limit(200)
  return (indireto.data ?? []) as Record<string, unknown>[]
}

export async function buscarContrato(
  id: string,
  verSigilosos = true
): Promise<ContratoDetalhe | null> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: c, error } = await admin
    .from("contratos")
    .select(SELECT_CONTRATO)
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (error && !esquemaAusente(error)) {
    throw new Error(`Falha ao buscar o contrato: ${error.message}`)
  }
  if (!c) return null

  const hoje = hojeSP()
  const linha = c as Record<string, unknown>
  const fornecedorId = texto(linha.fornecedor_id)
  const departamentoId = texto(linha.departamento_id)
  const centroCustoId = texto(linha.centro_custo_id)
  const responsavelId = texto(linha.responsavel_id)
  const principalId = texto(linha.contrato_principal_id)
  const categoriaId = texto(linha.categoria_id)

  const [
    fornRes,
    deptRes,
    centroRes,
    respRes,
    aditivosRes,
    principalRes,
    ordensBrutas,
    categorias,
  ] = await Promise.all([
    fornecedorId
      ? admin
          .from("empresa")
          .select("id, nome_fantasia, nome_razao")
          .eq("id", fornecedorId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    departamentoId
      ? admin
          .from("empresa_departamentos")
          .select("departamento")
          .eq("id", departamentoId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    centroCustoId
      ? admin
          .from("centros_de_custo")
          .select("nome_da_conta")
          .eq("id", centroCustoId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    responsavelId
      ? admin
          .from("usuarios")
          .select("nome_completo, nome_guerra")
          .eq("id", responsavelId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("contratos")
      .select(SELECT_CONTRATO)
      .eq("contrato_principal_id", id)
      .not("deletado", "is", true)
      .order("vigencia_inicio", { ascending: true, nullsFirst: true }),
    principalId
      ? admin
          .from("contratos")
          .select("id, codigo, objeto")
          .eq("id", principalId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ordensDoContrato(admin, id, fornecedorId, empId),
    mapaCategorias(admin, empId),
  ])

  const categoria = categoriaId ? categorias.get(categoriaId) : undefined
  // Contrato sigiloso é invisível a quem não tem edição.
  if (categoria?.sigiloso && !verSigilosos) return null

  const fornecedorNome = nomeEmpresa(
    (fornRes.data as Record<string, unknown>) ?? undefined
  )
  const departamentoNome = deptRes.data
    ? String((deptRes.data as Record<string, unknown>).departamento ?? "") ||
      null
    : null
  const centroCustoNome = centroRes.data
    ? texto((centroRes.data as Record<string, unknown>).nome_da_conta)
    : null
  const responsavelNome = respRes.data
    ? (nomeEmpresa({
        nome_fantasia: (respRes.data as Record<string, unknown>).nome_completo,
        nome_razao: (respRes.data as Record<string, unknown>).nome_guerra,
      }) ?? null)
    : null

  const aditivosBrutos = (aditivosRes.data ?? []) as Record<string, unknown>[]
  const nomes = await resolverNomes(admin, aditivosBrutos)
  const aditivos = aditivosBrutos.map((a) =>
    linhaContrato(a, hoje, nomes.fornecedores, nomes.departamentos, categorias)
  )

  const processoIds = [
    ...new Set(ordensBrutas.map((o) => texto(o.processo_compra_id)).filter(Boolean)),
  ] as string[]
  const processos = processoIds.length
    ? await admin
        .from("compras_solicitacoes")
        .select("id, codigo")
        .in("id", processoIds)
    : { data: [] as Record<string, unknown>[] }
  const processoPorId = new Map(
    ((processos.data ?? []) as Record<string, unknown>[]).map((p) => [
      String(p.id),
      texto(p.codigo),
    ])
  )

  const contrato: Contrato = {
    id: String(linha.id),
    codigo: texto(linha.codigo),
    objeto: texto(linha.objeto),
    valor: linha.valor == null ? null : Number(linha.valor),
    vigencia_inicio: texto(linha.vigencia_inicio),
    vigencia_termino: texto(linha.vigencia_termino),
    aditivo: linha.aditivo === true,
    sob_demanda: linha.sob_demanda === true,
    apoio_institucional: linha.apoio_institucional === true,
    contrato_principal_id: principalId,
    fornecedor_id: fornecedorId,
    departamento_id: departamentoId,
    centro_custo_id: centroCustoId,
    responsavel_id: responsavelId,
    categoria_id: categoriaId,
    arquivo_contrato: texto(linha.arquivo_contrato),
    created_at: texto(linha.created_at),
    updated_at: texto(linha.updated_at),
    vigencia: vigenciaDe(texto(linha.vigencia_termino), hoje),
  }

  // Resumo financeiro das ordens do contrato.
  let previsto = 0
  let pago = 0
  for (const o of ordensBrutas) {
    const vi =
      o.valor_inicial_cobranca != null
        ? Number(o.valor_inicial_cobranca)
        : o.valor_pago != null
          ? Number(o.valor_pago)
          : 0
    previsto += vi
    if (o.valor_pago != null) pago += Number(o.valor_pago)
  }
  const ordensResumo = {
    previsto,
    pago,
    aberto: Math.max(0, previsto - pago),
  }

  return {
    contrato,
    fornecedorNome,
    departamentoNome,
    categoriaNome: categoria?.nome ?? null,
    categoriaSigiloso: categoria?.sigiloso ?? false,
    centroCustoNome,
    responsavelNome,
    arquivoUrl: await urlArquivoCompras(contrato.arquivo_contrato),
    ordensResumo,
    aditivos,
    principal: principalRes.data
      ? {
          id: String((principalRes.data as Record<string, unknown>).id),
          codigo: texto((principalRes.data as Record<string, unknown>).codigo),
          objeto: texto((principalRes.data as Record<string, unknown>).objeto),
        }
      : null,
    aditivoOrfao: contrato.aditivo && !principalId,
    ordens: ordensBrutas.map((o) => {
      const processoId = texto(o.processo_compra_id)
      return {
        id: String(o.id),
        codigo: texto(o.codigo),
        descricao: texto(o.descricao),
        tipo: texto(o.tipo),
        situacao: texto(o.situacao),
        valor:
          o.valor_pago != null
            ? Number(o.valor_pago)
            : o.valor_inicial_cobranca != null
              ? Number(o.valor_inicial_cobranca)
              : null,
        vencimento: texto(o.vencimento),
        data_pagamento: texto(o.data_pagamento),
        processo_compra_id: processoId,
        processoCodigo: processoId
          ? (processoPorId.get(processoId) ?? null)
          : null,
      }
    }),
  }
}

// ── Escrita ────────────────────────────────────────────────────────────────

export type DadosContrato = {
  objeto: string | null
  valor: number | null
  vigencia_inicio: string | null
  vigencia_termino: string | null
  fornecedor_id: string | null
  departamento_id: string | null
  centro_custo_id: string | null
  responsavel_id: string | null
  categoria_id: string | null
  aditivo: boolean
  sob_demanda: boolean
  apoio_institucional: boolean
  contrato_principal_id: string | null
  /** Caminho já gravável (upload feito na action); undefined = não mexer. */
  arquivo_contrato?: string | null
}

function payload(dados: DadosContrato): Record<string, unknown> {
  const p: Record<string, unknown> = {
    objeto: dados.objeto,
    valor: dados.valor,
    vigencia_inicio: dados.vigencia_inicio,
    vigencia_termino: dados.vigencia_termino,
    fornecedor_id: dados.fornecedor_id,
    departamento_id: dados.departamento_id,
    centro_custo_id: dados.centro_custo_id,
    responsavel_id: dados.responsavel_id,
    categoria_id: dados.categoria_id,
    aditivo: dados.aditivo,
    sob_demanda: dados.sob_demanda,
    apoio_institucional: dados.apoio_institucional,
    contrato_principal_id: dados.contrato_principal_id,
  }
  if (dados.arquivo_contrato !== undefined) {
    p.arquivo_contrato = dados.arquivo_contrato
  }
  return p
}

export async function criarContrato(
  dados: DadosContrato
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("contratos")
    .insert({
      ...payload(dados),
      codigo: gerarCodigoProcesso(),
      ativo: true,
      deletado: false,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) {
      return { erro: "Rode supabase/contratos.sql antes de cadastrar contratos." }
    }
    return { erro: `Falha ao cadastrar o contrato: ${error.message}` }
  }
  return { id: String(data.id) }
}

export async function atualizarContrato(
  id: string,
  dados: DadosContrato
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("contratos")
    .update(payload(dados))
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    if (esquemaAusente(error)) {
      return { erro: "Rode supabase/contratos.sql para habilitar o valor do contrato." }
    }
    return { erro: `Falha ao salvar o contrato: ${error.message}` }
  }
  return {}
}

// ── Geração de ordens de pagamento ───────────────────────────────────────────

export type GerarOrdensParams = {
  periodicidade: Periodicidade
  valorParcela: number
  /** Primeiro vencimento (AAAA-MM-DD); os demais somam o período. */
  primeiroVencimento: string
  /** Nº de parcelas (>=1). Ignorado em "unica" (força 1). */
  quantidade: number
  formaPagamento: string | null
}

export type ResultadoGeracao = {
  geradas?: number
  /** Vencimentos que já tinham ordem deste contrato (idempotência). */
  puladas?: number
  erro?: string
}

/**
 * Gera ordens de pagamento "Em autorização" a partir do contrato, uma por
 * competência (mensal/anual) ou uma só (única). Favorecido = fornecedor do
 * contrato; herda departamento e centro de custo. É IDEMPOTENTE: pula
 * vencimentos que já têm ordem deste contrato, então rodar de novo só
 * complementa (não duplica).
 */
export async function gerarOrdensContrato(
  contratoId: string,
  params: GerarOrdensParams
): Promise<ResultadoGeracao> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()

  const { data: c, error } = await admin
    .from("contratos")
    .select("id, objeto, fornecedor_id, departamento_id, centro_custo_id")
    .eq("id", contratoId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) {
      return { erro: "Rode supabase/contratos.sql antes de gerar ordens." }
    }
    return { erro: `Falha ao carregar o contrato: ${error.message}` }
  }
  if (!c) return { erro: "Contrato não encontrado." }

  const linha = c as Record<string, unknown>
  const fornecedorId = texto(linha.fornecedor_id)
  if (!fornecedorId) {
    return {
      erro: "Contrato sem fornecedor — defina o favorecido antes de gerar ordens.",
    }
  }
  if (!(params.valorParcela > 0)) {
    return { erro: "Informe um valor de parcela maior que zero." }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.primeiroVencimento)) {
    return { erro: "Informe a data do primeiro vencimento." }
  }
  const qtd =
    params.periodicidade === "unica"
      ? 1
      : Math.min(Math.max(Math.trunc(params.quantidade), 1), MAX_PARCELAS)

  const alvos = Array.from({ length: qtd }, (_, i) =>
    vencimentoParcela(params.primeiroVencimento, params.periodicidade, i)
  )

  // Idempotência: pula vencimentos que já têm ordem deste contrato.
  const { data: existentes, error: erroExist } = await admin
    .from("ordens_pagamento")
    .select("vencimento")
    .eq("contrato_id", contratoId)
    .eq("emp_proprietaria_id", empId)
    .not("excluido", "is", true)
  if (erroExist) {
    if (esquemaAusente(erroExist)) {
      return { erro: "Rode supabase/contratos-ordens.sql antes de gerar ordens." }
    }
    return { erro: `Falha ao checar ordens existentes: ${erroExist.message}` }
  }
  const jaTem = new Set(
    (existentes ?? [])
      .map((o) => texto(o.vencimento)?.slice(0, 10))
      .filter((v): v is string => Boolean(v))
  )
  const total = alvos.length
  const novos = alvos
    .map((venc, i) => ({ venc, parcela: i + 1 }))
    .filter((x) => !jaTem.has(x.venc))
  const puladas = total - novos.length
  if (novos.length === 0) return { geradas: 0, puladas }

  const departamentoId = texto(linha.departamento_id)
  const centroCustoId = texto(linha.centro_custo_id)
  const objeto = texto(linha.objeto) ?? "Contrato"
  const registros = novos.map(({ venc, parcela }) => ({
    codigo: gerarCodigoProcesso(),
    tipo: "Contrato",
    descricao: descricaoOrdemContrato(objeto, venc, parcela, total),
    situacao: "Em autorização",
    valor_inicial_cobranca: params.valorParcela,
    forma_pagamento: params.formaPagamento,
    vencimento: venc,
    beneficiario_fornecedor_id: fornecedorId,
    departamento_id: departamentoId,
    centro_custo_despesa_id: centroCustoId,
    contrato_id: contratoId,
    excluido: false,
    emp_proprietaria_id: empId,
  }))
  const { error: erroIns } = await admin
    .from("ordens_pagamento")
    .insert(registros)
  if (erroIns) {
    if (esquemaAusente(erroIns)) {
      return { erro: "Rode supabase/contratos-ordens.sql antes de gerar ordens." }
    }
    return { erro: `Falha ao gerar as ordens: ${erroIns.message}` }
  }
  return { geradas: novos.length, puladas }
}

/**
 * Descrição padrão (dinâmica) das ordens geradas por um contrato. Usa o objeto
 * do contrato + parcela X/N (quando parcelado) + vencimento — o que veio do
 * Bubble não tinha descrição; toda ordem criada aqui nasce descrita.
 */
function descricaoOrdemContrato(
  objeto: string,
  venc: string,
  parcela: number,
  total: number
): string {
  const data = `${venc.slice(8, 10)}/${venc.slice(5, 7)}/${venc.slice(0, 4)}`
  const parc = total > 1 ? ` — parcela ${parcela}/${total}` : ""
  return `${objeto}${parc}, venc. ${data}`
}

// ── Lookups para os formulários ──────────────────────────────────────────────

export type OpcoesContrato = {
  fornecedores: {
    id: string
    nome: string
    cnpj_cpf: string | null
    bloqueado: boolean
  }[]
  departamentos: { id: string; nome: string }[]
  centrosCusto: { id: string; nome: string }[]
  usuarios: { id: string; nome: string }[]
  categorias: { id: string; nome: string; sigiloso: boolean }[]
}

/** Carrega de uma vez as opções dos selects do formulário de contrato. */
export async function carregarOpcoesContrato(): Promise<OpcoesContrato> {
  const [fornecedores, departamentos, centrosCusto, usuarios, categorias] =
    await Promise.all([
      listarFornecedores(),
      listarDepartamentos(),
      listarCentrosCusto(),
      listarUsuariosAtivos(),
      listarCategoriasContrato(),
    ])
  return {
    fornecedores: fornecedores.map((f) => ({
      id: f.id,
      nome: f.nome,
      cnpj_cpf: f.cnpj_cpf,
      bloqueado: f.bloqueado,
    })),
    departamentos,
    centrosCusto: centrosCusto.map((c) => ({
      id: String(c.id),
      nome: String(c.nome_da_conta ?? "(sem nome)"),
    })),
    usuarios,
    categorias: categorias.map((c) => ({
      id: c.id,
      nome: c.nome ?? "(sem nome)",
      sigiloso: c.sigiloso,
    })),
  }
}

/**
 * Opções do formulário de AJUDA institucional: o favorecido é uma entidade
 * apoiada (não um fornecedor), e não há categoria. As categorias vêm vazias
 * para satisfazer o mesmo tipo do formulário compartilhado.
 */
export async function carregarOpcoesAjuda(): Promise<OpcoesContrato> {
  const [entidades, departamentos, centrosCusto, usuarios] = await Promise.all([
    listarEntidadesApoiadas(),
    listarDepartamentos(),
    listarCentrosCusto(),
    listarUsuariosAtivos(),
  ])
  return {
    fornecedores: entidades.map((e) => ({
      id: e.id,
      nome: e.nome,
      cnpj_cpf: e.cnpj_cpf,
      bloqueado: e.bloqueado,
    })),
    departamentos,
    centrosCusto: centrosCusto.map((c) => ({
      id: String(c.id),
      nome: String(c.nome_da_conta ?? "(sem nome)"),
    })),
    usuarios,
    categorias: [],
  }
}

export async function excluirContrato(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("contratos")
    .update({ deletado: true, ativo: false })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir o contrato: ${error.message}` }
  return {}
}

// ── Categorias de contrato ───────────────────────────────────────────────────

/** Lista as categorias do tenant com a contagem de contratos que as usam. */
export async function listarCategoriasContrato(): Promise<CategoriaContrato[]> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const [catRes, usoRes] = await Promise.all([
    admin
      .from("contratos_categorias")
      .select("id, nome, sigiloso")
      .eq("emp_proprietaria_id", empId)
      .order("nome", { ascending: true }),
    admin
      .from("contratos")
      .select("categoria_id")
      .eq("emp_proprietaria_id", empId)
      .not("deletado", "is", true)
      .not("categoria_id", "is", null)
      .limit(5000),
  ])
  if (catRes.error) return [] // tabela ausente → sem categorias

  const usos = new Map<string, number>()
  for (const c of (usoRes.data ?? []) as Record<string, unknown>[]) {
    const cid = texto(c.categoria_id)
    if (cid) usos.set(cid, (usos.get(cid) ?? 0) + 1)
  }
  return ((catRes.data ?? []) as Record<string, unknown>[]).map((c) => ({
    id: String(c.id),
    nome: texto(c.nome),
    sigiloso: c.sigiloso === true,
    usos: usos.get(String(c.id)) ?? 0,
  }))
}

export async function criarCategoriaContrato(
  nome: string,
  sigiloso: boolean
): Promise<{ id?: string; erro?: string }> {
  const nomeLimpo = nome.trim()
  if (!nomeLimpo) return { erro: "Informe o nome da categoria." }
  const admin = await createAdminClient()
  const sessao = await getSessaoPainel()
  const { data, error } = await admin
    .from("contratos_categorias")
    .insert({
      nome: nomeLimpo,
      sigiloso,
      criado_por_id: sessao?.usuario.id ?? null,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) {
      return {
        erro: "Rode supabase/contratos-categorias.sql antes de criar categorias.",
      }
    }
    return { erro: `Falha ao criar a categoria: ${error.message}` }
  }
  return { id: String(data.id) }
}

export async function atualizarCategoriaContrato(
  id: string,
  nome: string,
  sigiloso: boolean
): Promise<{ erro?: string }> {
  const nomeLimpo = nome.trim()
  if (!nomeLimpo) return { erro: "Informe o nome da categoria." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("contratos_categorias")
    .update({ nome: nomeLimpo, sigiloso })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar a categoria: ${error.message}` }
  return {}
}

export async function excluirCategoriaContrato(
  id: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  // Guarda: não deixa contratos órfãos — bloqueia se a categoria está em uso.
  const { count } = await admin
    .from("contratos")
    .select("id", { count: "exact", head: true })
    .eq("categoria_id", id)
    .eq("emp_proprietaria_id", empId)
    .not("deletado", "is", true)
  if ((count ?? 0) > 0) {
    return {
      erro: `Categoria em uso por ${count} contrato(s). Reatribua-os antes de excluir.`,
    }
  }
  const { error } = await admin
    .from("contratos_categorias")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao excluir a categoria: ${error.message}` }
  return {}
}
