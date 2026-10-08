import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Caixa — contas de dinheiro em espécie de pessoas autorizadas.
 * Ciclo: aporte lançado pelo financeiro (pendente) → responsável confirma
 * o recebimento (conta ABERTA, verba liberada) → compras em dinheiro
 * debitam a conta → responsável PRESTA CONTAS → financeiro aprova →
 * acerto de fechamento e conta FECHADA até o próximo aporte.
 * Tabelas em supabase/caixa.sql; enquanto não existirem, tudo degrada
 * com `disponivel: false`.
 */

export type SituacaoConta = "fechada" | "aberta" | "prestacao_pendente"

export type MovimentacaoCaixa = {
  id: string
  tipo: string // aporte | compra | perda | acerto
  situacao: string // pendente | confirmada | cancelada
  valor: number
  descricao: string | null
  criadaPor: string | null
  confirmada_em: string | null
  created_at: string | null
  /** Despesa lançada por outra pessoa: pendente | reconhecida | nao_reconhecida | transferida (null = não exige). */
  reconhecimento?: string | null
  reconhecimentoMotivo?: string | null
  /** Ordem de pagamento ligada (compra) e o beneficiário dela. */
  ordemId?: string | null
  ordemCodigo?: string | null
  beneficiario?: string | null
}

export type PrestacaoCaixa = {
  id: string
  situacao: string // aguardando | aprovada | rejeitada
  observacao: string | null
  observacao_financeiro: string | null
  saldo_declarado: number | null
  decidida_em: string | null
  created_at: string | null
}

export type OcorrenciaCaixa = {
  id: string
  contaId: string
  contaNome: string | null
  responsavel: string | null
  descricao: string
  valor: number | null
  situacao: string // aberta | em_investigacao | resolvida
  resolucao: string | null
  resolvida_em: string | null
  created_at: string | null
}

export type ContaCaixa = {
  id: string
  nome: string
  situacao: SituacaoConta
  ativa: boolean
  responsavelId: string
  responsavel: string | null
  saldo: number
  aportePendente: number
  prestacaoAguardando: boolean
  ocorrenciasAbertas: number
  created_at: string | null
}

export type DetalheConta = {
  conta: ContaCaixa
  extrato: MovimentacaoCaixa[]
  prestacoes: PrestacaoCaixa[]
  ocorrencias: OcorrenciaCaixa[]
}

/** PGRST205/42P01 = tabelas ainda não criadas (rodar supabase/caixa.sql). */
function tabelaAusente(erro: { code?: string } | null): boolean {
  return erro?.code === "PGRST205" || erro?.code === "42P01"
}

/**
 * Saldo disponível = créditos confirmados − débitos. Despesa que o
 * responsável NÃO reconheceu não sai do caixa dele (o valor volta) — fica
 * esperando quem lançou transferir para a conta certa.
 */
export function calcularSaldo(
  movs: { tipo: string; situacao: string; valor: number; reconhecimento?: string | null }[]
): number {
  let saldo = 0
  for (const m of movs) {
    if (m.situacao !== "confirmada") continue
    if (m.reconhecimento === "nao_reconhecida") continue
    if (m.tipo === "aporte") saldo += Number(m.valor)
    else saldo -= Number(m.valor)
  }
  return Math.round(saldo * 100) / 100
}

async function nomesDeUsuarios(ids: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  if (ids.length === 0) return nomes
  const admin = await createAdminClient()
  for (let de = 0; de < ids.length; de += 100) {
    const { data } = await admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra")
      .in("id", ids.slice(de, de + 100))
    for (const u of data ?? []) {
      const nome = u.nome_guerra ?? u.nome_completo
      if (nome) nomes.set(u.id, nome)
    }
  }
  return nomes
}

type MovBruta = {
  id: string
  conta_id: string
  tipo: string
  situacao: string
  valor: number
  descricao: string | null
  criada_por_usuario_id: string | null
  confirmada_em: string | null
  created_at: string | null
  reconhecimento?: string | null
  reconhecimento_motivo?: string | null
  ordem_pagamento_id?: string | null
}

function txtCaixa(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/**
 * Beneficiário de cada ordem (fornecedor da ordem, fornecedor beneficiário,
 * usuário beneficiário ou nome avulso) e o código — extrato do caixa e busca
 * de "Vincular ordem de pagamento".
 */
export async function beneficiariosDasOrdens(
  ordemIds: string[]
): Promise<Map<string, { codigo: string | null; beneficiario: string | null }>> {
  const mapa = new Map<string, { codigo: string | null; beneficiario: string | null }>()
  const ids = [...new Set(ordemIds.filter(Boolean))]
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  const { data: ordens } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, fornecedor_id, beneficiario_fornecedor_id, beneficiario_usuario_id, beneficiario_nome_avulso")
    .in("id", ids)
  const lista = ordens ?? []
  const empIds = [...new Set(lista.flatMap((o) => [o.fornecedor_id, o.beneficiario_fornecedor_id]).filter((v): v is string => Boolean(v)))]
  const usuIds = [...new Set(lista.map((o) => o.beneficiario_usuario_id).filter((v): v is string => Boolean(v)))]
  const nomes = new Map<string, string>()
  if (empIds.length) {
    const { data } = await admin.from("empresa").select("id, empresa, nome_fantasia, nome_razao").in("id", empIds)
    for (const e of data ?? []) {
      const n = txtCaixa(e.nome_fantasia) ?? txtCaixa(e.empresa) ?? txtCaixa(e.nome_razao)
      if (n) nomes.set(String(e.id), n)
    }
  }
  if (usuIds.length) {
    const { data } = await admin.from("usuarios").select("id, nome_completo, nome_guerra").in("id", usuIds)
    for (const u of data ?? []) {
      const n = txtCaixa(u.nome_completo) ?? txtCaixa(u.nome_guerra)
      if (n) nomes.set(String(u.id), n)
    }
  }
  for (const o of lista) {
    mapa.set(String(o.id), {
      codigo: txtCaixa(o.codigo),
      beneficiario:
        (o.beneficiario_fornecedor_id && nomes.get(String(o.beneficiario_fornecedor_id))) ||
        (o.fornecedor_id && nomes.get(String(o.fornecedor_id))) ||
        (o.beneficiario_usuario_id && nomes.get(String(o.beneficiario_usuario_id))) ||
        txtCaixa(o.beneficiario_nome_avulso),
    })
  }
  return mapa
}

/** Todas as contas com saldo e pendências (área do financeiro). */
export async function listarContasCaixa(): Promise<{
  disponivel: boolean
  contas: ContaCaixa[]
}> {
  const admin = await createAdminClient()

  const contasRes = await admin
    .from("caixa_contas")
    .select(
      "id, nome, situacao, ativa, responsavel_usuario_id, created_at"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: true })
  if (contasRes.error) {
    if (tabelaAusente(contasRes.error)) {
      return { disponivel: false, contas: [] }
    }
    throw new Error(`Falha ao listar contas: ${contasRes.error.message}`)
  }
  const brutas = contasRes.data ?? []
  if (brutas.length === 0) return { disponivel: true, contas: [] }

  const ids = brutas.map((c) => c.id)
  const [movsRes, prestRes, ocorRes, nomes] = await Promise.all([
    admin
      .from("caixa_movimentacoes")
      .select("conta_id, tipo, situacao, valor, reconhecimento")
      .in("conta_id", ids),
    admin
      .from("caixa_prestacoes")
      .select("conta_id")
      .in("conta_id", ids)
      .eq("situacao", "aguardando"),
    admin
      .from("caixa_ocorrencias")
      .select("conta_id")
      .in("conta_id", ids)
      .neq("situacao", "resolvida"),
    nomesDeUsuarios([...new Set(brutas.map((c) => c.responsavel_usuario_id))]),
  ])

  const movsPorConta = new Map<string, MovBruta[]>()
  for (const m of (movsRes.data ?? []) as MovBruta[]) {
    if (!movsPorConta.has(m.conta_id)) movsPorConta.set(m.conta_id, [])
    movsPorConta.get(m.conta_id)!.push(m)
  }
  const prestPendentes = new Set(
    (prestRes.data ?? []).map((p) => p.conta_id as string)
  )
  const ocorrenciasPorConta = new Map<string, number>()
  for (const o of ocorRes.data ?? []) {
    ocorrenciasPorConta.set(
      o.conta_id,
      (ocorrenciasPorConta.get(o.conta_id) ?? 0) + 1
    )
  }

  const contas: ContaCaixa[] = brutas.map((c) => {
    const movs = movsPorConta.get(c.id) ?? []
    return {
      id: c.id,
      nome: c.nome,
      situacao: c.situacao as SituacaoConta,
      ativa: c.ativa,
      responsavelId: c.responsavel_usuario_id,
      responsavel: nomes.get(c.responsavel_usuario_id) ?? null,
      saldo: calcularSaldo(movs),
      aportePendente: movs
        .filter((m) => m.tipo === "aporte" && m.situacao === "pendente")
        .reduce((s, m) => s + Number(m.valor), 0),
      prestacaoAguardando: prestPendentes.has(c.id),
      ocorrenciasAbertas: ocorrenciasPorConta.get(c.id) ?? 0,
      created_at: c.created_at,
    }
  })

  return { disponivel: true, contas }
}

/** Conta + extrato + prestações + ocorrências (página da conta). */
export async function detalheContaCaixa(
  id: string
): Promise<DetalheConta | null> {
  const admin = await createAdminClient()

  const { data: conta, error } = await admin
    .from("caixa_contas")
    .select("id, nome, situacao, ativa, responsavel_usuario_id, created_at")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error && !tabelaAusente(error)) {
    throw new Error(`Falha ao carregar a conta: ${error.message}`)
  }
  if (!conta) return null

  const [movsRes, prestRes, ocorRes] = await Promise.all([
    // select("*"): as colunas do reconhecimento podem ainda não existir.
    admin
      .from("caixa_movimentacoes")
      .select("*")
      .eq("conta_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("caixa_prestacoes")
      .select(
        "id, situacao, observacao, observacao_financeiro, saldo_declarado, decidida_em, created_at"
      )
      .eq("conta_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("caixa_ocorrencias")
      .select(
        "id, conta_id, descricao, valor, situacao, resolucao, relatada_por_usuario_id, resolvida_em, created_at"
      )
      .eq("conta_id", id)
      .order("created_at", { ascending: false }),
  ])

  const movs = (movsRes.data ?? []) as MovBruta[]
  const nomes = await nomesDeUsuarios([
    ...new Set(
      [
        conta.responsavel_usuario_id,
        ...movs.map((m) => m.criada_por_usuario_id),
        ...(ocorRes.data ?? []).map((o) => o.relatada_por_usuario_id),
      ].filter((v): v is string => Boolean(v))
    ),
  ])

  const responsavel = nomes.get(conta.responsavel_usuario_id) ?? null
  const dasOrdens = await beneficiariosDasOrdens(
    movs.map((m) => m.ordem_pagamento_id).filter((v): v is string => Boolean(v))
  )

  return {
    conta: {
      id: conta.id,
      nome: conta.nome,
      situacao: conta.situacao as SituacaoConta,
      ativa: conta.ativa,
      responsavelId: conta.responsavel_usuario_id,
      responsavel,
      saldo: calcularSaldo(movs),
      aportePendente: movs
        .filter((m) => m.tipo === "aporte" && m.situacao === "pendente")
        .reduce((s, m) => s + Number(m.valor), 0),
      prestacaoAguardando: (prestRes.data ?? []).some(
        (p) => p.situacao === "aguardando"
      ),
      ocorrenciasAbertas: (ocorRes.data ?? []).filter(
        (o) => o.situacao !== "resolvida"
      ).length,
      created_at: conta.created_at,
    },
    extrato: movs.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      situacao: m.situacao,
      valor: Number(m.valor),
      descricao: m.descricao,
      criadaPor: m.criada_por_usuario_id
        ? (nomes.get(m.criada_por_usuario_id) ?? null)
        : null,
      confirmada_em: m.confirmada_em,
      created_at: m.created_at,
      reconhecimento: m.reconhecimento ?? null,
      reconhecimentoMotivo: m.reconhecimento_motivo ?? null,
      ordemId: m.ordem_pagamento_id ?? null,
      ordemCodigo: m.ordem_pagamento_id ? (dasOrdens.get(m.ordem_pagamento_id)?.codigo ?? null) : null,
      beneficiario: m.ordem_pagamento_id ? (dasOrdens.get(m.ordem_pagamento_id)?.beneficiario ?? null) : null,
    })),
    prestacoes: (prestRes.data ?? []).map((p) => ({
      id: p.id,
      situacao: p.situacao,
      observacao: p.observacao,
      observacao_financeiro: p.observacao_financeiro,
      saldo_declarado:
        p.saldo_declarado === null ? null : Number(p.saldo_declarado),
      decidida_em: p.decidida_em,
      created_at: p.created_at,
    })),
    ocorrencias: (ocorRes.data ?? []).map((o) => ({
      id: o.id,
      contaId: o.conta_id,
      contaNome: conta.nome,
      responsavel: o.relatada_por_usuario_id
        ? (nomes.get(o.relatada_por_usuario_id) ?? null)
        : responsavel,
      descricao: o.descricao,
      valor: o.valor === null ? null : Number(o.valor),
      situacao: o.situacao,
      resolucao: o.resolucao,
      resolvida_em: o.resolvida_em,
      created_at: o.created_at,
    })),
  }
}

/** Conta do usuário logado (interface "Meu caixa"). */
/** Check leve p/ a sidebar: o usuário é responsável por alguma conta ativa? */
export async function usuarioTemCaixa(usuarioId: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("caixa_contas")
    .select("id")
    .eq("responsavel_usuario_id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ativa", true)
    .limit(1)
    .maybeSingle()
  if (error) return false // tabela ausente / sem acesso → sem caixa
  return Boolean(data)
}

export async function contaDoUsuario(
  usuarioId: string
): Promise<{ disponivel: boolean; detalhe: DetalheConta | null }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("caixa_contas")
    .select("id")
    .eq("responsavel_usuario_id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ativa", true)
    .limit(1)
    .maybeSingle()
  if (error) {
    if (tabelaAusente(error)) return { disponivel: false, detalhe: null }
    throw new Error(`Falha ao localizar a conta: ${error.message}`)
  }
  if (!data) return { disponivel: true, detalhe: null }
  return { disponivel: true, detalhe: await detalheContaCaixa(data.id) }
}

/** Ocorrências de todas as contas (acompanhamento do financeiro). */
export async function listarOcorrencias(): Promise<{
  disponivel: boolean
  ocorrencias: OcorrenciaCaixa[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("caixa_ocorrencias")
    .select(
      "id, conta_id, descricao, valor, situacao, resolucao, relatada_por_usuario_id, resolvida_em, created_at"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) {
    if (tabelaAusente(error)) return { disponivel: false, ocorrencias: [] }
    throw new Error(`Falha ao listar ocorrências: ${error.message}`)
  }
  const brutas = data ?? []
  if (brutas.length === 0) return { disponivel: true, ocorrencias: [] }

  const contaIds = [...new Set(brutas.map((o) => o.conta_id))]
  const { data: contas } = await admin
    .from("caixa_contas")
    .select("id, nome, responsavel_usuario_id")
    .in("id", contaIds)
  const contaPorId = new Map((contas ?? []).map((c) => [c.id, c]))
  const nomes = await nomesDeUsuarios([
    ...new Set(
      [
        ...brutas.map((o) => o.relatada_por_usuario_id),
        ...(contas ?? []).map((c) => c.responsavel_usuario_id),
      ].filter((v): v is string => Boolean(v))
    ),
  ])

  return {
    disponivel: true,
    ocorrencias: brutas.map((o) => {
      const conta = contaPorId.get(o.conta_id)
      return {
        id: o.id,
        contaId: o.conta_id,
        contaNome: conta?.nome ?? null,
        responsavel: o.relatada_por_usuario_id
          ? (nomes.get(o.relatada_por_usuario_id) ?? null)
          : conta
            ? (nomes.get(conta.responsavel_usuario_id) ?? null)
            : null,
        descricao: o.descricao,
        valor: o.valor === null ? null : Number(o.valor),
        situacao: o.situacao,
        resolucao: o.resolucao,
        resolvida_em: o.resolvida_em,
        created_at: o.created_at,
      }
    }),
  }
}

/**
 * Pessoas que podem ser autorizadas a ter conta de caixa: funcionários e
 * diretores do sindicato (usuarios.vinculo_instituicao).
 */
export async function pessoasAutorizaveis(): Promise<
  { id: string; nome: string }[]
> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("vinculo_instituicao", ["Funcionário(a)", "Diretor(a)"])
    .not("inativo", "is", true)
    .not("deletado", "is", true)
    .order("nome_completo", { ascending: true })
  return (data ?? [])
    .map((u) => ({
      id: u.id,
      nome: u.nome_completo ?? u.nome_guerra ?? "(sem nome)",
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

/**
 * Contas abertas para o módulo Aquisição (opções quando o pagamento é em
 * dinheiro). Conta fechada ou em prestação NÃO aparece.
 */
export async function contasAbertasParaCompras(): Promise<
  { id: string; nome: string; responsavel: string | null; saldo: number }[]
> {
  const { disponivel, contas } = await listarContasCaixa()
  if (!disponivel) return []
  return contas
    .filter((c) => c.ativa && c.situacao === "aberta")
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      responsavel: c.responsavel,
      saldo: c.saldo,
    }))
}
