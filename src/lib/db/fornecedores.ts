import "server-only"
import { hojeSP, lerEmLotes } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"
import { esquemaAusente } from "@/lib/db/comum"

/**
 * Fornecedores — cadastro completo sobre linhas de `empresa`, com:
 * - endereços na tabela migrada `enderecos` (coluna nova `empresa_id`, via
 *   supabase/fornecedores.sql — leituras degradam até o SQL rodar);
 * - dados bancários na tabela migrada `dados_bancarios` (fornecedor_id);
 * - contratos (somente leitura aqui; módulo Contratos fica para depois);
 * - ordens de pagamento onde a empresa é favorecida (as legadas migraram
 *   SEM esse vínculo — a lista cobre as novas até a re-migração).
 */

const AVISO_SQL =
  "Cadastro de fornecedores incompleto — rode supabase/fornecedores.sql no Supabase."

export type Fornecedor = {
  id: string
  nome_fantasia: string | null
  nome_razao: string | null
  /** Nome de exibição (fantasia > razão). */
  nome: string
  cnpj_cpf: string | null
  pessoa_juridica: boolean
  fornecedor_bloqueado: boolean
  inativa: boolean
  inativa_data: string | null
  created_at: string | null
  legado: boolean
}

export type EnderecoFornecedor = {
  id: string
  nome_endereco: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
}

export type ContaBancaria = {
  id: string
  banco: string | null
  agencia: string | null
  conta: string | null
  tipo_conta: string | null
  pix: string | null
  favorecido: string | null
}

export type ContratoFornecedor = {
  id: string
  codigo: string | null
  objeto: string | null
  vigencia_inicio: string | null
  vigencia_termino: string | null
  ativo: boolean
  arquivo_contrato: string | null
  vigente: boolean
}

export type OrdemFornecedor = {
  id: string
  codigo: string | null
  descricao: string | null
  tipo: string | null
  situacao: string | null
  valor_inicial_cobranca: number | null
  valor_pago: number | null
  vencimento: string | null
  data_pagamento: string | null
  /** Detalhe da compra, quando a ordem veio de um processo de aquisição. */
  processo_compra_id: string | null
  processoCodigo: string | null
  processoProduto: string | null
}

export type FornecedorDetalhe = {
  fornecedor: Fornecedor
  /** null = coluna empresa_id ausente (rodar supabase/fornecedores.sql). */
  enderecos: EnderecoFornecedor[] | null
  contas: ContaBancaria[]
  contratosVigentes: ContratoFornecedor[]
  contratosTerminados: ContratoFornecedor[]
  ordens: OrdemFornecedor[]
}

function normalizarFornecedor(e: Record<string, unknown>): Fornecedor {
  return {
    id: String(e.id),
    nome_fantasia: (e.nome_fantasia as string | null) ?? null,
    nome_razao: (e.nome_razao as string | null) ?? null,
    nome:
      [e.nome_fantasia, e.nome_razao].find(
        (v): v is string => typeof v === "string" && v.trim() !== ""
      ) ?? "(sem nome)",
    cnpj_cpf: (e.cnpj_cpf as string | null) ?? null,
    pessoa_juridica: e.pessoa_juridica === true,
    fornecedor_bloqueado: e.fornecedor_bloqueado === true || e.bloqueado === true,
    inativa: e.inativa === true,
    inativa_data: (e.inativa_data as string | null) ?? null,
    created_at: (e.created_at as string | null) ?? null,
    legado: Boolean(e.bubble_id),
  }
}

export async function buscarFornecedor(
  id: string
): Promise<FornecedorDetalhe | null> {
  const admin = await createAdminClient()
  const { data: e, error } = await admin
    .from("empresa")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar o fornecedor: ${error.message}`)
  if (!e) return null

  const [enderecosRes, contasRes, contratosRes, ordensRes] = await Promise.all([
    admin
      .from("enderecos")
      .select("*")
      .eq("empresa_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("dados_bancarios")
      .select("*")
      .eq("fornecedor_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("contratos")
      .select(
        "id, codigo, objeto, vigencia_inicio, vigencia_termino, ativo, arquivo_contrato, deletado"
      )
      .eq("fornecedor_id", id)
      .not("deletado", "is", true)
      .order("vigencia_termino", { ascending: false, nullsFirst: true }),
    admin
      .from("ordens_pagamento")
      .select(
        "id, codigo, descricao, tipo, situacao, valor_inicial_cobranca, valor_pago, vencimento, data_pagamento, processo_compra_id, excluido"
      )
      .or(`fornecedor_id.eq.${id},beneficiario_fornecedor_id.eq.${id}`)
      .eq("excluido", false)
      .order("created_at", { ascending: false })
      .limit(500),
  ])

  if (enderecosRes.error && !esquemaAusente(enderecosRes.error)) {
    throw new Error(`Falha ao buscar endereços: ${enderecosRes.error.message}`)
  }
  if (contasRes.error && !esquemaAusente(contasRes.error)) {
    throw new Error(`Falha ao buscar contas: ${contasRes.error.message}`)
  }

  const hoje = hojeSP()
  const contratos = (
    (contratosRes.data ?? []) as Record<string, unknown>[]
  ).map((c) => ({
    id: String(c.id),
    codigo: (c.codigo as string | null) ?? null,
    objeto: (c.objeto as string | null) ?? null,
    vigencia_inicio: (c.vigencia_inicio as string | null) ?? null,
    vigencia_termino: (c.vigencia_termino as string | null) ?? null,
    ativo: c.ativo !== false,
    arquivo_contrato: (c.arquivo_contrato as string | null) ?? null,
    vigente:
      c.ativo !== false &&
      (!c.vigencia_termino || String(c.vigencia_termino) >= hoje),
  }))

  const ordensBrutas = (ordensRes.data ?? []) as Record<string, unknown>[]
  const processoIds = [
    ...new Set(
      ordensBrutas
        .map((o) => o.processo_compra_id)
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const processos = processoIds.length
    ? await admin
        .from("compras_solicitacoes")
        .select("id, codigo, solicitacao_produto")
        .in("id", processoIds)
    : { data: [] }
  const processoPorId = new Map(
    ((processos.data ?? []) as Record<string, unknown>[]).map((p) => [
      String(p.id),
      p,
    ])
  )

  return {
    fornecedor: normalizarFornecedor(e as Record<string, unknown>),
    enderecos: enderecosRes.error
      ? null
      : ((enderecosRes.data ?? []) as Record<string, unknown>[]).map((x) => ({
          id: String(x.id),
          nome_endereco: (x.nome_endereco as string | null) ?? null,
          cep: (x.cep as string | null) ?? null,
          logradouro: (x.logradouro as string | null) ?? null,
          numero: (x.numero as string | null) ?? null,
          complemento: (x.complemento as string | null) ?? null,
          bairro: (x.bairro as string | null) ?? null,
          cidade: (x.cidade as string | null) ?? null,
          estado: (x.estado as string | null) ?? null,
        })),
    contas: contasRes.error
      ? []
      : ((contasRes.data ?? []) as Record<string, unknown>[]).map((x) => ({
          id: String(x.id),
          banco: (x.banco as string | null) ?? null,
          agencia: (x.agencia as string | null) ?? null,
          conta: (x.conta as string | null) ?? null,
          tipo_conta: (x.tipo_conta as string | null) ?? null,
          pix: (x.pix as string | null) ?? null,
          favorecido: (x.favorecido as string | null) ?? null,
        })),
    contratosVigentes: contratos.filter((c) => c.vigente),
    contratosTerminados: contratos.filter((c) => !c.vigente),
    ordens: ordensBrutas.map((o) => {
      const processoId = (o.processo_compra_id as string | null) ?? null
      const processo = processoId ? processoPorId.get(processoId) : undefined
      return {
        id: String(o.id),
        codigo: (o.codigo as string | null) ?? null,
        descricao: (o.descricao as string | null) ?? null,
        tipo: (o.tipo as string | null) ?? null,
        situacao: (o.situacao as string | null) ?? null,
        valor_inicial_cobranca:
          (o.valor_inicial_cobranca as number | null) ?? null,
        valor_pago: (o.valor_pago as number | null) ?? null,
        vencimento: (o.vencimento as string | null) ?? null,
        data_pagamento: (o.data_pagamento as string | null) ?? null,
        processo_compra_id: processoId,
        processoCodigo: (processo?.codigo as string | null) ?? null,
        processoProduto:
          (processo?.solicitacao_produto as string | null) ?? null,
      }
    }),
  }
}

// ── CRUD do fornecedor ─────────────────────────────────────────────────────

export type DadosFornecedor = {
  nome_fantasia: string | null
  nome_razao: string | null
  /** Só dígitos. */
  cnpj_cpf: string | null
  pessoa_juridica: boolean
  fornecedor_bloqueado: boolean
}

function validarDados(dados: DadosFornecedor): string | null {
  if (!dados.nome_fantasia?.trim() && !dados.nome_razao?.trim()) {
    return "Informe o nome fantasia ou a razão social."
  }
  if (dados.cnpj_cpf) {
    const n = dados.cnpj_cpf.length
    if (n !== 11 && n !== 14) {
      return "CNPJ/CPF deve ter 14 ou 11 dígitos."
    }
  }
  return null
}

/** Recusa CNPJ/CPF já cadastrado em outra empresa não-inativa. */
async function cnpjDuplicado(
  cnpj: string,
  ignorarId?: string
): Promise<boolean> {
  const admin = await createAdminClient()
  let q = admin
    .from("empresa")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cnpj_cpf", cnpj)
    .not("inativa", "is", true)
    .limit(1)
  if (ignorarId) q = q.neq("id", ignorarId)
  const { data } = await q
  return (data ?? []).length > 0
}

export type FornecedorEncontrado = {
  id: string
  nome: string
  cnpj_cpf: string | null
  bloqueado: boolean
  /** Como foi achado: CNPJ/CPF é certeza; nome é só indício. */
  por: "documento" | "nome"
}

/**
 * Procura um fornecedor ativo do tenant pelo CNPJ/CPF (só dígitos) e, sem
 * documento ou sem achar por ele, pela razão social/nome fantasia exatos
 * (sem diferença de maiúsculas). Usado pela leitura da nota na compra direta.
 */
export async function buscarFornecedorExistente({
  cnpjCpf,
  nomes,
}: {
  cnpjCpf: string | null
  nomes: string[]
}): Promise<FornecedorEncontrado | null> {
  const admin = await createAdminClient()
  const tenant = await tenantAtual()
  const colunas =
    "id, nome_fantasia, nome_razao, cnpj_cpf, fornecedor_bloqueado, bloqueado"
  const montar = (
    e: Record<string, unknown>,
    por: FornecedorEncontrado["por"]
  ): FornecedorEncontrado => ({
    id: String(e.id),
    nome:
      [e.nome_fantasia, e.nome_razao].find(
        (v): v is string => typeof v === "string" && v.trim() !== ""
      ) ?? "(sem nome)",
    cnpj_cpf: (e.cnpj_cpf as string | null) ?? null,
    bloqueado: e.fornecedor_bloqueado === true || e.bloqueado === true,
    por,
  })

  if (cnpjCpf) {
    const { data } = await admin
      .from("empresa")
      .select(colunas)
      .eq("emp_proprietaria_id", tenant)
      .eq("cnpj_cpf", cnpjCpf)
      .not("inativa", "is", true)
      .limit(1)
    if (data?.[0]) return montar(data[0], "documento")
  }

  for (const nome of nomes) {
    const termo = nome.trim().replace(/[,()%_]/g, " ").trim()
    if (termo.length < 3) continue
    const { data } = await admin
      .from("empresa")
      .select(colunas)
      .eq("emp_proprietaria_id", tenant)
      .not("inativa", "is", true)
      .or(`nome_razao.ilike.${termo},nome_fantasia.ilike.${termo}`)
      .limit(1)
    // Mesmo nome com OUTRO CNPJ é outra empresa (filial, homônima).
    const achado = data?.[0]
    if (achado && (!cnpjCpf || !achado.cnpj_cpf)) return montar(achado, "nome")
  }
  return null
}

export async function criarFornecedor(
  dados: DadosFornecedor
): Promise<{ id?: string; erro?: string }> {
  const invalido = validarDados(dados)
  if (invalido) return { erro: invalido }
  if (dados.cnpj_cpf && (await cnpjDuplicado(dados.cnpj_cpf))) {
    return { erro: "Já existe um cadastro ativo com este CNPJ/CPF." }
  }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("empresa")
    .insert({
      nome_fantasia: dados.nome_fantasia,
      nome_razao: dados.nome_razao,
      cnpj_cpf: dados.cnpj_cpf,
      pessoa_juridica: dados.pessoa_juridica,
      fornecedor_bloqueado: dados.fornecedor_bloqueado,
      empresa: false,
      bloqueado: false,
      inativa: false,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) return { erro: `Não foi possível cadastrar: ${error.message}` }
  return { id: data.id }
}

// ── Entidades apoiadas ──────────────────────────────────────────────────────
// Mesma lógica do cadastro de fornecedores (linhas de `empresa`), recortadas
// pela flag `entidade_apoiada`. São os favorecidos possíveis de uma ajuda
// institucional. Reusa atualizar/excluir/endereços/contas do fornecedor.

export type EntidadeApoiadaLinha = {
  id: string
  nome: string
  nome_razao: string | null
  cnpj_cpf: string | null
  pessoa_juridica: boolean
  bloqueado: boolean
}

export async function listarEntidadesApoiadas(
  busca = ""
): Promise<EntidadeApoiadaLinha[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("empresa")
    .select(
      "id, nome_fantasia, nome_razao, cnpj_cpf, pessoa_juridica, fornecedor_bloqueado, bloqueado, inativa"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("entidade_apoiada", true)
    .not("inativa", "is", true)
  const termo = busca.trim().replace(/[,()]/g, " ").trim()
  if (termo) {
    const digitos = termo.replace(/\D/g, "")
    q = q.or(
      [
        `nome_fantasia.ilike.%${termo}%`,
        `nome_razao.ilike.%${termo}%`,
        digitos ? `cnpj_cpf.like.%${digitos}%` : null,
      ]
        .filter(Boolean)
        .join(",")
    )
  }
  let data: Record<string, unknown>[]
  try {
    // Em lotes (U8): o PostgREST corta em 1.000 linhas.
    data = await lerEmLotes<Record<string, unknown>>((de, ate) =>
      q.order("nome_fantasia", { ascending: true, nullsFirst: false }).order("id").range(de, ate)
    )
  } catch (error) {
    if (esquemaAusente(error as { code?: string })) return [] // coluna entidade_apoiada ainda não existe
    throw new Error(`Falha ao listar entidades apoiadas: ${(error as Error).message}`)
  }
  return data.map((e) => ({
    id: String(e.id),
    nome:
      [e.nome_fantasia, e.nome_razao].find(
        (v): v is string => typeof v === "string" && v.trim() !== ""
      ) ?? "(sem nome)",
    nome_razao: (e.nome_razao as string | null) ?? null,
    cnpj_cpf: (e.cnpj_cpf as string | null) ?? null,
    pessoa_juridica: e.pessoa_juridica === true,
    bloqueado: e.fornecedor_bloqueado === true || e.bloqueado === true,
  }))
}

export async function criarEntidadeApoiada(
  dados: DadosFornecedor
): Promise<{ id?: string; erro?: string }> {
  const invalido = validarDados(dados)
  if (invalido) return { erro: invalido }
  if (dados.cnpj_cpf && (await cnpjDuplicado(dados.cnpj_cpf))) {
    return { erro: "Já existe um cadastro ativo com este CNPJ/CPF." }
  }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("empresa")
    .insert({
      nome_fantasia: dados.nome_fantasia,
      nome_razao: dados.nome_razao,
      cnpj_cpf: dados.cnpj_cpf,
      pessoa_juridica: dados.pessoa_juridica,
      fornecedor_bloqueado: dados.fornecedor_bloqueado,
      entidade_apoiada: true,
      empresa: false,
      bloqueado: false,
      inativa: false,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) {
      return {
        erro: "Rode supabase/institucional-ajudas.sql antes de cadastrar entidades apoiadas.",
      }
    }
    return { erro: `Não foi possível cadastrar: ${error.message}` }
  }
  return { id: data.id }
}

export async function atualizarFornecedor(
  id: string,
  dados: DadosFornecedor
): Promise<{ erro?: string }> {
  const invalido = validarDados(dados)
  if (invalido) return { erro: invalido }
  if (dados.cnpj_cpf && (await cnpjDuplicado(dados.cnpj_cpf, id))) {
    return { erro: "Já existe outro cadastro ativo com este CNPJ/CPF." }
  }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("empresa")
    .update({
      nome_fantasia: dados.nome_fantasia,
      nome_razao: dados.nome_razao,
      cnpj_cpf: dados.cnpj_cpf,
      pessoa_juridica: dados.pessoa_juridica,
      fornecedor_bloqueado: dados.fornecedor_bloqueado,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .select("id")
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if ((data ?? []).length === 0) return { erro: "Fornecedor não encontrado." }
  return {}
}

export async function definirInativa(
  id: string,
  inativa: boolean
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("empresa")
    .update({
      inativa,
      inativa_data: inativa ? hojeSP() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return {}
}

/**
 * Exclui o fornecedor APENAS sem vínculos (ordens, propostas, fornecimentos,
 * contratos, cupons…). Com histórico, o caminho é inativar.
 */
export async function excluirFornecedor(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const refs: [string, string][] = [
    ["ordens_pagamento", "fornecedor_id"],
    ["ordens_pagamento", "beneficiario_fornecedor_id"],
    ["compras_propostas", "fornecedor_id"],
    ["compras_fornecimentos", "fornecedor_id"],
    ["contratos", "fornecedor_id"],
    ["compras_solicitacoes", "compra_fornecedor_id"],
  ]
  for (const [tabela, coluna] of refs) {
    const { count, error } = await admin
      .from(tabela)
      .select("id", { count: "exact", head: true })
      .eq(coluna, id)
    if (!error && (count ?? 0) > 0) {
      return {
        erro: `Este fornecedor tem registros vinculados (${tabela}) — inative o cadastro em vez de excluir.`,
      }
    }
  }
  // Cadastro auxiliar sai junto.
  await admin.from("dados_bancarios").delete().eq("fornecedor_id", id)
  const enderecosDel = await admin
    .from("enderecos")
    .delete()
    .eq("empresa_id", id)
  if (enderecosDel.error && !esquemaAusente(enderecosDel.error)) {
    return { erro: `Falha ao limpar endereços: ${enderecosDel.error.message}` }
  }
  const { error } = await admin
    .from("empresa")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return {}
}

/**
 * Exclui a entidade apoiada apenas se NÃO houver ajuda cadastrada para ela
 * (contrato com apoio_institucional=true). Com ajuda, o registro fica.
 * Demais vínculos (ordens, contratos comuns…) caem na guarda de excluirFornecedor.
 */
export async function excluirEntidadeApoiada(
  id: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { count } = await admin
    .from("contratos")
    .select("id", { count: "exact", head: true })
    .eq("fornecedor_id", id)
    .eq("apoio_institucional", true)
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("deletado", "is", true)
  if ((count ?? 0) > 0) {
    return {
      erro: `Esta entidade tem ${count} ajuda(s) cadastrada(s) — não pode ser excluída.`,
    }
  }
  return excluirFornecedor(id)
}

// ── Endereços ──────────────────────────────────────────────────────────────

export type DadosEndereco = {
  nome_endereco: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
}

export async function salvarEndereco(
  fornecedorId: string,
  dados: DadosEndereco,
  enderecoId?: string
): Promise<{ erro?: string }> {
  if (!dados.logradouro?.trim() && !dados.cidade?.trim()) {
    return { erro: "Informe ao menos logradouro ou cidade." }
  }
  const admin = await createAdminClient()
  const { error } = enderecoId
    ? await admin
        .from("enderecos")
        .update({ ...dados })
        .eq("id", enderecoId)
        .eq("empresa_id", fornecedorId)
    : await admin.from("enderecos").insert({
        ...dados,
        empresa_id: fornecedorId,
        emp_proprietaria_id: await tenantAtual(),
      })
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível salvar o endereço: ${error.message}` }
  }
  return {}
}

export async function excluirEndereco(
  fornecedorId: string,
  enderecoId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("enderecos")
    .delete()
    .eq("id", enderecoId)
    .eq("empresa_id", fornecedorId)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return {}
}

// ── Dados bancários ────────────────────────────────────────────────────────

export type DadosConta = {
  banco: string | null
  agencia: string | null
  conta: string | null
  tipo_conta: string | null
  pix: string | null
  favorecido: string | null
}

export async function salvarConta(
  fornecedorId: string,
  dados: DadosConta,
  contaId?: string
): Promise<{ erro?: string }> {
  if (!dados.pix?.trim() && !(dados.banco?.trim() && dados.conta?.trim())) {
    return { erro: "Informe uma chave Pix ou banco + conta." }
  }
  const admin = await createAdminClient()
  const { error } = contaId
    ? await admin
        .from("dados_bancarios")
        .update({ ...dados })
        .eq("id", contaId)
        .eq("fornecedor_id", fornecedorId)
    : await admin
        .from("dados_bancarios")
        .insert({ ...dados, fornecedor_id: fornecedorId })
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível salvar a conta: ${error.message}` }
  }
  return {}
}

export async function excluirConta(
  fornecedorId: string,
  contaId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("dados_bancarios")
    .delete()
    .eq("id", contaId)
    .eq("fornecedor_id", fornecedorId)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return {}
}

// ── Mescla de cadastros duplicados ─────────────────────────────────────────

const ROTULO_TABELA: Record<string, string> = {
  ordens_pagamento: "ordens de pagamento",
  contratos: "contratos",
  compras_propostas: "propostas",
  compras_fornecimentos: "fornecimentos",
  compras_solicitacoes: "processos de compra",
  compras_ordem_compra: "ordens de compra",
  compras_rpa: "RPAs",
  dados_bancarios: "contas bancárias",
  enderecos: "endereços",
  patrimonio_nota_fiscal: "notas do patrimônio",
  viagens_itens: "itens de viagem",
  viagens_faturas: "faturas de viagem",
  veiculo_contratos_aluguel: "contratos de locação",
  danfes_recibos: "notas e recibos",
  prestadores_servico: "prestadores",
  pessoal_atividades_executores: "executores de atividades",
}

/**
 * Junta cadastros da MESMA empresa (mesmo CPF/CNPJ) no principal: tudo que
 * aponta para os incorporados passa a apontar para ele, e eles ficam
 * inativos com `mesclado_em_id` (supabase/fornecedores-edicao-mescla.sql).
 * Aqui só se confere que todos têm o MESMO documento — a função no banco
 * confere o tenant e faz a transação.
 */
export async function mesclarFornecedores(dados: {
  principal: string
  secundarios: string[]
  usuarioId: string
}): Promise<{ erro?: string; resumo?: string; pendentes?: string[] }> {
  const secundarios = [...new Set(dados.secundarios.filter((s) => s && s !== dados.principal))]
  if (secundarios.length === 0) return { erro: "Escolha ao menos um cadastro para incorporar." }
  const admin = await createAdminClient()
  const tenant = await tenantAtual()
  const { data: linhas, error } = await admin
    .from("empresa")
    .select("id, cnpj_cpf")
    .eq("emp_proprietaria_id", tenant)
    .in("id", [dados.principal, ...secundarios])
  if (error) return { erro: `Falha ao carregar os cadastros: ${error.message}` }
  const docs = new Set((linhas ?? []).map((l) => String(l.cnpj_cpf ?? "").replace(/\D/g, "")))
  if ((linhas ?? []).length !== secundarios.length + 1) {
    return { erro: "Algum dos cadastros não foi encontrado nesta entidade." }
  }
  if (docs.size !== 1 || docs.has("")) {
    return { erro: "Só cadastros com o MESMO CPF/CNPJ podem ser mesclados." }
  }

  const { data, error: erroRpc } = await admin.rpc("mesclar_fornecedores", {
    p_emp: tenant,
    p_principal: dados.principal,
    p_secundarios: secundarios,
    p_usuario: dados.usuarioId,
  })
  if (erroRpc) {
    if (/could not find the function/i.test(erroRpc.message)) {
      return { erro: "Mescla ainda não configurada — rode supabase/fornecedores-edicao-mescla.sql." }
    }
    return { erro: erroRpc.message }
  }
  const r = (data ?? {}) as { movidos?: Record<string, number>; pendentes?: string[] }
  const porTabela = new Map<string, number>()
  for (const [chave, n] of Object.entries(r.movidos ?? {})) {
    const tabela = chave.split(".")[0]
    porTabela.set(tabela, (porTabela.get(tabela) ?? 0) + Number(n))
  }
  const partes = [...porTabela.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${n} ${ROTULO_TABELA[t] ?? t.replace(/_/g, " ")}`)
  return {
    resumo: partes.length ? partes.join(", ") : "nenhum registro vinculado",
    pendentes: r.pendentes ?? [],
  }
}

export type CadastroIncorporado = {
  id: string
  nome: string
  cnpj_cpf: string | null
  mesclado_em: string | null
}

/** Cadastros que este incorporou (mesclas anteriores). Vazio sem o SQL. */
export async function incorporadosPor(id: string): Promise<CadastroIncorporado[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("empresa")
    .select("id, nome_fantasia, nome_razao, cnpj_cpf, mesclado_em")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("mesclado_em_id", id)
    .order("mesclado_em", { ascending: false })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((e) => ({
    id: String(e.id),
    nome:
      [e.nome_fantasia, e.nome_razao].find(
        (v): v is string => typeof v === "string" && v.trim() !== ""
      ) ?? "(sem nome)",
    cnpj_cpf: (e.cnpj_cpf as string | null) ?? null,
    mesclado_em: (e.mesclado_em as string | null) ?? null,
  }))
}

/** Para onde este cadastro foi mesclado (null = não foi, ou sem o SQL). */
export async function mescladoEm(id: string): Promise<{ id: string; nome: string } | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("empresa")
    .select("mesclado_em_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error || !data?.mesclado_em_id) return null
  const { data: p } = await admin
    .from("empresa")
    .select("id, nome_fantasia, nome_razao")
    .eq("id", String(data.mesclado_em_id))
    .maybeSingle()
  if (!p) return null
  return {
    id: String(p.id),
    nome:
      [p.nome_fantasia, p.nome_razao].find(
        (v): v is string => typeof v === "string" && v.trim() !== ""
      ) ?? "(sem nome)",
  }
}
