import "server-only"
import { tenantAtual } from "@/lib/tenant"
import { FORMA_PAGA_NO_ATO } from "@/lib/compras-constantes"

import { hojeSP, lerEmLotes, lerEmLotesPorIds, texto } from "@/lib/db/comum"
import { favorecidosDasOrdens } from "@/lib/db/ordens-favorecido"
import { createAdminClient } from "@/lib/supabase/admin"
import { rotuloCentroCusto } from "@/lib/centros-custo-rotulo"

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
 *   → `empresa`), pessoa do quadro (beneficiario_usuario_id → `usuarios`) ou
 *   FILIADO — este sem coluna na ordem: vem do pedido de reembolso
 *   (`filiacao_reembolsos.ordem_pagamento_id`) ou do custeio
 *   (`institucional_custeios.filiacao_id`). Ver `favorecidosDasOrdens` (lib/db/ordens-favorecido.ts).
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

export { FORMA_PAGA_NO_ATO }

/** Filtro PostgREST `or`: ordens que NÃO são pagas no ato (forma nula conta). */
export const FILTRO_NAO_PAGA_NO_ATO = `forma_pagamento.is.null,forma_pagamento.neq.${FORMA_PAGA_NO_ATO}`

/**
 * Todas as situações que existem no banco, na ordem do ciclo — opções do
 * filtro da lista. "Estornado" é legado do Bubble (13 ordens em 01/10); o
 * estorno de hoje devolve a ordem para "Aguardando informações".
 */
export const SITUACOES_ORDEM = [
  // Parcela recorrente de contrato esperando a nota (fica no contrato).
  "Aguardando documento fiscal",
  "Em autorização",
  "Aguardando informações",
  "A pagar",
  "Processando",
  // Compra no cartão de crédito autorizada: quitada pela ordem da fatura.
  "Na fatura",
  "Paga",
  "Estornado",
  "Cancelada",
] as const

/** Filtro de situação: "todas", o grupo "abertas" ou uma situação exata. */
export type FiltroSituacaoOrdem = "todas" | "abertas" | (typeof SITUACOES_ORDEM)[number]

/** Lê o filtro da URL (aceita os valores antigos "pagas"/"canceladas"). */
export function filtroSituacaoOrdem(valor: string | undefined): FiltroSituacaoOrdem {
  if (valor === "pagas") return "Paga"
  if (valor === "canceladas") return "Cancelada"
  if (valor === "abertas") return "abertas"
  return (SITUACOES_ORDEM as readonly string[]).includes(valor ?? "")
    ? (valor as FiltroSituacaoOrdem)
    : "todas"
}

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
  custeio_id: string | null
  /** Nome resolvido do favorecido (empresa, usuário, filiado ou avulso). */
  favorecido: string | null
}

export type FiltrosOrdens = {
  busca?: string
  situacao?: FiltroSituacaoOrdem
  /** Filtro pela coluna `tipo` (ex.: "Custeio", "Compras"); "todos" não filtra. */
  tipo?: string
  /**
   * Favorecido: id da empresa (fornecedor), "u:<id>" (pessoa do quadro) ou
   * "f:<id>" (filiado, pelos reembolsos e custeios dele).
   */
  beneficiario?: string
  /** id do centro de custo (centro_custo_despesa_id). */
  centroCusto?: string
  /** id do departamento (departamento_id). */
  departamento?: string
  /** id do projeto (projeto_id). */
  projeto?: string
  /** forma_pagamento exata. */
  formaPagamento?: string
  pagina?: number
  porPagina?: number
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
  "id, codigo, descricao, tipo, situacao, forma_pagamento, valor_inicial_cobranca, valor_pago, vencimento, data_pagamento, fornecedor_id, beneficiario_fornecedor_id, beneficiario_usuario_id, beneficiario_nome_avulso, custeio_id"

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

const NENHUMA = "00000000-0000-0000-0000-000000000000"

/** As ordens de um filiado: as dos pedidos de reembolso e as dos custeios dele. */
async function ordensDoFiliado(filiadoId: string): Promise<string[]> {
  const admin = await createAdminClient()
  const [{ data: reembolsos }, { data: custeios }] = await Promise.all([
    admin.from("filiacao_reembolsos").select("ordem_pagamento_id").eq("filiado_id", filiadoId).not("ordem_pagamento_id", "is", null),
    admin.from("institucional_custeios").select("id").eq("filiacao_id", filiadoId),
  ])
  const ids = new Set(((reembolsos ?? []) as Record<string, unknown>[]).map((r) => String(r.ordem_pagamento_id)))
  const custeioIds = ((custeios ?? []) as Record<string, unknown>[]).map((c) => String(c.id))
  if (custeioIds.length) {
    const { data } = await admin.from("ordens_pagamento").select("id").in("custeio_id", custeioIds)
    for (const o of (data ?? []) as Record<string, unknown>[]) ids.add(String(o.id))
  }
  return [...ids]
}

function aplicarFiltrosOrdens<T>(
  builder: T,
  {
    busca = "",
    situacao = "todas",
    tipo = "todos",
    beneficiario = "",
    centroCusto = "",
    departamento = "",
    projeto = "",
    formaPagamento = "",
  }: FiltrosOrdens,
  empId: string,
  /** Filtro por filiado: as ordens dele já resolvidas (reembolsos e custeios). */
  ordensDoFiliado: string[] = []
): T {
  let q = (builder as unknown as BuilderFiltros)
    .eq("emp_proprietaria_id", empId)
    .not("excluido", "is", true)

  if (situacao === "abertas") q = q.in("situacao", SITUACOES_ABERTAS)
  else if (situacao !== "todas") q = q.eq("situacao", situacao)
  if (tipo && tipo !== "todos") q = q.eq("tipo", tipo)
  if (beneficiario.startsWith("u:")) q = q.eq("beneficiario_usuario_id", beneficiario.slice(2))
  else if (beneficiario.startsWith("f:")) q = q.in("id", ordensDoFiliado.length ? ordensDoFiliado : [NENHUMA])
  else if (beneficiario) q = q.or(`beneficiario_fornecedor_id.eq.${beneficiario},fornecedor_id.eq.${beneficiario}`)
  if (centroCusto) q = q.eq("centro_custo_despesa_id", centroCusto)
  if (departamento) q = q.eq("departamento_id", departamento)
  if (projeto) q = q.eq("projeto_id", projeto)
  if (formaPagamento) q = q.eq("forma_pagamento", formaPagamento)

  const termo = busca.trim()
  if (termo) {
    const escapado = escaparLike(termo)
    q = q.or(`descricao.ilike.%${escapado}%,codigo.ilike.%${escapado}%,beneficiario_nome_avulso.ilike.%${escapado}%`)
  }
  return q as unknown as T
}

/** Nome do favorecido de cada linha (regra única: lib/favorecido.ts). */
async function resolverFavorecidos(
  linhas: Omit<OrdemLinha, "favorecido">[]
): Promise<OrdemLinha[]> {
  const favorecidos = await favorecidosDasOrdens(linhas)
  return linhas.map((o) => ({ ...o, favorecido: favorecidos.get(o.id)?.nome ?? null }))
}

export async function listarOrdens(
  filtros: FiltrosOrdens
): Promise<ListaOrdens> {
  const {
    pagina = 1,
    porPagina = ORDENS_POR_PAGINA,
    ordem = "vencimento",
    dir = "desc",
  } = filtros
  const admin = await createAdminClient()

  let q = admin
    .from("ordens_pagamento")
    .select(SELECT_ORDEM, { count: "exact" })
  const beneficiario = filtros.beneficiario ?? ""
  q = aplicarFiltrosOrdens(
    q,
    filtros,
    await tenantAtual(),
    beneficiario.startsWith("f:") ? await ordensDoFiliado(beneficiario.slice(2)) : []
  )

  const de = (pagina - 1) * porPagina
  const { data, count, error } = await q
    .order(COLUNAS_ORDEM[ordem] ?? "vencimento", {
      ascending: dir === "asc",
      nullsFirst: false,
    })
    .order("created_at", { ascending: false })
    .range(de, de + porPagina - 1)
  if (error) throw new Error(`Falha ao listar ordens: ${error.message}`)

  const total = count ?? 0
  return {
    linhas: await resolverFavorecidos(data ?? []),
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
  }
}

/** Um dia do extrato: as ordens e a soma delas. */
export type DiaExtrato = { data: string; linhas: OrdemLinha[]; total: number }

export type ExtratoOrdens = {
  hoje: string
  /** Por pagar com vencimento depois de hoje (dentro do horizonte), do mais próximo ao mais distante. */
  futuros: DiaExtrato[]
  /** Futuros além do horizonte: só a contagem e o valor. */
  futurosAlem: { quantidade: number; total: number }
  /** O dia de hoje: o que vence hoje e o que foi pago hoje. */
  hojeDia: DiaExtrato
  /** Por pagar com vencimento já passado (ou sem vencimento). */
  atrasadas: DiaExtrato[]
  /** Pagas (pela data do pagamento) de `realizadosDe` até ontem, do mais recente ao mais antigo. */
  realizados: DiaExtrato[]
  realizadosDe: string
}

// Fora do extrato: a cancelada não movimenta, e a compra "Na fatura" é paga
// pela ordem da fatura (contaria duas vezes). Escolhendo a situação no
// filtro, ela aparece.
const FORA_DO_EXTRATO = ["Cancelada", "Estornado", "Na fatura"]

const somaDia = (linhas: OrdemLinha[]) =>
  Math.round(linhas.reduce((s, o) => s + Number(o.valor_pago ?? o.valor_inicial_cobranca ?? 0), 0) * 100) / 100

function porDia(linhas: OrdemLinha[], dataDe: (o: OrdemLinha) => string, desc: boolean): DiaExtrato[] {
  const grupos = new Map<string, OrdemLinha[]>()
  for (const o of linhas) grupos.set(dataDe(o), [...(grupos.get(dataDe(o)) ?? []), o])
  return [...grupos.entries()]
    .sort(([a], [b]) => (desc ? b.localeCompare(a) : a.localeCompare(b)))
    .map(([data, ls]) => ({ data, linhas: ls, total: somaDia(ls) }))
}

/**
 * EXTRATO DAS ORDENS (31/10/2026), como o do banco: hoje no topo, os
 * lançamentos futuros acima (por vencimento), as vencidas destacadas e,
 * abaixo, o que já foi pago, dia a dia pela data do pagamento. Os filtros da
 * lista valem; a paginação é por período (`dias` para trás, `futurosDias`
 * para frente — null = todos os futuros).
 */
export async function extratoOrdens(
  filtros: FiltrosOrdens,
  { dias = 30, futurosDias = 30 }: { dias?: number; futurosDias?: number | null } = {}
): Promise<ExtratoOrdens> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const somar = (iso: string, n: number) => {
    const d = new Date(`${iso}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  const realizadosDe = somar(hoje, -dias)
  const limiteFuturo = futurosDias === null ? null : somar(hoje, futurosDias)
  const beneficiario = filtros.beneficiario ?? ""
  const doFiliado = beneficiario.startsWith("f:") ? await ordensDoFiliado(beneficiario.slice(2)) : []
  const situacaoLivre = !filtros.situacao || filtros.situacao === "todas"

  const base = () => {
    let q = aplicarFiltrosOrdens(admin.from("ordens_pagamento").select(SELECT_ORDEM), filtros, emp, doFiliado)
    if (situacaoLivre) q = q.not("situacao", "in", `(${FORA_DO_EXTRATO.map((s) => `"${s}"`).join(",")})`)
    return q
  }
  const [abertas, pagas] = await Promise.all([
    // Tudo o que não está pago (futuro, hoje e atrasado).
    lerEmLotes<Omit<OrdemLinha, "favorecido">>((de, ate) => base().neq("situacao", "Paga").order("id").range(de, ate)),
    // Pagas no período (sem data de pagamento, vale o vencimento — legado).
    lerEmLotes<Omit<OrdemLinha, "favorecido">>((de, ate) =>
      base()
        .eq("situacao", "Paga")
        .or(`data_pagamento.gte.${realizadosDe},and(data_pagamento.is.null,vencimento.gte.${realizadosDe})`)
        .order("id")
        .range(de, ate)
    ),
  ])

  const ate = (o: { vencimento: string | null }) => (o.vencimento ?? "").slice(0, 10)
  const pagoEm = (o: { data_pagamento: string | null; vencimento: string | null }) => (o.data_pagamento ?? o.vencimento ?? "").slice(0, 10)
  const futurasTodas = abertas.filter((o) => ate(o) > hoje)
  const futurasNoHorizonte = futurasTodas.filter((o) => limiteFuturo === null || ate(o) <= limiteFuturo)
  const alem = futurasTodas.filter((o) => limiteFuturo !== null && ate(o) > limiteFuturo)
  const deHoje = [...abertas.filter((o) => ate(o) === hoje), ...pagas.filter((o) => pagoEm(o) === hoje)]
  const atrasadas = abertas.filter((o) => !ate(o) || ate(o) < hoje)
  const realizadas = pagas.filter((o) => pagoEm(o) < hoje && pagoEm(o) >= realizadosDe)

  // O favorecido só das ordens que vão para a tela.
  const naTela = [...futurasNoHorizonte, ...deHoje, ...atrasadas, ...realizadas]
  const comNome = new Map((await resolverFavorecidos(naTela)).map((o) => [o.id, o]))
  const com = (ls: Omit<OrdemLinha, "favorecido">[]) => ls.map((o) => comNome.get(o.id)!)
  return {
    hoje,
    futuros: porDia(com(futurasNoHorizonte), ate, false),
    futurosAlem: { quantidade: alem.length, total: somaDia(alem.map((o) => ({ ...o, favorecido: null }))) },
    hojeDia: { data: hoje, linhas: com(deHoje), total: somaDia(com(deHoje)) },
    atrasadas: porDia(com(atrasadas), (o) => ate(o) || "sem vencimento", false),
    realizados: porDia(com(realizadas), pagoEm, true),
    realizadosDe,
  }
}

export type OpcoesFiltrosOrdens = {
  fornecedores: { id: string; nome: string; cnpj_cpf: string | null }[]
  /**
   * Pessoas que já foram favorecidas: do quadro ("u:<id>") e filiados
   * ("f:<id>", pelos reembolsos e custeios) — para o filtro Favorecido.
   */
  pessoasFavorecidas: { id: string; nome: string; cnpj_cpf: string | null; etiqueta: string }[]
  centrosCusto: { id: string; nome: string; departamentoId: string | null }[]
  departamentos: { id: string; nome: string }[]
  projetos: { id: string; nome: string }[]
  formasPagamento: string[]
}

/** Opções dos selects do painel de filtros da lista de ordens. */
export async function opcoesFiltrosOrdens(): Promise<OpcoesFiltrosOrdens> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  // Empresas e ordens passam de 1.000 linhas, o teto do PostgREST — os
  // .limit(3000)/.limit(10000) antigos não passavam disso. Vão em lotes.
  const [fornData, centros, deptos, projs, formasData] = await Promise.all([
    lerEmLotes((de, ate) =>
      admin
        .from("empresa")
        .select("id, nome_fantasia, nome_razao, cnpj_cpf")
        .eq("emp_proprietaria_id", emp)
        .not("inativa", "is", true)
        .order("nome_fantasia", { ascending: true, nullsFirst: false })
        .order("id")
        .range(de, ate)
    ).catch(() => [] as Record<string, unknown>[]),
    admin
      .from("centros_de_custo")
      .select("id, nome_da_conta, acesso, classificador, departamento_id")
      .order("classificador", { ascending: true, nullsFirst: false })
      .order("nome_da_conta", { ascending: true })
      .limit(1000),
    admin
      .from("empresa_departamentos")
      .select("id, departamento")
      .eq("emp_proprietaria_id", emp)
      .order("departamento", { ascending: true })
      .limit(200),
    admin
      .from("projeto")
      .select("id, descricao, descricao_sumaria")
      .eq("emp_proprietaria_id", emp)
      .order("descricao", { ascending: true, nullsFirst: false })
      .limit(1000),
    lerEmLotes((de, ate) =>
      admin
        .from("ordens_pagamento")
        .select("forma_pagamento")
        .eq("emp_proprietaria_id", emp)
        .not("excluido", "is", true)
        .not("forma_pagamento", "is", null)
        .order("id")
        .range(de, ate)
    ).catch(() => [] as Record<string, unknown>[]),
  ])

  const fornecedores = fornData
    .map((f) => ({
      id: f.id as string,
      nome: texto(f.nome_fantasia) ?? texto(f.nome_razao) ?? "",
      cnpj_cpf: texto(f.cnpj_cpf),
    }))
    .filter((f) => f.nome)
  const centrosCusto = (centros.data ?? []).map((c) => ({
    id: c.id as string,
    nome: rotuloCentroCusto(c),
    departamentoId: texto(c.departamento_id),
  }))
  const departamentos = (deptos.data ?? []).map((d) => ({
    id: d.id as string,
    nome: texto(d.departamento) ?? "Departamento",
  }))
  const projetos = (projs.data ?? [])
    .map((p) => ({
      id: p.id as string,
      nome:
        texto(p.descricao) ?? texto(p.descricao_sumaria) ?? "",
    }))
    .filter((p) => p.nome)
  const formasPagamento = [
    ...new Set(
      formasData
        .map((o) => texto(o.forma_pagamento))
        .filter((v): v is string => Boolean(v))
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"))

  // Opção do filtro não derruba a lista: em falha, só as empresas.
  const pessoas = await pessoasFavorecidas(emp).catch((e) => {
    console.error("pessoasFavorecidas:", e instanceof Error ? e.message : e)
    return [] as OpcoesFiltrosOrdens["pessoasFavorecidas"]
  })
  return { fornecedores, pessoasFavorecidas: pessoas, centrosCusto, departamentos, projetos, formasPagamento }
}

/** Quem do quadro e quais filiados já receberam ordem (opções do filtro Favorecido). */
async function pessoasFavorecidas(emp: string): Promise<OpcoesFiltrosOrdens["pessoasFavorecidas"]> {
  const admin = await createAdminClient()
  const [usos, reembolsos, custeios] = await Promise.all([
    lerEmLotes((de, ate) =>
      admin
        .from("ordens_pagamento")
        .select("beneficiario_usuario_id")
        .eq("emp_proprietaria_id", emp)
        .not("excluido", "is", true)
        .not("beneficiario_usuario_id", "is", null)
        .order("id")
        .range(de, ate)
    ).catch(() => [] as Record<string, unknown>[]),
    lerEmLotes((de, ate) =>
      admin
        .from("filiacao_reembolsos")
        .select("filiado_id")
        .eq("emp_proprietaria_id", emp)
        .not("ordem_pagamento_id", "is", null)
        .order("id")
        .range(de, ate)
    ).catch(() => [] as Record<string, unknown>[]),
    lerEmLotes((de, ate) =>
      admin
        .from("institucional_custeios")
        .select("filiacao_id")
        .eq("emp_proprietaria_id", emp)
        .not("filiacao_id", "is", null)
        .order("id")
        .range(de, ate)
    ).catch(() => [] as Record<string, unknown>[]),
  ])
  // Há reembolso legado sem filiado: o null não pode virar "null" no .in() de uuid.
  const ids = (vs: unknown[]) => [...new Set(vs.map((v) => texto(v)).filter((v): v is string => Boolean(v)))]
  const usuarioIds = ids(usos.map((o) => o.beneficiario_usuario_id))
  const filiadoIds = ids([...reembolsos.map((r) => r.filiado_id), ...custeios.map((c) => c.filiacao_id)])
  const [usuarios, filiados] = await Promise.all([
    lerEmLotesPorIds(usuarioIds, (fatia, de, ate) =>
      admin.from("usuarios").select("id, nome_completo, nome_guerra, cpf").in("id", fatia).order("id").range(de, ate)
    ),
    lerEmLotesPorIds(filiadoIds, (fatia, de, ate) =>
      admin.from("filiacoes").select("id, nome_completo, cpf").in("id", fatia).order("id").range(de, ate)
    ),
  ])
  return [
    ...usuarios.map((u) => ({
      id: `u:${u.id}`,
      nome: texto(u.nome_completo) ?? texto(u.nome_guerra) ?? "",
      cnpj_cpf: texto(u.cpf),
      etiqueta: "Pessoal",
    })),
    ...filiados.map((f) => ({ id: `f:${f.id}`, nome: texto(f.nome_completo) ?? "", cnpj_cpf: texto(f.cpf), etiqueta: "Filiado" })),
  ]
    .filter((p) => p.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

export type ResumoFinanceiro = {
  abertas: { quantidade: number; valor: number }
  pagasNoMes: { quantidade: number; valor: number }
  totalOrdens: number
  /** Ordens em aberto quebradas por situação (na ordem de SITUACOES_ABERTAS). */
  abertasPorSituacao: { situacao: string; quantidade: number; valor: number }[]
}

function somar(valores: (number | null)[]): number {
  return valores.reduce<number>((acc, v) => acc + (v ?? 0), 0)
}

export async function resumoFinanceiro(): Promise<ResumoFinanceiro> {
  const admin = await createAdminClient()
  const inicioMes = new Date().toISOString().slice(0, 8) + "01"

  const emp = await tenantAtual()
  // Em lotes (U8): o PostgREST corta em 1.000 e o .limit(2000) antigo
  // subestimava o total aberto quando a fila passava disso.
  const [abertasLinhas, pagasLinhas, totalOrdens] = await Promise.all([
    lerEmLotes<{ valor_pago: number | null; valor_inicial_cobranca: number | null; situacao: string | null }>((de, ate) =>
      admin
        .from("ordens_pagamento")
        .select("valor_pago, valor_inicial_cobranca, situacao")
        .eq("emp_proprietaria_id", emp)
        .not("excluido", "is", true)
        .in("situacao", SITUACOES_ABERTAS)
        .order("id")
        .range(de, ate)
    ),
    lerEmLotes<{ valor: number | null; valor_pago: number | null }>((de, ate) =>
      admin
        .from("ordens_pagamento")
        .select("valor, valor_pago")
        .eq("emp_proprietaria_id", emp)
        .not("excluido", "is", true)
        .eq("situacao", "Paga")
        .gte("data_pagamento", inicioMes)
        .order("id")
        .range(de, ate)
    ),
    admin
      .from("ordens_pagamento")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .not("excluido", "is", true),
  ])
  const abertas = { data: abertasLinhas, count: abertasLinhas.length }
  const pagasNoMes = { data: pagasLinhas, count: pagasLinhas.length }

  const porSituacao = new Map<string, { quantidade: number; valor: number }>()
  for (const o of abertas.data ?? []) {
    const s = typeof o.situacao === "string" ? o.situacao : "—"
    const atual = porSituacao.get(s) ?? { quantidade: 0, valor: 0 }
    atual.quantidade += 1
    const v = o.valor_pago ?? o.valor_inicial_cobranca
    atual.valor += typeof v === "number" ? v : 0
    porSituacao.set(s, atual)
  }
  const abertasPorSituacao = SITUACOES_ABERTAS.map((s) => ({
    situacao: s,
    ...(porSituacao.get(s) ?? { quantidade: 0, valor: 0 }),
  })).filter((x) => x.quantidade > 0)

  return {
    abertas: {
      quantidade: abertas.count ?? 0,
      // Ordens abertas ainda não têm valor pago → mostra o valor pendente
      // (cobrança), coerente com o gráfico por situação.
      valor: somar(
        (abertas.data ?? []).map((o) => o.valor_pago ?? o.valor_inicial_cobranca)
      ),
    },
    pagasNoMes: {
      quantidade: pagasNoMes.count ?? 0,
      valor: somar((pagasNoMes.data ?? []).map((o) => o.valor_pago ?? o.valor)),
    },
    totalOrdens: totalOrdens.count ?? 0,
    abertasPorSituacao,
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
  /** Origem do vínculo — contrato geral ou locação de veículo. */
  origem: "contrato" | "aluguel"
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
  /**
   * Contrato vinculado à ordem — contrato geral (contrato_id) ou locação de
   * veículo (contrato_aluguel_id), unificados num só espaço.
   */
  contratoVinculado: ContratoResumo | null
  /** Projeto vinculado à ordem (quando houver). */
  projetoVinculado: ProjetoResumo | null
  /** Observação da solicitação de compra vinculada (quando houver). */
  compraObservacao: string | null
}

export type ProjetoResumo = {
  id: string
  descricao: string | null
  tipo: string | null
  inicio: string | null
  termino_previsao: string | null
  finalizado: boolean | null
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

  const empId = await tenantAtual()
  const [
    empresas,
    usuarios,
    centros,
    contratoRes,
    aluguelRes,
    projetoRes,
    compraRes,
  ] = await Promise.all([
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
    ordem.contrato_id
      ? admin
          .from("contratos")
          .select(
            "id, codigo, objeto, vigencia_inicio, vigencia_termino, ativo, arquivo_contrato"
          )
          .eq("id", ordem.contrato_id)
          .eq("emp_proprietaria_id", empId)
          .not("deletado", "is", true)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Locação de veículo — só quando não há contrato geral vinculado.
    !ordem.contrato_id && ordem.contrato_aluguel_id
      ? admin
          .from("veiculo_contratos_aluguel")
          .select(
            "id, numero_contrato_locadora, finalidade, vigencia_inicio, vigencia_termino, finalizado, arquivo_contrato_url"
          )
          .eq("id", ordem.contrato_aluguel_id)
          .eq("emp_proprietaria_id", empId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ordem.projeto_id
      ? admin
          .from("projeto")
          .select("id, descricao, tipo, inicio, termino_previsao, finalizado")
          .eq("id", ordem.projeto_id)
          .eq("emp_proprietaria_id", empId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ordem.processo_compra_id
      ? admin
          .from("compras_solicitacoes")
          .select("solicitacao_observacao")
          .eq("id", ordem.processo_compra_id)
          .eq("emp_proprietaria_id", empId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
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
  // Quem recebe: regra única (inclui o filiado do reembolso/custeio).
  const favorecido = (await favorecidosDasOrdens([ordem])).get(String(ordem.id))
  const centroPorId = new Map(
    ((centros.data ?? []) as CentroCusto[]).map((c) => [c.id, c])
  )

  const compraObs = (
    compraRes.data as { solicitacao_observacao?: string | null } | null
  )?.solicitacao_observacao
  const compraObservacao =
    typeof compraObs === "string" && compraObs.trim() ? compraObs : null

  // Contrato vinculado: contrato geral tem precedência; senão, locação de
  // veículo — ambos exibidos no mesmo espaço.
  let contratoVinculado: ContratoResumo | null = null
  if (contratoRes.data) {
    const c = contratoRes.data as Omit<ContratoResumo, "origem">
    contratoVinculado = { ...c, origem: "contrato" }
  } else if (aluguelRes.data) {
    const a = aluguelRes.data as {
      id: string
      numero_contrato_locadora: string | null
      finalidade: string | null
      vigencia_inicio: string | null
      vigencia_termino: string | null
      finalizado: boolean | null
      arquivo_contrato_url: string | null
    }
    contratoVinculado = {
      id: a.id,
      codigo: a.numero_contrato_locadora,
      objeto: a.finalidade,
      vigencia_inicio: a.vigencia_inicio,
      vigencia_termino: a.vigencia_termino,
      ativo: a.finalizado === null ? null : !a.finalizado,
      arquivo_contrato: a.arquivo_contrato_url,
      origem: "aluguel",
    }
  }

  const projetoVinculado = (projetoRes.data ?? null) as ProjetoResumo | null

  return {
    ordem: ordem as DetalheOrdem["ordem"],
    favorecido: favorecido?.nome ?? null,
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
    contratoVinculado,
    projetoVinculado,
    compraObservacao,
  }
}

// ── Centros de custo ───────────────────────────────────────────────────────

/** Conta de pagamento do plano de contas: tipo "Ativo - Pagamento" (caixa, bancos), com as grafias do legado. */
export function ehContaDePagamento(tipo: string | null): boolean {
  return /pagamento/i.test(tipo ?? "")
}

/**
 * Centros que podem ser o DÉBITO de um pagamento (de onde o dinheiro sai):
 * contas de pagamento usáveis, mais os centros ligados às contas bancárias de
 * remessa e ao caixa (configuração do Financeiro). O débito já gravado na
 * ordem continua na lista. Plano de contas sem nenhuma conta de pagamento:
 * todas as usáveis, para não travar o pagamento.
 */
export async function listarCentrosDeDebito(atualId: string | null = null): Promise<CentroCusto[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [centros, contas, config] = await Promise.all([
    listarCentrosCusto(),
    admin.from("financeiro_contas_bancarias").select("centro_custo_id").eq("emp_proprietaria_id", emp).eq("ativa", true),
    admin.from("financeiro_config").select("centro_custo_caixa_id").eq("emp_proprietaria_id", emp).maybeSingle(),
  ])
  const ligados = new Set(
    [...(contas.data ?? []).map((c) => c.centro_custo_id), config.data?.centro_custo_caixa_id].filter(
      (v): v is string => typeof v === "string" && v !== ""
    )
  )
  const usaveis = centros.filter((c) => c.usavel !== false)
  const temPlanoDePagamento = usaveis.some((c) => ehContaDePagamento(c.tipo_da_conta))
  const base = temPlanoDePagamento
    ? usaveis.filter((c) => ehContaDePagamento(c.tipo_da_conta) || ligados.has(c.id))
    : usaveis
  const atual = atualId && !base.some((c) => c.id === atualId) ? centros.find((c) => c.id === atualId) : undefined
  return atual ? [...base, atual] : base
}

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


/**
 * URL do anexo que faz papel de nota fiscal na ordem. Três origens: URL legada
 * do Bubble (passa direto); `ordens/…` no bucket `comprovantes` (contracheque
 * da folha de pagamento); demais caminhos, notas das compras no bucket
 * `compras`.
 */
export async function urlNotaFiscalOrdem(valor: unknown): Promise<string | null> {
  if (typeof valor !== "string" || !valor.trim()) return null
  if (/^https?:\/\//.test(valor)) return valor
  if (valor.startsWith("//")) return `https:${valor}`
  const admin = await createAdminClient()
  const { data } = await admin.storage
    .from(valor.startsWith("ordens/") ? "comprovantes" : "compras")
    .createSignedUrl(valor, 3600)
  return data?.signedUrl ?? null
}
