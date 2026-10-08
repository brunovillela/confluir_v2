import "server-only"
import { formatarMoeda } from "@/lib/formato"
import {
  apontamentosPorOrdem,
  inserirOrdemVerificada,
  type ApontamentoDaOrdem,
} from "@/lib/db/ordens-verificacao"
import type { Apontamento } from "@/lib/auditoria-confirmacao"
import type { Confirmacao } from "@/lib/db/ordens-verificacao"
import { avisarQuemPode, depoisDaResposta } from "@/lib/db/avisos"
import { esquemaAusente, hojeSP, lerEmLotes, nomesDosUsuarios } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"
import { filtroDoEscopo, type EscopoCompras } from "@/lib/db/compras-acesso"

import { type SituacaoProcesso } from "@/lib/compras-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { avaliarOrdem } from "@/lib/db/ordens-ciclo"
import { PERMISSOES_USUARIO_FK } from "@/lib/permissoes"
import { resolverPermissoes } from "@/lib/permissoes-resolver"
import {
  debitarCaixaCompra,
  type DetalhePagamento,
} from "@/lib/db/compras-pagamento"

/**
 * Compras — processos de aquisição (espelha o fluxo do Bubble, confirmado
 * com o Bruno em 2026-07-18).
 *
 * `compras_solicitacoes` É o processo de aquisição, nas duas modalidades:
 * - Aquisição direta: o departamento compra e registra tudo de uma vez —
 *   o processo nasce "comprado" e já gera a ordem de pagamento.
 * - Via Aquisição: o departamento SOLICITA; o setor de compras cota
 *   (`compras_propostas`), escolhe 1+ propostas e efetiva. Cada proposta
 *   escolhida vira um desdobramento (`compras_fornecimentos`) com pagamento
 *   e recebimento próprios.
 *
 * Pagamento: ordem tipo 'Compras', situação 'Em autorização', com o MESMO
 * código do processo (padrão herdado do Bubble). A aprovação acontece na
 * área de avaliações, limitada pela `alcada_aprovacao` do avaliador; depois
 * segue o fluxo normal do financeiro (A pagar → Paga).
 *
 * Legado: a migração veio "oca" (produto/justificativa/fornecedor nulos em
 * 100% das 6.500 linhas) — sobreviveram codigo, projeto, flags, valor e
 * datas. O Bubble segue em produção até a virada de chave: processos
 * legados são tratados como SOMENTE LEITURA aqui.
 */

const AVISO_SQL =
  "Compras ainda não configuradas — rode supabase/compras.sql no Supabase."

// ── Situação derivada ──────────────────────────────────────────────────────

export { SITUACOES_PROCESSO, ROTULOS_SITUACAO_PROCESSO } from "@/lib/compras-constantes"
export type { SituacaoProcesso } from "@/lib/compras-constantes"

type FlagsProcesso = {
  cancelado?: unknown
  recebido?: unknown
  comprado?: unknown
  em_cotacao?: unknown
  cotacao_termino?: unknown
}

/** A situação não é coluna: deriva das flags legadas (compatível com as 6,5k linhas migradas). */
export function derivarSituacao(p: FlagsProcesso): SituacaoProcesso {
  if (p.cancelado === true) return "cancelada"
  if (p.recebido === true) return "recebida"
  if (p.comprado === true) return "comprada"
  if (p.em_cotacao === true) return "em_cotacao"
  if (p.cotacao_termino) return "cotada"
  return "solicitada"
}

// ── Tipos ──────────────────────────────────────────────────────────────────

export type ProcessoLinha = {
  id: string
  codigo: string | null
  produto: string | null
  departamentoNome: string | null
  projetoNome: string | null
  /** true = direta, false = via compras, null = legado (sem o dado). */
  aquisicao_direta: boolean | null
  compra_valor: number | null
  compra_data: string | null
  /** Fornecedor da compra (direta) ou dos fornecimentos (via Aquisição), separados por vírgula. */
  fornecedorNome: string | null
  situacao: SituacaoProcesso
  created_at: string | null
}

export type Proposta = {
  id: string
  fornecedor_id: string | null
  fornecedorNome: string | null
  fornecedorBloqueado: boolean
  valor_proposta: number | null
  forma_pagamento: string | null
  previsao_entrega: string | null
  proposta_arquivo_url: string | null
  escolhida: boolean
  escolhidaPorNome: string | null
}

export type Fornecimento = {
  id: string
  proposta_id: string | null
  fornecedor_id: string | null
  fornecedorNome: string | null
  valor: number | null
  forma_pagamento: string | null
  previsao_entrega: string | null
  comprador_id: string | null
  compradorNome: string | null
  data_compra: string | null
  nota_fiscal_url: string | null
  ordem_pagamento_id: string | null
  /** A primeira ordem (compatibilidade: recebimento, RPA). */
  ordem: OrdemDoProcesso | null
  /**
   * Todas as ordens que pagam o fornecimento (vários pagamentos — entrada,
   * parcelas, notas separadas). Sem a coluna ordens_pagamento.fornecimento_id
   * (SQL compras-pagamentos-multiplos), só a primeira.
   */
  pagamentos: OrdemDoProcesso[]
  recebido: boolean
  recebimento_data: string | null
  recebidoPorNome: string | null
  recebimento_de_acordo: boolean | null
  recebimento_observacao: string | null
}

export type OrdemDoProcesso = {
  id: string
  codigo: string | null
  descricao: string | null
  situacao: string | null
  forma_pagamento: string | null
  valor_inicial_cobranca: number | null
  valor_pago: number | null
  vencimento: string | null
  autorizado: boolean
  autorizadorNome: string | null
  autorizacao_data: string | null
  favorecidoNome: string | null
  /** Final do código Pix copia e cola (conferência na tela; o todo fica na ordem). */
  pixCodigoFinal?: string | null
  /** Caminho da nota fiscal da ordem (bucket compras). */
  notaFiscal?: string | null
}

export type ProcessoDetalhe = {
  id: string
  /** Quem registrou (null no legado e antes do SQL da restrição). */
  solicitante_id: string | null
  codigo: string | null
  situacao: SituacaoProcesso
  aquisicao_direta: boolean | null
  cancelado: boolean
  produto: string | null
  /** true = bem/produto, false = serviço, null = não informado. */
  e_produto: boolean | null
  observacao: string | null
  departamento_id: string | null
  departamentoNome: string | null
  centro_custo_id: string | null
  centroCustoNome: string | null
  projeto_id: string | null
  projetoNome: string | null
  data_limite: string | null
  local_entrega: string | null
  /** Entregue no ato da compra (supabase/compras-entrega-no-ato.sql). */
  entrega_no_ato: boolean
  em_cotacao: boolean
  cotacao_inicio: string | null
  cotacao_termino: string | null
  cotacaoResponsavelNome: string | null
  comprado: boolean
  compradoPorNome: string | null
  compra_data: string | null
  compra_valor: number | null
  recebido: boolean
  recebimento_data: string | null
  created_at: string | null
  /** Linha migrada do Bubble (campos descritivos vazios; somente leitura). */
  legado: boolean
  propostas: Proposta[]
  /** null = tabela ainda não existe (rodar supabase/compras.sql). */
  fornecimentos: Fornecimento[] | null
  /** Ordens do processo (mesmo código) que não estão em fornecimentos — legado. */
  ordensAvulsas: OrdemDoProcesso[]
}

// ── Auxiliares ─────────────────────────────────────────────────────────────

export async function empresasPorId(
  ids: string[]
): Promise<Map<string, { nome: string; bloqueado: boolean }>> {
  const mapa = new Map<string, { nome: string; bloqueado: boolean }>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa")
    .select("id, nome_fantasia, nome_razao, fornecedor_bloqueado, bloqueado")
    .in("id", unicos)
  for (const e of data ?? []) {
    const nome =
      [e.nome_fantasia, e.nome_razao].find(
        (v): v is string => typeof v === "string" && v.trim() !== ""
      ) ?? "(sem nome)"
    mapa.set(e.id, {
      nome,
      bloqueado: e.fornecedor_bloqueado === true || e.bloqueado === true,
    })
  }
  return mapa
}

/** Código no padrão legado (AAAA.MMDD.HHMM.SSNN, horário de SP) — compartilhado com as ordens. */
export function gerarCodigoProcesso(): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date())
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "00"
  const aleatorio = String(Math.floor(Math.random() * 100)).padStart(2, "0")
  return `${p("year")}.${p("month")}${p("day")}.${p("hour")}${p("minute")}.${p("second")}${aleatorio}`
}

export async function normalizarOrdens(
  brutas: Record<string, unknown>[]
): Promise<OrdemDoProcesso[]> {
  const empresaIds = brutas
    .flatMap((o) => [o.beneficiario_fornecedor_id, o.fornecedor_id])
    .filter((v): v is string => Boolean(v))
  const usuarioIds = brutas
    .flatMap((o) => [o.autorizacao_autorizador_id, o.beneficiario_usuario_id])
    .filter((v): v is string => Boolean(v))
  const [empresas, usuarios] = await Promise.all([
    empresasPorId(empresaIds),
    nomesDosUsuarios(usuarioIds),
  ])
  return brutas.map((o) => ({
    id: String(o.id),
    codigo: (o.codigo as string | null) ?? null,
    descricao: (o.descricao as string | null) ?? null,
    situacao: (o.situacao as string | null) ?? null,
    forma_pagamento: (o.forma_pagamento as string | null) ?? null,
    valor_inicial_cobranca: (o.valor_inicial_cobranca as number | null) ?? null,
    valor_pago: (o.valor_pago as number | null) ?? null,
    vencimento: (o.vencimento as string | null) ?? null,
    autorizado: o.autorizacao_esta_autorizado === true,
    autorizadorNome: o.autorizacao_autorizador_id
      ? (usuarios.get(String(o.autorizacao_autorizador_id)) ?? null)
      : null,
    autorizacao_data: (o.autorizacao_data as string | null) ?? null,
    pixCodigoFinal: typeof o.pix_codigo === "string" && o.pix_codigo ? o.pix_codigo.slice(-8) : null,
    notaFiscal: (o.arquivo_nota_fiscal as string | null) ?? null,
    favorecidoNome:
      (o.beneficiario_fornecedor_id
        ? empresas.get(String(o.beneficiario_fornecedor_id))?.nome
        : undefined) ??
      (o.fornecedor_id
        ? empresas.get(String(o.fornecedor_id))?.nome
        : undefined) ??
      (o.beneficiario_usuario_id
        ? usuarios.get(String(o.beneficiario_usuario_id))
        : undefined) ??
      null,
  }))
}

// ── Listagem e resumo ──────────────────────────────────────────────────────

export const PROCESSOS_POR_PAGINA = 10

export type FiltrosProcessos = {
  busca?: string
  situacao?: SituacaoProcesso | "todas"
  aquisicao?: "direta" | "via_compras" | "todas"
  pagina?: number
  /** Tamanho da página (padrão PROCESSOS_POR_PAGINA; a exportação usa 1.000). */
  porPagina?: number
  /** Departamentos que a pessoa alcança (lib/db/compras-acesso.ts). */
  escopo?: EscopoCompras
  /** Só as compras deste fornecedor (direta ou em algum fornecimento). */
  fornecedorId?: string
  /** Só as registradas por esta pessoa (solicitante_id). */
  criadoPor?: string
  ordem?: OrdemProcessos
  dir?: "asc" | "desc"
}

export const ORDENS_PROCESSOS = ["registro", "codigo", "produto", "valor", "compra"] as const
export type OrdemProcessos = (typeof ORDENS_PROCESSOS)[number]
const COLUNA_DA_ORDEM: Record<OrdemProcessos, string> = {
  registro: "created_at",
  codigo: "codigo",
  produto: "solicitacao_produto",
  valor: "compra_valor",
  compra: "compra_data",
}

export type ListaProcessos = {
  linhas: ProcessoLinha[]
  total: number
  pagina: number
  totalPaginas: number
}

export async function listarProcessos(
  filtros: FiltrosProcessos = {}
): Promise<ListaProcessos> {
  const admin = await createAdminClient()
  const pagina = Math.max(1, filtros.pagina ?? 1)

  let q = admin
    .from("compras_solicitacoes")
    .select("*", { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
  const escopo = filtros.escopo ? filtroDoEscopo(filtros.escopo) : null
  if (escopo) q = q.or(escopo)

  const busca = (filtros.busca ?? "").trim()
  if (busca) {
    // Vírgulas e parênteses quebram a sintaxe or() do PostgREST.
    const seguro = busca.replace(/[,()]/g, " ").trim()
    q = q.or(
      `codigo.ilike.%${seguro}%,solicitacao_produto.ilike.%${seguro}%`
    )
  }

  switch (filtros.situacao) {
    case "cancelada":
      q = q.eq("cancelado", true)
      break
    case "recebida":
      q = q.eq("cancelado", false).eq("recebido", true)
      break
    case "comprada":
      q = q.eq("cancelado", false).eq("recebido", false).eq("comprado", true)
      break
    case "em_cotacao":
      q = q.eq("cancelado", false).eq("comprado", false).eq("em_cotacao", true)
      break
    case "cotada":
      q = q
        .eq("cancelado", false)
        .eq("comprado", false)
        .eq("em_cotacao", false)
        .not("cotacao_termino", "is", null)
      break
    case "solicitada":
      q = q
        .eq("cancelado", false)
        .eq("comprado", false)
        .eq("em_cotacao", false)
        .is("cotacao_termino", null)
      break
  }

  if (filtros.aquisicao === "direta") q = q.eq("aquisicao_direta", true)
  if (filtros.aquisicao === "via_compras") q = q.eq("aquisicao_direta", false)
  if (filtros.criadoPor) q = q.eq("solicitante_id", filtros.criadoPor)
  if (filtros.fornecedorId && /^[0-9a-f-]{36}$/i.test(filtros.fornecedorId)) {
    // Via Aquisição o fornecedor está nos fornecimentos; direta, no processo.
    const { data: fs } = await admin
      .from("compras_fornecimentos")
      .select("processo_id")
      .eq("fornecedor_id", filtros.fornecedorId)
      .limit(1000)
    const doFornecimento = [...new Set((fs ?? []).map((f) => String(f.processo_id)))]
    q = q.or(
      [`compra_fornecedor_id.eq.${filtros.fornecedorId}`, doFornecimento.length ? `id.in.(${doFornecimento.join(",")})` : null]
        .filter(Boolean)
        .join(",")
    )
  }

  const porPagina = Math.min(1000, Math.max(1, filtros.porPagina ?? PROCESSOS_POR_PAGINA))
  const de = (pagina - 1) * porPagina
  const coluna = COLUNA_DA_ORDEM[filtros.ordem ?? "registro"] ?? "created_at"
  const ascendente = filtros.dir === "asc"
  const { data, error, count } = await q
    .order(coluna, { ascending: ascendente, nullsFirst: false })
    .order("codigo", { ascending: ascendente })
    .range(de, de + porPagina - 1)
  if (error) {
    // Filtro por coluna nova sem o SQL rodado: degrada para lista vazia.
    if (esquemaAusente(error)) {
      return { linhas: [], total: 0, pagina: 1, totalPaginas: 1 }
    }
    throw new Error(`Falha ao listar processos: ${error.message}`)
  }

  const linhas = (data ?? []) as Record<string, unknown>[]
  const deptoIds = linhas
    .map((p) => p.solicitacao_departamento_id)
    .filter((v): v is string => Boolean(v))
  const projetoIds = linhas
    .map((p) => p.solicitacao_projeto_id)
    .filter((v): v is string => Boolean(v))

  // Fornecedor: o da compra direta e os dos fornecimentos (via Aquisição).
  const { data: fornecimentosDaPagina } = linhas.length
    ? await admin
        .from("compras_fornecimentos")
        .select("processo_id, fornecedor_id")
        .in("processo_id", linhas.map((p) => String(p.id)))
    : { data: [] }
  const fornecedoresPorProcesso = new Map<string, string[]>()
  for (const f of fornecimentosDaPagina ?? []) {
    if (!f.fornecedor_id) continue
    const lista = fornecedoresPorProcesso.get(String(f.processo_id)) ?? []
    lista.push(String(f.fornecedor_id))
    fornecedoresPorProcesso.set(String(f.processo_id), lista)
  }
  const fornecedoresDaLinha = (p: Record<string, unknown>): string[] => {
    const ids = fornecedoresPorProcesso.get(String(p.id)) ?? []
    return [...new Set(ids.length ? ids : p.compra_fornecedor_id ? [String(p.compra_fornecedor_id)] : [])]
  }
  const nomesFornecedores = await empresasPorId(linhas.flatMap(fornecedoresDaLinha))

  const [departamentos, projetos] = await Promise.all([
    deptoIds.length
      ? admin
          .from("empresa_departamentos")
          .select("id, departamento")
          .in("id", [...new Set(deptoIds)])
      : Promise.resolve({ data: [] }),
    projetoIds.length
      ? admin
          .from("projeto")
          .select("id, descricao_sumaria")
          .in("id", [...new Set(projetoIds)])
      : Promise.resolve({ data: [] }),
  ])
  const nomeDepto = new Map(
    (departamentos.data ?? []).map((d: Record<string, unknown>) => [
      String(d.id),
      String(d.departamento ?? "(sem nome)"),
    ])
  )
  const nomeProjeto = new Map(
    (projetos.data ?? []).map((p: Record<string, unknown>) => [
      String(p.id),
      String(p.descricao_sumaria ?? "(sem nome)"),
    ])
  )

  const total = count ?? 0
  return {
    linhas: linhas.map((p) => ({
      id: String(p.id),
      codigo: (p.codigo as string | null) ?? null,
      produto: (p.solicitacao_produto as string | null) ?? null,
      departamentoNome: p.solicitacao_departamento_id
        ? (nomeDepto.get(String(p.solicitacao_departamento_id)) ?? null)
        : null,
      projetoNome: p.solicitacao_projeto_id
        ? (nomeProjeto.get(String(p.solicitacao_projeto_id)) ?? null)
        : null,
      aquisicao_direta: (p.aquisicao_direta as boolean | null) ?? null,
      compra_valor: (p.compra_valor as number | null) ?? null,
      compra_data: (p.compra_data as string | null) ?? null,
      fornecedorNome:
        fornecedoresDaLinha(p)
          .map((id) => nomesFornecedores.get(id)?.nome)
          .filter(Boolean)
          .join(", ") || null,
      situacao: derivarSituacao(p),
      created_at: (p.created_at as string | null) ?? null,
    })),
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
  }
}

export type ResumoCompras = {
  emCotacao: number
  aguardandoCompra: number
  ordensEmAutorizacao: number
  /** null = tabela de fornecimentos ausente (rodar supabase/compras.sql). */
  aReceber: number | null
}

export async function resumoCompras(escopo?: EscopoCompras): Promise<ResumoCompras> {
  const admin = await createAdminClient()
  const filtro = escopo ? filtroDoEscopo(escopo) : null
  let cotacao = admin
    .from("compras_solicitacoes")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cancelado", false)
    .eq("comprado", false)
    .eq("em_cotacao", true)
  let aguardando = admin
    .from("compras_solicitacoes")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cancelado", false)
    .eq("comprado", false)
    .eq("em_cotacao", false)
    .not("cotacao_termino", "is", null)
  if (filtro) {
    cotacao = cotacao.or(filtro)
    aguardando = aguardando.or(filtro)
  }
  const ordensBase = admin
    .from("ordens_pagamento")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("tipo", "Compras")
    .eq("situacao", "Em autorização")
    .eq("excluido", false)
  const [emCotacao, aguardandoCompra, ordens, fornecimentos] =
    await Promise.all([
      cotacao,
      aguardando,
      escopo && !escopo.todos
        ? ordensBase.in("departamento_id", escopo.departamentoIds)
        : ordensBase,
      admin
        .from("compras_fornecimentos")
        .select("id", { count: "exact", head: true })
        .eq("emp_proprietaria_id", await tenantAtual())
        .eq("recebido", false),
    ])

  return {
    emCotacao: emCotacao.count ?? 0,
    aguardandoCompra: aguardandoCompra.count ?? 0,
    ordensEmAutorizacao: ordens.count ?? 0,
    // Head-count em tabela ausente volta sem `error` e com count null —
    // count null também significa "rode supabase/compras.sql".
    aReceber:
      fornecimentos.error || fornecimentos.count === null
        ? null
        : fornecimentos.count,
  }
}

// ── Detalhe do processo ────────────────────────────────────────────────────

export async function buscarProcesso(
  id: string
): Promise<ProcessoDetalhe | null> {
  const admin = await createAdminClient()
  const { data: p, error } = await admin
    .from("compras_solicitacoes")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar o processo: ${error.message}`)
  if (!p) return null

  const [propostasRes, fornecimentosRes, ordensRes] = await Promise.all([
    admin
      .from("compras_propostas")
      .select("*")
      .eq("processo_compra_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("compras_fornecimentos")
      .select("*")
      .eq("processo_id", id)
      .order("created_at", { ascending: true }),
    // Vínculo só pela coluna nova (o legado veio sem ligação ordem→processo);
    // sem o SQL rodado a coluna não existe e a lista degrada para vazia.
    // select("*"): fornecimento_id (vários pagamentos) pode ainda não existir.
    admin
      .from("ordens_pagamento")
      .select("*")
      .eq("emp_proprietaria_id", await tenantAtual())
      .eq("processo_compra_id", id)
      .eq("excluido", false)
      .order("created_at", { ascending: true }),
  ])

  if (ordensRes.error && !esquemaAusente(ordensRes.error)) {
    throw new Error(`Falha ao buscar ordens: ${ordensRes.error.message}`)
  }
  const propostasBrutas = (propostasRes.data ??
    []) as Record<string, unknown>[]
  const fornecimentosBrutos = fornecimentosRes.error
    ? null
    : ((fornecimentosRes.data ?? []) as Record<string, unknown>[])
  if (fornecimentosRes.error && !esquemaAusente(fornecimentosRes.error)) {
    throw new Error(
      `Falha ao buscar fornecimentos: ${fornecimentosRes.error.message}`
    )
  }

  const empresaIds = [
    ...propostasBrutas.map((x) => x.fornecedor_id),
    ...(fornecimentosBrutos ?? []).map((x) => x.fornecedor_id),
  ].filter((v): v is string => Boolean(v))
  const usuarioIds = [
    p.cotacao_responsavel_id,
    p.comprado_por_id,
    ...propostasBrutas.map((x) => x.escolhida_por_id),
    ...(fornecimentosBrutos ?? []).flatMap((x) => [
      x.comprador_id,
      x.recebimento_recebido_por_id,
    ]),
  ].filter((v): v is string => Boolean(v))

  const [empresas, usuarios, ordens, depto, centro, projeto] =
    await Promise.all([
      empresasPorId(empresaIds),
      nomesDosUsuarios(usuarioIds.map(String)),
      normalizarOrdens((ordensRes.data ?? []) as Record<string, unknown>[]),
      p.solicitacao_departamento_id
        ? admin
            .from("empresa_departamentos")
            .select("id, departamento")
            .eq("id", p.solicitacao_departamento_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      p.solicitacao_centro_custo_id
        ? admin
            .from("centros_de_custo")
            .select("id, nome_da_conta, classificador")
            .eq("id", p.solicitacao_centro_custo_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      p.solicitacao_projeto_id
        ? admin
            .from("projeto")
            .select("id, descricao_sumaria")
            .eq("id", p.solicitacao_projeto_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

  const propostas: Proposta[] = propostasBrutas.map((x) => ({
    id: String(x.id),
    fornecedor_id: (x.fornecedor_id as string | null) ?? null,
    fornecedorNome: x.fornecedor_id
      ? (empresas.get(String(x.fornecedor_id))?.nome ?? null)
      : null,
    fornecedorBloqueado: x.fornecedor_id
      ? (empresas.get(String(x.fornecedor_id))?.bloqueado ?? false)
      : false,
    valor_proposta: (x.valor_proposta as number | null) ?? null,
    forma_pagamento: (x.forma_pagamento as string | null) ?? null,
    previsao_entrega: (x.previsao_entrega as string | null) ?? null,
    proposta_arquivo_url: (x.proposta_arquivo_url as string | null) ?? null,
    escolhida: x.escolhida === true,
    escolhidaPorNome: x.escolhida_por_id
      ? (usuarios.get(String(x.escolhida_por_id)) ?? null)
      : null,
  }))

  const ordemPorId = new Map(ordens.map((o) => [o.id, o]))
  // Ordens de cada fornecimento (coluna nova; o legado fica só na primeira).
  const pagamentosPor = new Map<string, OrdemDoProcesso[]>()
  for (const bruta of (ordensRes.data ?? []) as Record<string, unknown>[]) {
    const fid = bruta.fornecimento_id as string | null | undefined
    const o = ordemPorId.get(String(bruta.id))
    if (!fid || !o) continue
    pagamentosPor.set(fid, [...(pagamentosPor.get(fid) ?? []), o])
  }
  const fornecimentos: Fornecimento[] | null =
    fornecimentosBrutos === null
      ? null
      : fornecimentosBrutos.map((x) => ({
          id: String(x.id),
          proposta_id: (x.proposta_id as string | null) ?? null,
          fornecedor_id: (x.fornecedor_id as string | null) ?? null,
          fornecedorNome: x.fornecedor_id
            ? (empresas.get(String(x.fornecedor_id))?.nome ?? null)
            : null,
          valor: (x.valor as number | null) ?? null,
          forma_pagamento: (x.forma_pagamento as string | null) ?? null,
          previsao_entrega: (x.previsao_entrega as string | null) ?? null,
          comprador_id: (x.comprador_id as string | null) ?? null,
          compradorNome: x.comprador_id
            ? (usuarios.get(String(x.comprador_id)) ?? null)
            : null,
          data_compra: (x.data_compra as string | null) ?? null,
          nota_fiscal_url: (x.nota_fiscal_url as string | null) ?? null,
          ordem_pagamento_id: (x.ordem_pagamento_id as string | null) ?? null,
          ordem: x.ordem_pagamento_id
            ? (ordemPorId.get(String(x.ordem_pagamento_id)) ?? null)
            : null,
          // As ordens com fornecimento_id + a principal (que pode não ter).
          pagamentos: (() => {
            const lista = [...(pagamentosPor.get(String(x.id)) ?? [])]
            const principal = x.ordem_pagamento_id ? ordemPorId.get(String(x.ordem_pagamento_id)) : undefined
            if (principal && !lista.some((o) => o.id === principal.id)) lista.unshift(principal)
            return lista
          })(),
          recebido: x.recebido === true,
          recebimento_data: (x.recebimento_data as string | null) ?? null,
          recebidoPorNome: x.recebimento_recebido_por_id
            ? (usuarios.get(String(x.recebimento_recebido_por_id)) ?? null)
            : null,
          recebimento_de_acordo:
            (x.recebimento_de_acordo as boolean | null) ?? null,
          recebimento_observacao:
            (x.recebimento_observacao as string | null) ?? null,
        }))

  const ordensVinculadas = new Set(
    (fornecimentos ?? []).flatMap((f) => [f.ordem_pagamento_id, ...f.pagamentos.map((o) => o.id)]).filter((v): v is string => Boolean(v))
  )

  return {
    id: String(p.id),
    codigo: (p.codigo as string | null) ?? null,
    situacao: derivarSituacao(p),
    aquisicao_direta: (p.aquisicao_direta as boolean | null) ?? null,
    cancelado: p.cancelado === true,
    produto: (p.solicitacao_produto as string | null) ?? null,
    e_produto: (p.solicitacao_e_produto as boolean | null) ?? null,
    observacao: (p.solicitacao_observacao as string | null) ?? null,
    departamento_id: (p.solicitacao_departamento_id as string | null) ?? null,
    solicitante_id: (p.solicitante_id as string | null) ?? null,
    departamentoNome:
      (depto.data?.departamento as string | undefined) ?? null,
    centro_custo_id: (p.solicitacao_centro_custo_id as string | null) ?? null,
    centroCustoNome: centro.data
      ? [centro.data.classificador, centro.data.nome_da_conta]
          .filter(Boolean)
          .join(" - ") || null
      : null,
    projeto_id: (p.solicitacao_projeto_id as string | null) ?? null,
    projetoNome: (projeto.data?.descricao_sumaria as string | undefined) ?? null,
    data_limite: (p.solicitacao_data_limite as string | null) ?? null,
    local_entrega: (p.solicitacao_local as string | null) ?? null,
    entrega_no_ato: p.solicitacao_entrega_no_ato === true,
    em_cotacao: p.em_cotacao === true,
    cotacao_inicio: (p.cotacao_inicio as string | null) ?? null,
    cotacao_termino: (p.cotacao_termino as string | null) ?? null,
    cotacaoResponsavelNome: p.cotacao_responsavel_id
      ? (usuarios.get(String(p.cotacao_responsavel_id)) ?? null)
      : null,
    comprado: p.comprado === true,
    compradoPorNome: p.comprado_por_id
      ? (usuarios.get(String(p.comprado_por_id)) ?? null)
      : null,
    compra_data: (p.compra_data as string | null) ?? null,
    compra_valor: (p.compra_valor as number | null) ?? null,
    recebido: p.recebido === true,
    recebimento_data: (p.recebimento_data as string | null) ?? null,
    created_at: (p.created_at as string | null) ?? null,
    legado: Boolean(p.bubble_id),
    propostas,
    fornecimentos,
    ordensAvulsas: ordens.filter((o) => !ordensVinculadas.has(o.id)),
  }
}

// ── Criação ────────────────────────────────────────────────────────────────

export type NovaSolicitacao = {
  produto: string
  e_produto: boolean | null
  observacao: string | null
  departamento_id: string
  centro_custo_id: string | null
  projeto_id: string | null
  data_limite: string | null
  local_entrega: string | null
  /**
   * Entregue no ato da compra (sem limite/local para receber). Coluna de
   * supabase/compras-entrega-no-ato.sql — só vai no insert quando true, para
   * quem não usa a marcação (fatura de viagens) não depender do SQL.
   */
  entrega_no_ato?: boolean
  /** Quem registrou (coluna de supabase/compras-restricao-departamento.sql). */
  solicitante_id?: string | null
}

/**
 * Insere em compras_solicitacoes; sem o SQL da restrição por departamento a
 * coluna solicitante_id não existe — repete sem ela em vez de falhar.
 */
async function inserirSolicitacao(linha: Record<string, unknown>) {
  const admin = await createAdminClient()
  const tentativa = await admin.from("compras_solicitacoes").insert(linha).select("id").single()
  if (tentativa.error && esquemaAusente(tentativa.error) && "solicitante_id" in linha) {
    const { solicitante_id: _s, ...semSolicitante } = linha
    void _s
    return admin.from("compras_solicitacoes").insert(semSolicitante).select("id").single()
  }
  return tentativa
}

/** Via Aquisição: registra a solicitação do departamento; o setor de compras assume dali. */
export async function criarSolicitacao(
  nova: NovaSolicitacao
): Promise<{ id?: string; erro?: string }> {
  const { data, error } = await inserirSolicitacao({
      codigo: gerarCodigoProcesso(),
      aquisicao_direta: false,
      solicitante_id: nova.solicitante_id ?? null,
      solicitacao_produto: nova.produto,
      solicitacao_e_produto: nova.e_produto,
      solicitacao_observacao: nova.observacao,
      solicitacao_departamento_id: nova.departamento_id,
      solicitacao_centro_custo_id: nova.centro_custo_id,
      solicitacao_projeto_id: nova.projeto_id,
      solicitacao_data_limite: nova.data_limite,
      solicitacao_local: nova.local_entrega,
      ...(nova.entrega_no_ato ? { solicitacao_entrega_no_ato: true } : {}),
      cancelado: false,
      em_cotacao: false,
      comprado: false,
      recebido: false,
      estocavel: false,
      emp_proprietaria_id: await tenantAtual(),
  })
  if (error || !data) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível registrar a solicitação: ${error?.message}` }
  }
  return { id: String(data.id) }
}

export type NovaCompraDireta = NovaSolicitacao & {
  fornecedor_id: string
  valor: number
  forma_pagamento: string | null
  data_compra: string
  vencimento: string | null
  comprador_id: string
  nota_fiscal_url: string | null
  ja_recebido: boolean
  recebedor_id: string
  /** Com o quê foi paga (cartão, caixa, chave/conta, código Pix, texto). */
  detalhe?: DetalhePagamento
  /**
   * Serviço de autônomo pago por RPA: o RPA é o documento fiscal. A ordem
   * nasce com a forma e o "para onde" da compra, "Aguardando documento
   * fiscal"; o recibo emitido se liga a ela (valor = líquido) e, assinado
   * pelo prestador, a leva para autorização.
   */
  por_rpa?: boolean
  /** Tela de confirmação da auditoria: os alertas já confirmados. */
  confirmacao?: Confirmacao
}

/**
 * Aquisição direta: processo nasce comprado, com o fornecimento e a ordem de
 * pagamento ('Em autorização' — aprovação por alçada antes do pagamento).
 */
export async function criarCompraDireta(
  nova: NovaCompraDireta
): Promise<{
  id?: string
  ordemId?: string
  fornecimentoId?: string
  erro?: string
  apontamentos?: Apontamento[]
}> {
  const admin = await createAdminClient()
  const codigo = gerarCodigoProcesso()

  const { data: processo, error: erroProcesso } = await inserirSolicitacao({
      codigo,
      aquisicao_direta: true,
      solicitante_id: nova.solicitante_id ?? nova.comprador_id,
      solicitacao_produto: nova.produto,
      solicitacao_e_produto: nova.e_produto,
      solicitacao_observacao: nova.observacao,
      solicitacao_departamento_id: nova.departamento_id,
      solicitacao_centro_custo_id: nova.centro_custo_id,
      solicitacao_projeto_id: nova.projeto_id,
      solicitacao_data_limite: nova.data_limite,
      solicitacao_local: nova.local_entrega,
      ...(nova.entrega_no_ato ? { solicitacao_entrega_no_ato: true } : {}),
      cancelado: false,
      em_cotacao: false,
      comprado: true,
      comprado_por_id: nova.comprador_id,
      compra_data: nova.data_compra,
      compra_valor: nova.valor,
      compra_fornecedor_id: nova.fornecedor_id,
      comprovante_url: nova.nota_fiscal_url,
      recebido: nova.ja_recebido,
      recebimento_data: nova.ja_recebido ? nova.data_compra : null,
      recebimento_recebido_por_id: nova.ja_recebido ? nova.recebedor_id : null,
      estocavel: false,
      emp_proprietaria_id: await tenantAtual(),
  })
  if (erroProcesso || !processo) {
    if (esquemaAusente(erroProcesso)) return { erro: AVISO_SQL }
    return {
      erro: `Não foi possível registrar a compra: ${erroProcesso?.message}`,
    }
  }

  // Como no legado, a ordem tem código próprio; o vínculo com o processo é
  // a coluna processo_compra_id. Paga por RPA, espera o recibo assinado.
  const { data: ordem, error: erroOrdem } = await inserirOrdemVerificada({
      codigo: gerarCodigoProcesso(),
      tipo: "Compras",
      descricao: nova.por_rpa
        ? `Compra direta — ${nova.produto} (prestador autônomo: o RPA assinado é o documento fiscal)`
        : `Compra direta — ${nova.produto}`,
      situacao: nova.por_rpa ? "Aguardando documento fiscal" : "Em autorização",
      valor_inicial_cobranca: nova.valor,
      forma_pagamento: nova.forma_pagamento,
      vencimento: nova.vencimento,
      beneficiario_fornecedor_id: nova.fornecedor_id,
      departamento_id: nova.departamento_id,
      centro_custo_despesa_id: nova.centro_custo_id,
      arquivo_nota_fiscal: nova.nota_fiscal_url,
      processo_compra_id: processo.id,
      // Colunas de supabase/compras-pagamento.sql: só quando há detalhe, para
      // quem não o informa (fatura de viagens) seguir sem depender do SQL.
      ...(nova.detalhe ?? {}),
      excluido: false,
      emp_proprietaria_id: await tenantAtual(),
    }, nova.confirmacao ? { confirmacao: nova.confirmacao } : {})
  if (erroOrdem || !ordem) {
    await admin.from("compras_solicitacoes").delete().eq("id", processo.id)
    // Apontamentos da auditoria: nada fica gravado; a tela pergunta.
    if (erroOrdem?.apontamentos) return { apontamentos: erroOrdem.apontamentos }
    return {
      erro: `Não foi possível gerar a ordem de pagamento: ${erroOrdem?.message}`,
    }
  }
  const apagarOrdem = async () => {
    if (ordem) await admin.from("ordens_pagamento").delete().eq("id", ordem.id)
  }

  const { data: fornecimento, error: erroFornecimento } = await admin
    .from("compras_fornecimentos")
    .insert({
      processo_id: processo.id,
      fornecedor_id: nova.fornecedor_id,
      valor: nova.valor,
      forma_pagamento: nova.forma_pagamento,
      comprador_id: nova.comprador_id,
      data_compra: nova.data_compra,
      nota_fiscal_url: nova.nota_fiscal_url,
      ordem_pagamento_id: ordem?.id ?? null,
      recebido: nova.ja_recebido,
      recebimento_data: nova.ja_recebido ? nova.data_compra : null,
      recebimento_recebido_por_id: nova.ja_recebido ? nova.recebedor_id : null,
      recebimento_de_acordo: nova.ja_recebido ? true : null,
      recebimento_observacao: nova.ja_recebido
        ? "Item avaliado no ato da compra."
        : null,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (erroFornecimento || !fornecimento) {
    await apagarOrdem()
    await admin.from("compras_solicitacoes").delete().eq("id", processo.id)
    if (esquemaAusente(erroFornecimento)) return { erro: AVISO_SQL }
    return {
      erro: `Não foi possível registrar o fornecimento: ${erroFornecimento?.message}`,
    }
  }
  // A ordem aponta para o fornecimento que paga (vários pagamentos; sem a
  // coluna do SQL compras-pagamentos-multiplos, o erro é ignorado).
  if (ordem) await admin.from("ordens_pagamento").update({ fornecimento_id: fornecimento.id }).eq("id", ordem.id)
  // Onda 2 (U2): o que ainda vai chegar entra na fila de quem recebe.
  if (!nova.ja_recebido) avisarRecebimento(`Compra direta ${codigo} — ${nova.produto}`)
  if (!ordem) return { id: processo.id, fornecimentoId: String(fornecimento.id) }

  // Em dinheiro: a compra sai do caixa escolhido. Paga por RPA, o caixa
  // é debitado no pagamento da ordem (o valor ainda vira o líquido do recibo).
  if (nova.detalhe?.caixa_conta_id && !nova.por_rpa) {
    const { erro } = await debitarCaixaCompra({
      contaId: nova.detalhe.caixa_conta_id,
      valor: nova.valor,
      descricao: `Compra direta ${codigo} — ${nova.produto}`.slice(0, 500),
      usuarioId: nova.comprador_id,
      ordemId: String(ordem.id),
    })
    if (erro) {
      await admin.from("compras_fornecimentos").delete().eq("processo_id", processo.id)
      await admin.from("ordens_pagamento").delete().eq("id", ordem.id)
      await admin.from("compras_solicitacoes").delete().eq("id", processo.id)
      return { erro }
    }
  }
  return { id: processo.id, ordemId: String(ordem.id), fornecimentoId: String(fornecimento.id) }
}

/** Cancela um processo ainda não comprado. */
export async function cancelarProcesso(
  id: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_solicitacoes")
    .update({
      cancelado: true,
      cancelado_quando: new Date().toISOString(),
      cancelado_por_id: usuarioId,
      em_cotacao: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("cancelado", false)
    .eq("comprado", false)
    .select("id")
  if (error) return { erro: `Não foi possível cancelar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "Processo não encontrado, já comprado ou já cancelado." }
  }
  return {}
}

// ── Cotação ────────────────────────────────────────────────────────────────

export async function iniciarCotacao(
  processoId: string,
  responsavelId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_solicitacoes")
    .update({
      em_cotacao: true,
      // cotacao_inicio/termino são colunas DATE no legado.
      cotacao_inicio: hojeSP(),
      cotacao_termino: null,
      cotacao_responsavel_id: responsavelId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", processoId)
    .eq("cancelado", false)
    .eq("comprado", false)
    .select("id")
  if (error) return { erro: `Não foi possível iniciar a cotação: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "Processo não encontrado, já comprado ou cancelado." }
  }
  return {}
}

/** Encerra a cotação (exige ao menos uma proposta escolhida). */
export async function encerrarCotacao(
  processoId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { count } = await admin
    .from("compras_propostas")
    .select("id", { count: "exact", head: true })
    .eq("processo_compra_id", processoId)
    .eq("escolhida", true)
  if (!count) {
    return { erro: "Escolha ao menos uma proposta antes de encerrar a cotação." }
  }
  const { data, error } = await admin
    .from("compras_solicitacoes")
    .update({
      em_cotacao: false,
      cotacao_termino: hojeSP(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", processoId)
    .eq("em_cotacao", true)
    .select("id")
  if (error) return { erro: `Não foi possível encerrar: ${error.message}` }
  if ((data ?? []).length === 0) return { erro: "A cotação não está aberta." }
  return {}
}

/** Reabre a cotação de um processo ainda não comprado. */
export async function reabrirCotacao(
  processoId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_solicitacoes")
    .update({
      em_cotacao: true,
      cotacao_termino: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", processoId)
    .eq("cancelado", false)
    .eq("comprado", false)
    .select("id")
  if (error) return { erro: `Não foi possível reabrir: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "Processo não encontrado, já comprado ou cancelado." }
  }
  return {}
}

export type NovaProposta = {
  processo_id: string
  fornecedor_id: string
  valor: number
  forma_pagamento: string | null
  previsao_entrega: string | null
  arquivo_url: string | null
}

export async function adicionarProposta(
  nova: NovaProposta
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("compras_propostas").insert({
    processo_compra_id: nova.processo_id,
    fornecedor_id: nova.fornecedor_id,
    valor_proposta: nova.valor,
    forma_pagamento: nova.forma_pagamento,
    previsao_entrega: nova.previsao_entrega,
    proposta_arquivo_url: nova.arquivo_url,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível registrar a proposta: ${error.message}` }
  }
  return {}
}

export async function removerProposta(
  propostaId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("compras_propostas")
    .delete()
    .eq("id", propostaId)
    .eq("escolhida", false)
  if (error) return { erro: `Não foi possível remover: ${error.message}` }
  return {}
}

export async function definirEscolhaProposta(
  propostaId: string,
  escolhida: boolean,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_propostas")
    .update({
      escolhida,
      escolhida_em: escolhida ? new Date().toISOString() : null,
      escolhida_por_id: escolhida ? usuarioId : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", propostaId)
    .select("id")
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível salvar a escolha: ${error.message}` }
  }
  if ((data ?? []).length === 0) return { erro: "Proposta não encontrada." }
  return {}
}

// ── Compra e cobrança ──────────────────────────────────────────────────────

/**
 * Efetiva a compra das propostas ESCOLHIDAS: cria um fornecimento por
 * proposta e marca o processo como comprado (valor = soma dos fornecimentos).
 * As ordens de pagamento são geradas por fornecimento, na sequência.
 */
export async function registrarCompra(
  processoId: string,
  compradorId: string,
  dataCompra: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: processo } = await admin
    .from("compras_solicitacoes")
    .select("id, comprado, cancelado")
    .eq("id", processoId)
    .maybeSingle()
  if (!processo) return { erro: "Processo não encontrado." }
  if (processo.cancelado === true) return { erro: "Processo cancelado." }
  if (processo.comprado === true) return { erro: "Compra já registrada." }

  const { data: escolhidas, error: erroPropostas } = await admin
    .from("compras_propostas")
    .select("id, fornecedor_id, valor_proposta, forma_pagamento, previsao_entrega")
    .eq("processo_compra_id", processoId)
    .eq("escolhida", true)
  if (erroPropostas) {
    if (esquemaAusente(erroPropostas)) return { erro: AVISO_SQL }
    return { erro: `Falha ao buscar propostas: ${erroPropostas.message}` }
  }
  if ((escolhidas ?? []).length === 0) {
    return { erro: "Nenhuma proposta escolhida — escolha antes de comprar." }
  }
  const semFornecedor = (escolhidas ?? []).find((x) => !x.fornecedor_id)
  if (semFornecedor) {
    return { erro: "Há proposta escolhida sem fornecedor definido." }
  }
  const semValor = (escolhidas ?? []).find(
    (x) => typeof x.valor_proposta !== "number" || x.valor_proposta < 0
  )
  if (semValor) return { erro: "Há proposta escolhida sem valor definido." }

  const empId = await tenantAtual()
  const { error: erroFornecimentos } = await admin
    .from("compras_fornecimentos")
    .insert(
      (escolhidas ?? []).map((x) => ({
        processo_id: processoId,
        proposta_id: x.id,
        fornecedor_id: x.fornecedor_id,
        valor: x.valor_proposta,
        forma_pagamento: x.forma_pagamento,
        previsao_entrega: x.previsao_entrega,
        comprador_id: compradorId,
        data_compra: dataCompra,
        emp_proprietaria_id: empId,
      }))
    )
  if (erroFornecimentos) {
    if (esquemaAusente(erroFornecimentos)) return { erro: AVISO_SQL }
    return {
      erro: `Não foi possível criar os fornecimentos: ${erroFornecimentos.message}`,
    }
  }

  const valorTotal = (escolhidas ?? []).reduce(
    (soma, x) => soma + (x.valor_proposta ?? 0),
    0
  )
  const { error: erroProcesso } = await admin
    .from("compras_solicitacoes")
    .update({
      comprado: true,
      comprado_por_id: compradorId,
      compra_data: dataCompra,
      compra_valor: Math.round(valorTotal * 100) / 100,
      em_cotacao: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", processoId)
  if (erroProcesso) {
    return { erro: `Fornecimentos criados, mas falhou a atualização do processo: ${erroProcesso.message}` }
  }
  // Onda 2 (U2): os fornecimentos comprados entram na fila de quem recebe.
  {
    const { data: proc } = await admin
      .from("compras_solicitacoes")
      .select("codigo, solicitacao_produto")
      .eq("id", processoId)
      .maybeSingle()
    const n = (escolhidas ?? []).length
    avisarRecebimento(
      `Compra ${proc?.codigo ?? ""} — ${proc?.solicitacao_produto ?? "(sem descrição)"}: ${n} fornecimento${n === 1 ? "" : "s"} a receber`
    )
  }
  return {}
}

/** Quem recebe fornecimentos fica sabendo que há entrega a conferir (onda 2, U2). */
function avisarRecebimento(textoAviso: string): void {
  depoisDaResposta(() =>
    avisarQuemPode("aquisicoes_recebimentos", ["aquisicoes_compras_edicao"], {
      texto: textoAviso.slice(0, 300),
      link: "/painel/compras/recebimentos",
      evento: "pendencia_recebimentos",
      assunto: "Fornecimento a receber",
    })
  )
}

/** Código do apontamento "cobranças acima do valor da compra". */
export const CODIGO_VALOR_EXCEDIDO = "compra_valor_excedido"

/**
 * Gera uma ordem de pagamento ('Em autorização') para o fornecimento. Pode
 * haver várias (entrada, parcelas, notas separadas), cada uma com o seu
 * valor — canceladas não contam. As cobranças podem passar do valor da
 * compra: aí a confirmação da auditoria mostra o alerta antes de gravar e a
 * ordem fica com o apontamento. Pagamento sem nota própria leva a nota da
 * compra. Sem a coluna fornecimento_id (SQL compras-pagamentos-multiplos),
 * uma ordem só.
 */
export async function gerarOrdemFornecimento(
  fornecimentoId: string,
  dados: {
    vencimento: string | null
    nota_fiscal_url: string | null
    valor?: number | null
    /** Forma deste pagamento (padrão: a do fornecimento). */
    forma_pagamento?: string | null
    /** O "para onde" da forma (cartão, caixa, chave/conta, código Pix, boleto). */
    detalhe?: DetalhePagamento | null
  },
  confirmacao?: Confirmacao
): Promise<{ erro?: string; apontamentos?: Apontamento[] }> {
  const admin = await createAdminClient()
  const { data: f, error: erroBusca } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, fornecedor_id, valor, forma_pagamento, ordem_pagamento_id, nota_fiscal_url")
    .eq("id", fornecimentoId)
    .maybeSingle()
  if (erroBusca) {
    if (esquemaAusente(erroBusca)) return { erro: AVISO_SQL }
    return { erro: `Falha ao buscar o fornecimento: ${erroBusca.message}` }
  }
  if (!f) return { erro: "Fornecimento não encontrado." }

  // O que já foi lançado para este fornecimento.
  const jaLancadas = await admin
    .from("ordens_pagamento")
    .select("id, valor_inicial_cobranca, situacao")
    .eq("fornecimento_id", fornecimentoId)
    .not("excluido", "is", true)
  const multiplos = !jaLancadas.error
  if (!multiplos && f.ordem_pagamento_id) return { erro: "Este fornecimento já tem ordem gerada." }
  const lista = [...(jaLancadas.data ?? [])]
  // A ordem principal pode não ter fornecimento_id (compra direta, RPA, legado): conta também.
  if (f.ordem_pagamento_id && !lista.some((o) => o.id === f.ordem_pagamento_id)) {
    const { data: principal } = await admin
      .from("ordens_pagamento")
      .select("id, valor_inicial_cobranca, situacao, excluido")
      .eq("id", f.ordem_pagamento_id)
      .maybeSingle()
    if (principal && principal.excluido !== true) lista.push(principal)
  }
  const validas = lista.filter((o) => o.situacao !== "Cancelada")
  const lancado = Math.round(validas.reduce((s, o) => s + Number(o.valor_inicial_cobranca ?? 0), 0) * 100) / 100
  const total = Number(f.valor ?? 0)
  const restante = Math.round((total - lancado) * 100) / 100
  const valor = dados.valor ?? (restante > 0 ? restante : 0)
  if (!(valor > 0)) return { erro: "Informe o valor do pagamento." }
  const numero = validas.length + 1
  // Cobranças acima do valor da compra: permitido, com alerta confirmado.
  const somaComNova = Math.round((lancado + valor) * 100) / 100
  const excedente = Math.round((somaComNova - total) * 100) / 100
  const apontamentoExcedente: Apontamento | null =
    excedente > 0.005
      ? {
          codigo: CODIGO_VALOR_EXCEDIDO,
          titulo: "Cobranças acima do valor da compra",
          detalhe: `Com este pagamento, as cobranças somam ${formatarMoeda(somaComNova)}, acima do valor da compra (${formatarMoeda(total)}) em ${formatarMoeda(excedente)}.`,
          bloqueia: false,
          confirmado: Boolean(confirmacao?.codigos.includes(CODIGO_VALOR_EXCEDIDO)),
        }
      : null
  if (apontamentoExcedente && !apontamentoExcedente.confirmado) return { apontamentos: [apontamentoExcedente] }

  const { data: processo } = await admin
    .from("compras_solicitacoes")
    .select("id, codigo, solicitacao_produto, solicitacao_departamento_id, solicitacao_centro_custo_id")
    .eq("id", f.processo_id)
    .maybeSingle()
  if (!processo) return { erro: "Processo do fornecimento não encontrado." }

  // Sem nota própria, o pagamento leva a nota da compra (mesmo com o valor integral).
  const notaFiscal = dados.nota_fiscal_url ?? f.nota_fiscal_url
  const parcial = valor < total - 0.005 || numero > 1

  const { data: ordem, error: erroOrdem } = await inserirOrdemVerificada({
      codigo: gerarCodigoProcesso(),
      tipo: "Compras",
      descricao: `Compra ${processo.codigo ?? ""} — ${processo.solicitacao_produto ?? "(sem descrição)"}${parcial ? ` (pagamento ${numero})` : ""}`,
      situacao: "Em autorização",
      valor_inicial_cobranca: valor,
      forma_pagamento: dados.forma_pagamento ?? f.forma_pagamento,
      // Colunas de supabase/compras-pagamento.sql (o "para onde" da forma).
      ...(dados.detalhe ?? {}),
      vencimento: dados.vencimento,
      beneficiario_fornecedor_id: f.fornecedor_id,
      departamento_id: processo.solicitacao_departamento_id,
      centro_custo_despesa_id: processo.solicitacao_centro_custo_id,
      arquivo_nota_fiscal: notaFiscal,
      processo_compra_id: processo.id,
      ...(multiplos ? { fornecimento_id: fornecimentoId } : {}),
      excluido: false,
      emp_proprietaria_id: await tenantAtual(),
    }, confirmacao ? { confirmacao } : {})
  if (erroOrdem || !ordem) {
    // O alerta de valor já confirmado segue na lista — senão a confirmação
    // seguinte o perderia e pediria de novo.
    if (erroOrdem?.apontamentos) {
      return { apontamentos: apontamentoExcedente ? [...erroOrdem.apontamentos, apontamentoExcedente] : erroOrdem.apontamentos }
    }
    return { erro: `Não foi possível gerar a ordem: ${erroOrdem?.message}` }
  }
  if (apontamentoExcedente) {
    const { error: erroVer } = await admin.from("ordens_pagamento_verificacoes").insert({
      emp_proprietaria_id: await tenantAtual(),
      ordem_id: ordem.id,
      origem: "Compras",
      codigo: CODIGO_VALOR_EXCEDIDO,
      titulo: apontamentoExcedente.titulo,
      severidade: "alertar",
      status: "alerta",
      detalhe: apontamentoExcedente.detalhe,
    })
    if (erroVer && !esquemaAusente(erroVer)) console.error("auditoria (valor excedido):", erroVer.message)
  }

  // O fornecimento guarda a primeira ordem (recebimento, RPA) e a nota do 1º pagamento.
  if (!f.ordem_pagamento_id) {
    const { error: erroVinculo } = await admin
      .from("compras_fornecimentos")
      .update({
        ordem_pagamento_id: ordem.id,
        ...(dados.nota_fiscal_url ? { nota_fiscal_url: dados.nota_fiscal_url } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", fornecimentoId)
      .is("ordem_pagamento_id", null)
    if (erroVinculo) {
      await admin.from("ordens_pagamento").delete().eq("id", ordem.id)
      return { erro: `Não foi possível vincular a ordem: ${erroVinculo.message}` }
    }
  }
  return {}
}

// ── Recebimento ────────────────────────────────────────────────────────────

export async function registrarRecebimento(
  fornecimentoId: string,
  dados: {
    recebedor_id: string
    data: string
    de_acordo: boolean
    observacao: string | null
  }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: alterados, error } = await admin
    .from("compras_fornecimentos")
    .update({
      recebido: true,
      recebimento_data: dados.data,
      recebimento_recebido_por_id: dados.recebedor_id,
      recebimento_de_acordo: dados.de_acordo,
      recebimento_observacao: dados.observacao,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fornecimentoId)
    .eq("recebido", false)
    .select("id, processo_id")
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível registrar o recebimento: ${error.message}` }
  }
  const linha = (alterados ?? [])[0]
  if (!linha) return { erro: "Fornecimento não encontrado ou já recebido." }

  // Todos os fornecimentos recebidos → processo recebido.
  const { count } = await admin
    .from("compras_fornecimentos")
    .select("id", { count: "exact", head: true })
    .eq("processo_id", linha.processo_id)
    .eq("recebido", false)
  if (count === 0) {
    await admin
      .from("compras_solicitacoes")
      .update({
        recebido: true,
        recebimento_data: dados.data,
        recebimento_recebido_por_id: dados.recebedor_id,
        recebimento_de_acordo: dados.de_acordo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", linha.processo_id)
  }
  return {}
}

export type RecebimentoPendente = {
  id: string
  processo_id: string
  processoCodigo: string | null
  produto: string | null
  departamentoNome: string | null
  fornecedorNome: string | null
  valor: number | null
  data_compra: string | null
  previsao_entrega: string | null
}

/** O que tem para chegar: fornecimentos comprados e ainda não recebidos. */
export async function listarRecebimentosPendentes(): Promise<{
  disponivel: boolean
  pendentes: RecebimentoPendente[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_fornecimentos")
    .select("*")
    .eq("recebido", false)
    .order("previsao_entrega", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .range(0, 4999)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, pendentes: [] }
    throw new Error(`Falha ao listar recebimentos: ${error.message}`)
  }
  const brutos = (data ?? []) as Record<string, unknown>[]
  const processoIds = [
    ...new Set(brutos.map((x) => String(x.processo_id)).filter(Boolean)),
  ]
  const [empresas, processosRes] = await Promise.all([
    empresasPorId(
      brutos
        .map((x) => x.fornecedor_id)
        .filter((v): v is string => Boolean(v))
    ),
    processoIds.length
      ? admin
          .from("compras_solicitacoes")
          .select(
            "id, codigo, solicitacao_produto, solicitacao_departamento_id"
          )
          .in("id", processoIds)
      : Promise.resolve({ data: [] }),
  ])
  const processos = new Map(
    ((processosRes.data ?? []) as Record<string, unknown>[]).map((p) => [
      String(p.id),
      p,
    ])
  )
  const deptoIds = [
    ...new Set(
      [...processos.values()]
        .map((p) => p.solicitacao_departamento_id)
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const departamentos = deptoIds.length
    ? await admin
        .from("empresa_departamentos")
        .select("id, departamento")
        .in("id", deptoIds)
    : { data: [] }
  const nomeDepto = new Map(
    ((departamentos.data ?? []) as Record<string, unknown>[]).map((d) => [
      String(d.id),
      String(d.departamento ?? "(sem nome)"),
    ])
  )

  return {
    disponivel: true,
    pendentes: brutos.map((x) => {
      const p = processos.get(String(x.processo_id))
      return {
        id: String(x.id),
        processo_id: String(x.processo_id),
        processoCodigo: (p?.codigo as string | null) ?? null,
        produto: (p?.solicitacao_produto as string | null) ?? null,
        departamentoNome: p?.solicitacao_departamento_id
          ? (nomeDepto.get(String(p.solicitacao_departamento_id)) ?? null)
          : null,
        fornecedorNome: x.fornecedor_id
          ? (empresas.get(String(x.fornecedor_id))?.nome ?? null)
          : null,
        valor: (x.valor as number | null) ?? null,
        data_compra: (x.data_compra as string | null) ?? null,
        previsao_entrega: (x.previsao_entrega as string | null) ?? null,
      }
    }),
  }
}

// ── Avaliações (aprovação por alçada) ──────────────────────────────────────

export type OrdemParaAvaliacao = OrdemDoProcesso & {
  /** Origem da ordem (Compras, Contrato, RPA, Diária, Custeio…). */
  tipo: string | null
  /** Alertas das regras de auditoria na criação. */
  alertas: number
  /** Os alertas em si — título, detalhe e se quem lançou confirmou. */
  apontamentos: ApontamentoDaOrdem[]
  /** Reenviada após estorno do banco: o motivo e o que foi corrigido. */
  aposEstorno: { motivo: string; correcao: string | null } | null
  processo_compra_id: string | null
  produto: string | null
  departamentoNome: string | null
}

export type ListaAvaliacoes = {
  /** Dentro da alçada do avaliador — pode aprovar. */
  dentroDaAlcada: OrdemParaAvaliacao[]
  /** Acima da alçada — visível como contexto, sem ação. */
  acimaDaAlcada: OrdemParaAvaliacao[]
}

export async function listarOrdensParaAvaliacao(
  alcada: number
): Promise<ListaAvaliacoes> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("ordens_pagamento")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    // A alçada é pelo VALOR, qualquer que seja a origem. (`excluido` nulo
    // conta como não excluído — as diárias nascem assim.)
    .eq("situacao", "Em autorização")
    .not("excluido", "is", true)
    .order("vencimento", { ascending: true, nullsFirst: false })
  if (error) throw new Error(`Falha ao listar ordens: ${error.message}`)

  const brutas = (data ?? []) as Record<string, unknown>[]
  const ordens = await normalizarOrdens(brutas)

  const processoIds = [
    ...new Set(
      brutas
        .map((o) => o.processo_compra_id)
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const processos = processoIds.length
    ? await admin
        .from("compras_solicitacoes")
        .select("id, solicitacao_produto, solicitacao_departamento_id")
        .in("id", processoIds)
    : { data: [] }
  const processoPorId = new Map(
    ((processos.data ?? []) as Record<string, unknown>[]).map((p) => [
      String(p.id),
      p,
    ])
  )
  const deptoIds = [
    ...new Set(
      [...processoPorId.values()]
        .map((p) => p.solicitacao_departamento_id)
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const departamentos = deptoIds.length
    ? await admin
        .from("empresa_departamentos")
        .select("id, departamento")
        .in("id", deptoIds)
    : { data: [] }
  const nomeDepto = new Map(
    ((departamentos.data ?? []) as Record<string, unknown>[]).map((d) => [
      String(d.id),
      String(d.departamento ?? "(sem nome)"),
    ])
  )

  const apontamentos = await apontamentosPorOrdem(ordens.map((o) => o.id))
  // Último estorno resolvido de cada ordem (sem a tabela: nenhum).
  const estornoPorOrdem = new Map<string, { motivo: string; correcao: string | null }>()
  if (ordens.length) {
    const { data: est } = await admin
      .from("ordens_pagamento_estornos")
      .select("ordem_id, motivo, resolucao, resolvido_em")
      .in("ordem_id", ordens.map((o) => o.id))
      .not("resolvido_em", "is", null)
      .order("resolvido_em", { ascending: true })
    for (const e of (est ?? []) as Record<string, unknown>[]) {
      estornoPorOrdem.set(String(e.ordem_id), {
        motivo: String(e.motivo ?? ""),
        correcao: (e.resolucao as string | null) ?? null,
      })
    }
  }
  const completas: OrdemParaAvaliacao[] = ordens.map((o, i) => {
    const bruta = brutas[i]
    const processoId = (bruta.processo_compra_id as string | null) ?? null
    const processo = processoId ? processoPorId.get(processoId) : undefined
    return {
      ...o,
      tipo: (bruta.tipo as string | null) ?? null,
      alertas: apontamentos.get(o.id)?.length ?? 0,
      apontamentos: apontamentos.get(o.id) ?? [],
      aposEstorno: estornoPorOrdem.get(o.id) ?? null,
      processo_compra_id: processoId,
      produto: (processo?.solicitacao_produto as string | null) ?? null,
      departamentoNome: processo?.solicitacao_departamento_id
        ? (nomeDepto.get(String(processo.solicitacao_departamento_id)) ?? null)
        : null,
    }
  })

  const dentro: OrdemParaAvaliacao[] = []
  const acima: OrdemParaAvaliacao[] = []
  for (const o of completas) {
    // Sem valor definido não há como conferir alçada — fica não-aprovável
    // (caso das ordens legadas migradas, que vieram com valor nulo).
    const valor = o.valor_inicial_cobranca
    if (alcada > 0 && valor !== null && valor <= alcada) dentro.push(o)
    else acima.push(o)
  }
  return { dentroDaAlcada: dentro, acimaDaAlcada: acima }
}

/**
 * Aprova (→ 'A pagar') ou devolve (→ 'Aguardando informações') uma ordem 'Em
 * autorização' de QUALQUER origem — a alçada é pelo valor. Ver
 * lib/db/ordens-ciclo.ts (trilha e compra paga em dinheiro).
 */
export async function avaliarOrdemCompra(
  ordemId: string,
  avaliadorId: string,
  alcada: number,
  aprovar: boolean,
  observacao: string | null
): Promise<{ erro?: string }> {
  if (aprovar) {
    const exigida = await permissaoEspecificaDaOrdem(ordemId)
    if (exigida && !(await temPermissaoEfetiva(avaliadorId, exigida.chave))) {
      return {
        erro: `Pagamento extraordinário de ${exigida.origem}: além da alçada, aprovar exige a permissão "${exigida.rotulo}".`,
      }
    }
  }
  return avaliarOrdem(ordemId, avaliadorId, alcada, aprovar, observacao)
}

/**
 * Ordem de CONTRATO (não RPA, não compra) ou de CUSTEIO em autorização é
 * pagamento extraordinário: quem aprova precisa da permissão de autorizar
 * contratos/custeios, além da alçada pelo valor (05/10/2026).
 */
export async function permissaoEspecificaDaOrdem(
  ordemId: string
): Promise<{ chave: string; rotulo: string; origem: string } | null> {
  const admin = await createAdminClient()
  const { data: o } = await admin
    .from("ordens_pagamento")
    .select("contrato_id, custeio_id, tipo, processo_compra_id")
    .eq("id", ordemId)
    .maybeSingle()
  if (!o) return null
  if (o.custeio_id) {
    return { chave: "custeio_institucional_autorizacao", rotulo: "Custeio institucional — autorizar", origem: "custeio" }
  }
  if (o.contrato_id && o.tipo === "Contrato" && !o.processo_compra_id) {
    const { data: c } = await admin.from("contratos").select("apoio_institucional").eq("id", String(o.contrato_id)).maybeSingle()
    if (c?.apoio_institucional === true) return null
    return { chave: "aquisicoes_contratos_autorizacao", rotulo: "Contratos — autorizar", origem: "contrato" }
  }
  return null
}

async function temPermissaoEfetiva(usuarioId: string, chave: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("permissoes")
    .select("*")
    .eq(PERMISSOES_USUARIO_FK, usuarioId)
    .maybeSingle()
  const efetivas = await resolverPermissoes(admin, usuarioId, (data ?? {}) as Record<string, unknown>)
  return efetivas[chave] === true
}

// ── Fornecedores ───────────────────────────────────────────────────────────

export type FornecedorLinha = {
  id: string
  nome: string
  nome_razao: string | null
  razao: string | null
  cnpj_cpf: string | null
  pessoa_juridica: boolean
  bloqueado: boolean
}

export async function listarFornecedores(
  busca = ""
): Promise<FornecedorLinha[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const termo = busca.trim().replace(/[,()]/g, " ").trim()
  const digitos = termo.replace(/\D/g, "")
  // Consulta nova a cada lote: o builder do supabase-js acumula .order().
  const consulta = () => {
    const q = admin
      .from("empresa")
      .select("id, nome_fantasia, nome_razao, cnpj_cpf, pessoa_juridica, fornecedor_bloqueado, bloqueado, inativa")
      .eq("emp_proprietaria_id", emp)
      .not("inativa", "is", true)
    return termo
      ? q.or(
          [
            `nome_fantasia.ilike.%${termo}%`,
            `nome_razao.ilike.%${termo}%`,
            digitos ? `cnpj_cpf.like.%${digitos}%` : null,
          ]
            .filter(Boolean)
            .join(",")
        )
      : q
  }
  // Em lotes: o PostgREST corta em 1.000 linhas e o cadastro passa disso
  // (1.608 no sindicato em 01/10) — o .limit(2000) antigo deixava de fora
  // tudo depois de ~"R" na ordem alfabética (ex.: TICKET LOG).
  let data: Record<string, unknown>[]
  try {
    data = await lerEmLotes((de, ate) =>
      consulta()
        .order("nome_fantasia", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(de, ate)
    )
  } catch (e) {
    throw new Error(`Falha ao listar fornecedores: ${(e as Error).message}`)
  }
  return data.map((e) => ({
    id: String(e.id),
    nome:
      [e.nome_fantasia, e.nome_razao].find(
        (v): v is string => typeof v === "string" && v.trim() !== ""
      ) ?? "(sem nome)",
    nome_razao: (e.nome_razao as string | null) ?? null,
    razao: (e.nome_razao as string | null) ?? null,
    cnpj_cpf: (e.cnpj_cpf as string | null) ?? null,
    pessoa_juridica: e.pessoa_juridica === true,
    bloqueado: e.fornecedor_bloqueado === true || e.bloqueado === true,
  }))
}

// ── Lookups para formulários ───────────────────────────────────────────────

export type OpcaoLookup = { id: string; nome: string }

/** Departamentos para ESCOLHER — os legados (desativados) ficam de fora. */
export async function listarDepartamentos(): Promise<OpcaoLookup[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const consulta = (semLegados: boolean) => {
    const q = admin
      .from("empresa_departamentos")
      .select("id, departamento")
      .eq("emp_proprietaria_id", emp)
    return (semLegados ? q.not("legado", "is", true) : q).order("departamento", { ascending: true })
  }
  let { data, error } = await consulta(true)
  // Sem supabase/departamentos-ajustes.sql ainda não há legado.
  if (error && esquemaAusente(error)) ({ data, error } = await consulta(false))
  if (error) throw new Error(`Falha ao listar departamentos: ${error.message}`)
  return (data ?? []).map((d) => ({
    id: String(d.id),
    nome: String(d.departamento ?? "(sem nome)"),
  }))
}

export type ProjetoCompraOpcao = {
  id: string
  nome: string
  /** Centro de custo do projeto — atribuído à despesa da compra. */
  centroCustoId: string | null
}

export async function listarProjetosAbertos(): Promise<ProjetoCompraOpcao[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("projeto")
    .select("id, descricao_sumaria, finalizado, centro_custo_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("finalizado", "is", true)
    .order("descricao_sumaria", { ascending: true })
  if (error) throw new Error(`Falha ao listar projetos: ${error.message}`)
  return (data ?? []).map((p) => ({
    id: String(p.id),
    nome: String(p.descricao_sumaria ?? "(sem nome)"),
    centroCustoId: (p.centro_custo_id as string | null) ?? null,
  }))
}

export type CentroCustoCompraOpcao = {
  id: string
  nome: string
  /** Departamento a que o centro pertence — filtro no formulário de compra. */
  departamentoId: string | null
}

/** Centros de custo usáveis, com o departamento, para o formulário de compra. */
export async function listarCentrosCustoParaCompra(): Promise<
  CentroCustoCompraOpcao[]
> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("centros_de_custo")
    .select("id, nome_da_conta, classificador, usavel, departamento_id")
    .order("classificador", { ascending: true, nullsFirst: false })
    .order("nome_da_conta", { ascending: true })
  if (error) {
    throw new Error(`Falha ao listar centros de custo: ${error.message}`)
  }
  return (data ?? [])
    .filter((c) => c.usavel !== false)
    .map((c) => ({
      id: String(c.id),
      nome:
        [c.classificador, c.nome_da_conta].filter(Boolean).join(" - ") ||
        "(sem nome)",
      departamentoId: (c.departamento_id as string | null) ?? null,
    }))
}

// ── Fila do comprador (processos Via Aquisição a operar) ─────────────────────

export type ItemFilaComprador = {
  id: string
  codigo: string | null
  produto: string | null
  departamentoNome: string | null
  situacao: SituacaoProcesso
  data_limite: string | null
  created_at: string | null
}

/**
 * Processos Via Aquisição abertos que aguardam ação do comprador: solicitados
 * (iniciar cotação), em cotação (coletar propostas) e cotados (escolher e
 * comprar). Exclui aquisição direta, comprados, recebidos e cancelados.
 */
export async function listarFilaComprador(): Promise<{
  disponivel: boolean
  itens: ItemFilaComprador[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_solicitacoes")
    .select(
      "id, codigo, solicitacao_produto, solicitacao_departamento_id, em_cotacao, cotacao_termino, solicitacao_data_limite, created_at, cancelado, comprado, recebido"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("aquisicao_direta", false)
    .eq("cancelado", false)
    .eq("comprado", false)
    .order("solicitacao_data_limite", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, itens: [] }
    throw new Error(`Falha ao listar a fila do comprador: ${error.message}`)
  }
  const brutos = (data ?? []) as Record<string, unknown>[]

  const deptoIds = [
    ...new Set(
      brutos
        .map((x) => x.solicitacao_departamento_id)
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const nomeDepto = new Map<string, string>()
  if (deptoIds.length) {
    const { data: deps } = await admin
      .from("empresa_departamentos")
      .select("id, departamento")
      .in("id", deptoIds)
    for (const d of (deps ?? []) as Record<string, unknown>[]) {
      nomeDepto.set(String(d.id), String(d.departamento ?? "(sem nome)"))
    }
  }

  return {
    disponivel: true,
    itens: brutos.map((x) => ({
      id: String(x.id),
      codigo: (x.codigo as string | null) ?? null,
      produto: (x.solicitacao_produto as string | null) ?? null,
      departamentoNome: x.solicitacao_departamento_id
        ? (nomeDepto.get(String(x.solicitacao_departamento_id)) ?? null)
        : null,
      situacao: derivarSituacao(x as FlagsProcesso),
      data_limite: (x.solicitacao_data_limite as string | null) ?? null,
      created_at: (x.created_at as string | null) ?? null,
    })),
  }
}

// ── Arquivos (bucket 'compras') ────────────────────────────────────────────

/** URL assinada (1h); caminhos http(s) legados do Bubble passam direto. */
export async function urlArquivoCompras(
  caminho: string | null
): Promise<string | null> {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage
    .from("compras")
    .createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

/** Sobe um PDF no bucket 'compras' e devolve o caminho gravável nas tabelas. */
export async function subirPdfCompras(
  prefixo: string,
  arquivo: File
): Promise<{ caminho?: string; erro?: string }> {
  if (arquivo.type !== "application/pdf") {
    return { erro: "O arquivo deve ser um PDF." }
  }
  if (arquivo.size > 5 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 5 MB." }
  }
  const caminho = `${prefixo}/${Date.now()}.pdf`
  const admin = await createAdminClient()
  const { error } = await admin.storage
    .from("compras")
    .upload(caminho, arquivo, { contentType: "application/pdf" })
  if (error) return { erro: `Falha ao subir o arquivo: ${error.message}` }
  return { caminho }
}

/** Tipos aceitos como nota/cupom da aquisição direta (PDF ou foto). */
export const TIPOS_COMPROVANTE_COMPRAS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

/**
 * Sobe a nota fiscal/cupom da aquisição direta — PDF ou imagem (cupom
 * fotografado) — no bucket 'compras'. O teto de 4 MB é o do corpo da server
 * action; o formulário já reduz fotos grandes antes de enviar.
 */
export async function subirComprovanteCompras(
  prefixo: string,
  arquivo: File
): Promise<{ caminho?: string; erro?: string }> {
  const ext = TIPOS_COMPROVANTE_COMPRAS[arquivo.type]
  if (!ext) return { erro: "A nota deve ser um PDF ou uma imagem (JPG, PNG ou WEBP)." }
  if (arquivo.size > 4 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 4 MB." }
  }
  const caminho = `${prefixo}/${Date.now()}.${ext}`
  const admin = await createAdminClient()
  const { error } = await admin.storage
    .from("compras")
    .upload(caminho, arquivo, { contentType: arquivo.type })
  if (error) return { erro: `Falha ao subir o arquivo: ${error.message}` }
  return { caminho }
}

/** Alçada de aprovação do avaliador (coluna numérica em `permissoes`). */
export function alcadaDoUsuario(permissoes: Record<string, unknown>): number {
  const bruta = permissoes["alcada_aprovacao"]
  const n = typeof bruta === "string" ? Number(bruta) : Number(bruta ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export { hojeSP } from "@/lib/db/comum"
