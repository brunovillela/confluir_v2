import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"

export const ORDENS_POR_PAGINA = 50

/**
 * Semântica das colunas de `ordens_pagamento` (confirmada pelo Bruno em
 * 2026-07-13 + medição no banco):
 * - `valor_inicial_cobranca`: valor cobrado para pagamento.
 * - `valor_pago`: valor efetivamente pago — pode diferir do cobrado por
 *   acréscimos (atraso, frete) ou descontos (antecipação). Na migração é a
 *   coluna preenchida (11.186/11.714); as demais vieram nulas.
 * - `vencimento`: data acertada com o fornecedor; `data_pagamento`: pagamento
 *   efetivo; `autorizacao_data`: autorização.
 * - Favorecido: empresa/fornecedor (fornecedor_id, beneficiario_fornecedor_id
 *   → `empresa`) ou pessoa/filiado (beneficiario_usuario_id → `usuarios`).
 * - Situações reais em `situacao`: Paga, Processando, Cancelada, A pagar,
 *   Em autorização, Aguardando informações. O boolean `pago` e `data_emissao`
 *   são legados 100% nulos — não usar.
 */
export const SITUACOES_ABERTAS = [
  "A pagar",
  "Processando",
  "Em autorização",
  "Aguardando informações",
]

export type OrdemLinha = {
  id: string
  codigo: string | null
  descricao: string | null
  tipo: string | null
  situacao: string | null
  forma_pagamento: string | null
  valor_inicial_cobranca: number | null
  valor_pago: number | null
  vencimento: string | null
  data_pagamento: string | null
  fornecedor_id: string | null
  beneficiario_fornecedor_id: string | null
  beneficiario_usuario_id: string | null
  /** Favorecido avulso (gente sem conta: diretor/convidado de custeio). */
  beneficiario_nome_avulso: string | null
  /** Nome resolvido do favorecido (empresa, usuário ou avulso). */
  favorecido: string | null
}

export type FiltrosOrdens = {
  busca?: string
  situacao?: "todas" | "abertas" | "pagas" | "canceladas"
  /** Filtro pela coluna `tipo` (ex.: "Custeio", "Compras"); "todos" não filtra. */
  tipo?: string
  pagina?: number
  ordem?: "vencimento" | "pagamento" | "valor"
  dir?: "asc" | "desc"
}

export type ListaOrdens = {
  linhas: OrdemLinha[]
  total: number
  pagina: number
  totalPaginas: number
}

const COLUNAS_ORDEM: Record<string, string> = {
  vencimento: "vencimento",
  pagamento: "data_pagamento",
  valor: "valor_pago",
}

const SELECT_ORDEM =
  "id, codigo, descricao, tipo, situacao, forma_pagamento, valor_inicial_cobranca, valor_pago, vencimento, data_pagamento, fornecedor_id, beneficiario_fornecedor_id, beneficiario_usuario_id, beneficiario_nome_avulso"

type BuilderFiltros = {
  eq(coluna: string, valor: unknown): BuilderFiltros
  not(coluna: string, operador: string, valor: unknown): BuilderFiltros
  in(coluna: string, valores: string[]): BuilderFiltros
  or(filtros: string): BuilderFiltros
  ilike(coluna: string, padrao: string): BuilderFiltros
}

function escaparLike(termo: string): string {
  return termo.replace(/[%_\\]/g, "\\$&")
}

function aplicarFiltrosOrdens<T>(
  builder: T,
  { busca = "", situacao = "todas", tipo = "todos" }: FiltrosOrdens,
  empId: string
): T {
  let q = (builder as unknown as BuilderFiltros)
    .eq("emp_proprietaria_id", empId)
    .not("excluido", "is", true)

  if (situacao === "abertas") q = q.in("situacao", SITUACOES_ABERTAS)
  if (situacao === "pagas") q = q.eq("situacao", "Paga")
  if (situacao === "canceladas") q = q.eq("situacao", "Cancelada")
  if (tipo && tipo !== "todos") q = q.eq("tipo", tipo)

  const termo = busca.trim()
  if (termo) {
    const escapado = escaparLike(termo)
    q = q.or(`descricao.ilike.%${escapado}%,codigo.ilike.%${escapado}%`)
  }
  return q as unknown as T
}

/** Resolve nomes de favorecidos (empresa ou usuário) para as linhas da página. */
async function resolverFavorecidos(
  linhas: Omit<OrdemLinha, "favorecido">[]
): Promise<OrdemLinha[]> {
  const admin = await createAdminClient()

  const empresaIds = [
    ...new Set(
      linhas
        .flatMap((o) => [o.fornecedor_id, o.beneficiario_fornecedor_id])
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const usuarioIds = [
    ...new Set(
      linhas
        .map((o) => o.beneficiario_usuario_id)
        .filter((v): v is string => Boolean(v))
    ),
  ]

  const [empresas, usuarios] = await Promise.all([
    empresaIds.length
      ? admin
          .from("empresa")
          .select("id, empresa, nome_fantasia, nome_razao")
          .in("id", empresaIds)
      : Promise.resolve({ data: [] }),
    usuarioIds.length
      ? admin
          .from("usuarios")
          .select("id, nome_completo, nome_guerra")
          .in("id", usuarioIds)
      : Promise.resolve({ data: [] }),
  ])

  const nomes = new Map<string, string>()
  for (const e of empresas.data ?? []) {
    const nome = [e.empresa, e.nome_fantasia, e.nome_razao].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomes.set(e.id, nome)
  }
  for (const u of usuarios.data ?? []) {
    const nome = [u.nome_completo, u.nome_guerra].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomes.set(u.id, nome)
  }

  return linhas.map((o) => ({
    ...o,
    favorecido:
      (o.fornecedor_id && nomes.get(o.fornecedor_id)) ||
      (o.beneficiario_fornecedor_id &&
        nomes.get(o.beneficiario_fornecedor_id)) ||
      (o.beneficiario_usuario_id && nomes.get(o.beneficiario_usuario_id)) ||
      o.beneficiario_nome_avulso ||
      null,
  }))
}

export async function listarOrdens(
  filtros: FiltrosOrdens
): Promise<ListaOrdens> {
  const { pagina = 1, ordem = "vencimento", dir = "desc" } = filtros
  const admin = await createAdminClient()

  let q = admin
    .from("ordens_pagamento")
    .select(SELECT_ORDEM, { count: "exact" })
  q = aplicarFiltrosOrdens(q, filtros, await tenantAtual())

  const de = (pagina - 1) * ORDENS_POR_PAGINA
  const { data, count, error } = await q
    .order(COLUNAS_ORDEM[ordem] ?? "vencimento", {
      ascending: dir === "asc",
      nullsFirst: false,
    })
    .order("created_at", { ascending: false })
    .range(de, de + ORDENS_POR_PAGINA - 1)
  if (error) throw new Error(`Falha ao listar ordens: ${error.message}`)

  const total = count ?? 0
  return {
    linhas: await resolverFavorecidos(data ?? []),
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / ORDENS_POR_PAGINA)),
  }
}

export type ResumoFinanceiro = {
  abertas: { quantidade: number; valor: number }
  pagasNoMes: { quantidade: number; valor: number }
  totalOrdens: number
}

function somar(valores: (number | null)[]): number {
  return valores.reduce<number>((acc, v) => acc + (v ?? 0), 0)
}

export async function resumoFinanceiro(): Promise<ResumoFinanceiro> {
  const admin = await createAdminClient()
  const inicioMes = new Date().toISOString().slice(0, 8) + "01"

  const [abertas, pagasNoMes, totalOrdens] = await Promise.all([
    admin
      .from("ordens_pagamento")
      .select("valor_pago", { count: "exact" })
      .eq("emp_proprietaria_id", await tenantAtual())
      .not("excluido", "is", true)
      .in("situacao", SITUACOES_ABERTAS)
      .limit(2000),
    admin
      .from("ordens_pagamento")
      .select("valor, valor_pago", { count: "exact" })
      .eq("emp_proprietaria_id", await tenantAtual())
      .not("excluido", "is", true)
      .eq("situacao", "Paga")
      .gte("data_pagamento", inicioMes)
      .limit(2000),
    admin
      .from("ordens_pagamento")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", await tenantAtual())
      .not("excluido", "is", true),
  ])

  return {
    abertas: {
      quantidade: abertas.count ?? 0,
      valor: somar((abertas.data ?? []).map((o) => o.valor_pago)),
    },
    pagasNoMes: {
      quantidade: pagasNoMes.count ?? 0,
      valor: somar((pagasNoMes.data ?? []).map((o) => o.valor_pago ?? o.valor)),
    },
    totalOrdens: totalOrdens.count ?? 0,
  }
}

// ── Detalhe da ordem de pagamento ──────────────────────────────────────────

export type CentroCusto = {
  id: string
  nome_da_conta: string | null
  acesso: string | null
  classificador: string | null
  tipo_da_conta: string | null
  usavel: boolean | null
  indicacoes: string | null
  contraindicacoes: string | null
}

export type ContratoResumo = {
  id: string
  codigo: string | null
  objeto: string | null
  vigencia_inicio: string | null
  vigencia_termino: string | null
  ativo: boolean | null
  arquivo_contrato: string | null
}

export type DetalheOrdem = {
  ordem: Record<string, unknown> & {
    id: string
    codigo: string | null
    descricao: string | null
    tipo: string | null
    situacao: string | null
  }
  favorecido: string | null
  fornecedorNome: string | null
  pagador: string | null
  autorizador: string | null
  centroCustoDespesa: CentroCusto | null
  centroCustoReceita: CentroCusto | null
  /** Contratos do fornecedor/beneficiário da ordem (vínculo pela empresa). */
  contratos: ContratoResumo[]
}

export async function detalheOrdem(id: string): Promise<DetalheOrdem | null> {
  const admin = await createAdminClient()

  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!ordem) return null

  const fornecedorIds = [
    ordem.fornecedor_id,
    ordem.beneficiario_fornecedor_id,
  ].filter((v): v is string => Boolean(v))
  const usuarioIds = [
    ordem.beneficiario_usuario_id,
    ordem.pagador_id,
    ordem.autorizacao_autorizador_id,
  ].filter((v): v is string => Boolean(v))
  const centroIds = [
    ordem.centro_custo_despesa_id,
    ordem.centro_custo_receita_id,
  ].filter((v): v is string => Boolean(v))

  const [empresas, usuarios, centros, contratosRes] = await Promise.all([
    fornecedorIds.length
      ? admin
          .from("empresa")
          .select("id, nome_fantasia, nome_razao")
          .in("id", [...new Set(fornecedorIds)])
      : Promise.resolve({ data: [] }),
    usuarioIds.length
      ? admin
          .from("usuarios")
          .select("id, nome_completo, nome_guerra")
          .in("id", [...new Set(usuarioIds)])
      : Promise.resolve({ data: [] }),
    centroIds.length
      ? admin
          .from("centros_de_custo")
          .select(
            "id, nome_da_conta, acesso, classificador, tipo_da_conta, usavel, indicacoes, contraindicacoes"
          )
          .in("id", [...new Set(centroIds)])
      : Promise.resolve({ data: [] }),
    fornecedorIds.length
      ? admin
          .from("contratos")
          .select(
            "id, codigo, objeto, vigencia_inicio, vigencia_termino, ativo, arquivo_contrato"
          )
          .in("fornecedor_id", [...new Set(fornecedorIds)])
          .eq("emp_proprietaria_id", await tenantAtual())
          .not("deletado", "is", true)
          .order("vigencia_termino", { ascending: false, nullsFirst: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
  ])

  const nomesEmpresas = new Map<string, string>()
  for (const e of empresas.data ?? []) {
    const nome = [e.nome_fantasia, e.nome_razao].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomesEmpresas.set(e.id, nome)
  }
  const nomesUsuarios = new Map<string, string>()
  for (const u of usuarios.data ?? []) {
    const nome = [u.nome_completo, u.nome_guerra].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomesUsuarios.set(u.id, nome)
  }
  const centroPorId = new Map(
    ((centros.data ?? []) as CentroCusto[]).map((c) => [c.id, c])
  )

  return {
    ordem: ordem as DetalheOrdem["ordem"],
    favorecido:
      (ordem.fornecedor_id && nomesEmpresas.get(ordem.fornecedor_id)) ||
      (ordem.beneficiario_fornecedor_id &&
        nomesEmpresas.get(ordem.beneficiario_fornecedor_id)) ||
      (ordem.beneficiario_usuario_id &&
        nomesUsuarios.get(ordem.beneficiario_usuario_id)) ||
      (typeof ordem.beneficiario_nome_avulso === "string"
        ? ordem.beneficiario_nome_avulso
        : null) ||
      null,
    fornecedorNome:
      (ordem.fornecedor_id && nomesEmpresas.get(ordem.fornecedor_id)) ||
      (ordem.beneficiario_fornecedor_id &&
        nomesEmpresas.get(ordem.beneficiario_fornecedor_id)) ||
      null,
    pagador: ordem.pagador_id
      ? (nomesUsuarios.get(ordem.pagador_id) ?? null)
      : null,
    autorizador: ordem.autorizacao_autorizador_id
      ? (nomesUsuarios.get(ordem.autorizacao_autorizador_id) ?? null)
      : null,
    centroCustoDespesa: ordem.centro_custo_despesa_id
      ? (centroPorId.get(ordem.centro_custo_despesa_id) ?? null)
      : null,
    centroCustoReceita: ordem.centro_custo_receita_id
      ? (centroPorId.get(ordem.centro_custo_receita_id) ?? null)
      : null,
    contratos: (contratosRes.data ?? []) as ContratoResumo[],
  }
}

// ── Centros de custo ───────────────────────────────────────────────────────

export async function listarCentrosCusto(): Promise<CentroCusto[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("centros_de_custo")
    .select(
      "id, nome_da_conta, acesso, classificador, tipo_da_conta, usavel, indicacoes, contraindicacoes"
    )
    .order("classificador", { ascending: true, nullsFirst: false })
    .order("nome_da_conta", { ascending: true })
  if (error) {
    throw new Error(`Falha ao listar centros de custo: ${error.message}`)
  }
  return (data ?? []) as CentroCusto[]
}

export async function buscarCentroCusto(
  id: string
): Promise<CentroCusto | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("centros_de_custo")
    .select(
      "id, nome_da_conta, acesso, classificador, tipo_da_conta, usavel, indicacoes, contraindicacoes"
    )
    .eq("id", id)
    .maybeSingle()
  return (data as CentroCusto) ?? null
}

/** Ordens de pagamento lançadas no centro de custo (despesa ou receita). */
export async function ordensDoCentroCusto(
  id: string,
  pagina = 1
): Promise<ListaOrdens> {
  const admin = await createAdminClient()
  const de = (pagina - 1) * ORDENS_POR_PAGINA

  const { data, count, error } = await admin
    .from("ordens_pagamento")
    .select(SELECT_ORDEM, { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("excluido", "is", true)
    .or(`centro_custo_despesa_id.eq.${id},centro_custo_receita_id.eq.${id}`)
    .order("vencimento", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(de, de + ORDENS_POR_PAGINA - 1)
  if (error) {
    throw new Error(`Falha ao listar ordens do centro: ${error.message}`)
  }

  const total = count ?? 0
  return {
    linhas: await resolverFavorecidos(data ?? []),
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / ORDENS_POR_PAGINA)),
  }
}

/** Quantas ordens e contratos usam o centro (guarda de exclusão). */
export async function usoCentroCusto(
  id: string
): Promise<{ ordens: number; contratos: number }> {
  const admin = await createAdminClient()
  const [despesa, receita, contratos] = await Promise.all([
    admin
      .from("ordens_pagamento")
      .select("id", { count: "exact", head: true })
      .eq("centro_custo_despesa_id", id),
    admin
      .from("ordens_pagamento")
      .select("id", { count: "exact", head: true })
      .eq("centro_custo_receita_id", id),
    admin
      .from("contratos")
      .select("id", { count: "exact", head: true })
      .eq("centro_custo_id", id),
  ])
  return {
    ordens: (despesa.count ?? 0) + (receita.count ?? 0),
    contratos: contratos.count ?? 0,
  }
}

