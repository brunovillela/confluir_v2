import "server-only"
import { esquemaAusente, nomesDosUsuarios } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import {
  contaDoGasto,
  listarContasDiaria,
  type QuadroDiaria,
} from "@/lib/db/diarias-config"
import {
  despesasDasSolicitacoes,
  somaDespesas,
  type DespesaDiaria,
} from "@/lib/db/diarias-despesas"
import { criarNotificacao } from "@/lib/db/notificacoes"
import { enviarPushTelegram } from "@/lib/db/telegram"
import {
  baixarCobrancaComoDiaria,
  cobrancasDiariaPendentes,
  reverterBaixaCobrancaDiaria,
  type CobrancaDiariaPendente,
} from "@/lib/db/veiculos"
import { enviarEmail } from "@/lib/email"
import { SITE_URL } from "@/lib/env"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Diárias — pagamento avulso que o funcionário SOLICITA por uma atividade
 * específica (ex.: viagem ao Rio de Janeiro com pernoite). Um avaliador
 * (pessoal_gestao | pessoal_diarias) aprova ou reprova; a aprovação gera uma
 * ordem de pagamento direta ao funcionário (fora da folha, paga a qualquer
 * tempo pelo financeiro).
 *
 * Tipos vivem em `financeiro_diarias` (migrada VAZIA do Bubble; enum legado
 * `diaria` + colunas novas nome/ativa via supabase/diarias.sql). As
 * solicitações vivem em `pessoal_diarias_solicitacoes` (tabela nova do mesmo
 * SQL) — as leituras degradam com `disponivel: false` até o SQL rodar.
 */

export const SITUACOES_DIARIA = [
  "aguardando",
  "aprovada",
  "reprovada",
  "cancelada",
] as const

export type SituacaoDiaria = (typeof SITUACOES_DIARIA)[number]

export type TipoDiaria = {
  id: string
  /** Nome livre; tipos legados sem nome caem no enum `diaria`. */
  nome: string
  /** Para qual quadro vale: funcionario | diretor | ambos (padrão dos antigos). */
  quadro: "funcionario" | "diretor" | "ambos"
  /** Categoria (enum legado `diaria`): Nacional | Internacional | Local | Outro. */
  categoria: string | null
  valor_reembolso: number | null
  ativa: boolean
  descricao: string | null
  permanente: boolean
  /** Quem pode solicitar este tipo; vazio = todos (histórico do Bubble). */
  usuariosAutorizados: string[]
}

/**
 * O tipo vale para a pessoa? Lista vazia libera para todos. `quadro` filtra
 * pela condição em que ela recebe — os tipos antigos são de funcionário.
 */
export function tipoDiariaLiberado(
  tipo: TipoDiaria,
  usuarioId: string,
  quadro?: QuadroDiaria
): boolean {
  if (quadro && tipo.quadro !== "ambos" && tipo.quadro !== quadro) return false
  return tipo.usuariosAutorizados.length === 0 || tipo.usuariosAutorizados.includes(usuarioId)
}

export async function listarTiposDiaria(): Promise<{
  disponivel: boolean
  tipos: TipoDiaria[]
}> {
  const admin = await createAdminClient()
  // select('*') tolera o banco sem as colunas novas (nome/ativa).
  const { data, error } = await admin
    .from("financeiro_diarias")
    .select("*")
    .order("created_at", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, tipos: [] }
    throw new Error(`Falha ao listar tipos de diária: ${error.message}`)
  }
  return {
    disponivel: true,
    tipos: (data ?? [])
      .map((t) => ({
        id: String(t.id),
        nome: String(t.nome ?? t.diaria ?? "(sem nome)"),
        quadro: (["funcionario", "diretor", "ambos"] as const).includes(
          t.quadro as "funcionario"
        )
          ? (t.quadro as TipoDiaria["quadro"])
          : "funcionario",
        categoria: (t.diaria as string | null) ?? null,
        valor_reembolso: (t.valor_reembolso as number | null) ?? null,
        ativa: t.ativa !== false,
        descricao: (t.descricao as string | null) ?? null,
        permanente: t.permanente === true,
        usuariosAutorizados: Array.isArray(t.usuarios_autorizados)
          ? (t.usuarios_autorizados as string[])
          : [],
      }))
      // Dropdown: ordem alfabética (padrão do sistema, DESIGN.md).
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  }
}

export type SolicitacaoDiaria = {
  id: string
  funcionario_id: string | null
  funcionarioNome: string | null
  /** Em que condição a pessoa recebe — decide a conta contábil e quem avalia. */
  beneficiarioTipo: QuadroDiaria
  departamentoId: string | null
  departamentoNome: string | null
  /** Quem lançou, quando não foi o beneficiário (a secretaria pelo diretor). */
  solicitanteId: string | null
  solicitanteNome: string | null
  /** Despesas extras anexadas (hospedagem, alimentação, passagem). */
  despesas: DespesaDiaria[]
  valorDespesas: number
  diaria_id: string | null
  tipoNome: string | null
  quantidade: number | null
  motivo: string | null
  data_inicio: string | null
  data_termino: string | null
  situacao: SituacaoDiaria
  valor_unitario: number | null
  valor_total: number | null
  avaliador_id: string | null
  avaliadorNome: string | null
  avaliacao_data: string | null
  avaliacao_observacao: string | null
  ordem_pagamento_id: string | null
  ordemCodigo: string | null
  ordemSituacao: string | null
  created_at: string | null
}

/**
 * `select('*')` porque as colunas novas (beneficiario_tipo, departamento_id,
 * solicitante_id) só existem depois de supabase/diarias-diretoria.sql — pedir
 * coluna ausente derruba a leitura inteira.
 */
const SELECT_SOLICITACAO = "*"

async function normalizarSolicitacoes(
  brutas: Record<string, unknown>[]
): Promise<SolicitacaoDiaria[]> {
  const admin = await createAdminClient()
  const pessoas = [
    ...new Set(
      brutas
        .flatMap((s) => [s.funcionario_id, s.avaliador_id, s.solicitante_id])
        .filter((v): v is string => Boolean(v))
        .map(String)
    ),
  ]
  const deptoIds = [
    ...new Set(
      brutas.map((s) => s.departamento_id).filter((v): v is string => Boolean(v))
    ),
  ]
  const tipoIds = [
    ...new Set(
      brutas.map((s) => s.diaria_id).filter((v): v is string => Boolean(v))
    ),
  ]
  const ordemIds = [
    ...new Set(
      brutas
        .map((s) => s.ordem_pagamento_id)
        .filter((v): v is string => Boolean(v))
    ),
  ]

  const [nomes, tipos, ordens, deptos, despesas] = await Promise.all([
    nomesDosUsuarios(pessoas),
    tipoIds.length
      ? admin.from("financeiro_diarias").select("*").in("id", tipoIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ordemIds.length
      ? admin
          .from("ordens_pagamento")
          .select("id, codigo, situacao")
          .in("id", ordemIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    deptoIds.length
      ? admin.from("empresa_departamentos").select("id, departamento").in("id", deptoIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    despesasDasSolicitacoes(brutas.map((s) => String(s.id))),
  ])

  const nomeDepto = new Map(
    ((deptos.data ?? []) as Record<string, unknown>[]).map((d) => [
      String(d.id),
      String(d.departamento ?? "(sem nome)"),
    ])
  )

  const nomeTipo = new Map(
    ((tipos.data ?? []) as Record<string, unknown>[]).map((t) => [
      String(t.id),
      String(t.nome ?? t.diaria ?? "(sem nome)"),
    ])
  )
  const ordem = new Map(
    ((ordens.data ?? []) as Record<string, unknown>[]).map((o) => [
      String(o.id),
      { codigo: (o.codigo as string | null) ?? null, situacao: (o.situacao as string | null) ?? null },
    ])
  )

  return brutas.map((s) => {
    const daSolicitacao = despesas.get(String(s.id)) ?? []
    return {
    id: String(s.id),
    funcionario_id: (s.funcionario_id as string | null) ?? null,
    funcionarioNome: s.funcionario_id
      ? (nomes.get(String(s.funcionario_id)) ?? null)
      : null,
    beneficiarioTipo: s.beneficiario_tipo === "diretor" ? "diretor" : "funcionario",
    departamentoId: (s.departamento_id as string | null) ?? null,
    departamentoNome: s.departamento_id
      ? (nomeDepto.get(String(s.departamento_id)) ?? null)
      : null,
    solicitanteId: (s.solicitante_id as string | null) ?? null,
    solicitanteNome: s.solicitante_id
      ? (nomes.get(String(s.solicitante_id)) ?? null)
      : null,
    despesas: daSolicitacao,
    valorDespesas: somaDespesas(daSolicitacao),
    diaria_id: (s.diaria_id as string | null) ?? null,
    tipoNome: s.diaria_id ? (nomeTipo.get(String(s.diaria_id)) ?? null) : null,
    quantidade: (s.quantidade as number | null) ?? null,
    motivo: (s.motivo as string | null) ?? null,
    data_inicio: (s.data_inicio as string | null) ?? null,
    data_termino: (s.data_termino as string | null) ?? null,
    situacao: (s.situacao as SituacaoDiaria) ?? "aguardando",
    valor_unitario: (s.valor_unitario as number | null) ?? null,
    valor_total: (s.valor_total as number | null) ?? null,
    avaliador_id: (s.avaliador_id as string | null) ?? null,
    avaliadorNome: s.avaliador_id
      ? (nomes.get(String(s.avaliador_id)) ?? null)
      : null,
    avaliacao_data: (s.avaliacao_data as string | null) ?? null,
    avaliacao_observacao: (s.avaliacao_observacao as string | null) ?? null,
    ordem_pagamento_id: (s.ordem_pagamento_id as string | null) ?? null,
    ordemCodigo: s.ordem_pagamento_id
      ? (ordem.get(String(s.ordem_pagamento_id))?.codigo ?? null)
      : null,
    ordemSituacao: s.ordem_pagamento_id
      ? (ordem.get(String(s.ordem_pagamento_id))?.situacao ?? null)
      : null,
    created_at: (s.created_at as string | null) ?? null,
    }
  })
}

/**
 * Solicitações do painel. `quadro` separa as portas: Pessoal lista as de
 * funcionário, Diretoria as da diretoria. Sem filtro, vêm as duas (é o que o
 * Financeiro precisa para somar).
 */
export async function listarSolicitacoesDiaria(
  filtro: { quadro?: QuadroDiaria; beneficiarioId?: string } = {}
): Promise<{
  disponivel: boolean
  solicitacoes: SolicitacaoDiaria[]
}> {
  const admin = await createAdminClient()
  let query = admin.from("pessoal_diarias_solicitacoes").select(SELECT_SOLICITACAO)
  if (filtro.beneficiarioId) query = query.eq("funcionario_id", filtro.beneficiarioId)
  const { data, error } = await query.order("created_at", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, solicitacoes: [] }
    throw new Error(`Falha ao listar solicitações: ${error.message}`)
  }
  // Filtra pelo quadro DEPOIS de normalizar: antes do SQL da diretoria a
  // coluna não existe e tudo é de funcionário.
  const solicitacoes = await normalizarSolicitacoes(
    (data ?? []) as Record<string, unknown>[]
  )
  return {
    disponivel: true,
    solicitacoes: filtro.quadro
      ? solicitacoes.filter((s) => s.beneficiarioTipo === filtro.quadro)
      : solicitacoes,
  }
}

export async function minhasSolicitacoesDiaria(usuarioId: string): Promise<{
  disponivel: boolean
  solicitacoes: SolicitacaoDiaria[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_diarias_solicitacoes")
    .select(SELECT_SOLICITACAO)
    .eq("funcionario_id", usuarioId)
    .order("created_at", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, solicitacoes: [] }
    throw new Error(`Falha ao listar suas solicitações: ${error.message}`)
  }
  return {
    disponivel: true,
    solicitacoes: await normalizarSolicitacoes(
      (data ?? []) as Record<string, unknown>[]
    ),
  }
}

export async function buscarSolicitacaoDiaria(
  id: string
): Promise<SolicitacaoDiaria | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_diarias_solicitacoes")
    .select(SELECT_SOLICITACAO)
    .eq("id", id)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao buscar solicitação: ${error.message}`)
  }
  if (!data) return null
  const [linha] = await normalizarSolicitacoes([
    data as Record<string, unknown>,
  ])
  return linha ?? null
}

// ── Solicitação (funcionário) ──────────────────────────────────────────────

export type NovaSolicitacaoDiaria = {
  funcionario_id: string
  diaria_id: string
  quantidade: number
  motivo: string
  data_inicio: string | null
  data_termino: string | null
  /** Condição em que a pessoa recebe; padrão funcionário. */
  beneficiario_tipo?: QuadroDiaria
  /** Departamento que banca a atividade (dá a conta da diária de diretor). */
  departamento_id?: string | null
  /** Quem lançou, quando não foi o próprio beneficiário. */
  solicitante_id?: string | null
}

export async function criarSolicitacaoDiaria(
  nova: NovaSolicitacaoDiaria
): Promise<{ erro?: string; id?: string }> {
  const { disponivel, tipos } = await listarTiposDiaria()
  if (!disponivel) {
    return { erro: "Diárias ainda não configuradas — rode supabase/diarias.sql." }
  }
  const quadro: QuadroDiaria = nova.beneficiario_tipo ?? "funcionario"
  const tipo = tipos.find((t) => t.id === nova.diaria_id)
  if (!tipo || !tipo.ativa) return { erro: "Escolha um tipo de diária válido." }
  if (!tipoDiariaLiberado(tipo, nova.funcionario_id, quadro)) {
    return { erro: "Este tipo de diária é restrito a outras pessoas." }
  }

  const valorUnitario = tipo.valor_reembolso
  const admin = await createAdminClient()
  const basicos = {
    funcionario_id: nova.funcionario_id,
    diaria_id: nova.diaria_id,
    quantidade: nova.quantidade,
    motivo: nova.motivo,
    data_inicio: nova.data_inicio,
    data_termino: nova.data_termino,
    situacao: "aguardando",
    valor_unitario: valorUnitario,
    valor_total:
      valorUnitario === null
        ? null
        : Math.round(valorUnitario * nova.quantidade * 100) / 100,
    emp_proprietaria_id: await tenantAtual(),
  }
  const comColunasNovas: Record<string, unknown> = {
    ...basicos,
    beneficiario_tipo: quadro,
    departamento_id: nova.departamento_id ?? null,
    solicitante_id: nova.solicitante_id ?? null,
  }
  const inserir = (novas: boolean) =>
    admin
      .from("pessoal_diarias_solicitacoes")
      .insert(novas ? comColunasNovas : (basicos as Record<string, unknown>))
      .select("id")
      .maybeSingle()

  // PGRST204 = coluna desconhecida: o SQL da diretoria ainda não rodou. A
  // solicitação de funcionário continua funcionando (sem as colunas novas).
  let { data: criada, error } = await inserir(true)
  if (error?.code === "PGRST204" && quadro === "funcionario") {
    ;({ data: criada, error } = await inserir(false))
  }
  if (error) {
    if (esquemaAusente(error)) {
      return { erro: "Diárias ainda não configuradas — rode supabase/diarias.sql." }
    }
    return { erro: `Não foi possível solicitar: ${error.message}` }
  }
  return { id: criada ? String((criada as { id: string }).id) : undefined }
}

/** Cancela a PRÓPRIA solicitação, apenas enquanto aguardando avaliação. */
export async function cancelarSolicitacaoDiaria(
  id: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_diarias_solicitacoes")
    .update({ situacao: "cancelada", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("funcionario_id", usuarioId)
    .eq("situacao", "aguardando")
    .select("id")
  if (error) return { erro: `Não foi possível cancelar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "Solicitação não encontrada ou já avaliada." }
  }
  return {}
}

// ── Avaliação (gestão) ─────────────────────────────────────────────────────

/** Código no padrão legado das ordens (AAAA.MMDD.HHMM.SSNN, horário de SP). */
function gerarCodigoOrdem(): string {
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

async function notificarAvaliacaoDiaria(
  solicitacao: SolicitacaoDiaria,
  aprovada: boolean,
  observacao: string | null,
  ordemCodigo?: string
): Promise<void> {
  if (!solicitacao.funcionario_id) return
  const resumo = `${solicitacao.tipoNome ?? "diária"}${solicitacao.quantidade ? ` × ${solicitacao.quantidade}` : ""}`
  const mensagem = aprovada
    ? `Sua solicitação de diária (${resumo}) foi APROVADA${solicitacao.valor_total !== null ? ` no valor de ${formatarMoeda(solicitacao.valor_total)}` : ""}. Ordem de pagamento ${ordemCodigo ?? ""} gerada — o pagamento segue o fluxo do financeiro.`
    : `Sua solicitação de diária (${resumo}) foi reprovada.${observacao ? ` Motivo: ${observacao}` : ""}`

  try {
    await criarNotificacao({
      usuarioId: solicitacao.funcionario_id,
      texto: mensagem,
    })
  } catch (e) {
    console.error("Falha ao notificar avaliação de diária:", e)
  }
  await enviarPushTelegram(solicitacao.funcionario_id, mensagem, "diarias")

  const admin = await createAdminClient()
  const { data: usuario } = await admin
    .from("usuarios")
    .select("email, nome_completo, nome_guerra")
    .eq("id", solicitacao.funcionario_id)
    .maybeSingle()
  if (!usuario?.email) return
  const nome = usuario.nome_completo ?? usuario.nome_guerra ?? null
  await enviarEmail({
    email: usuario.email,
    nome,
    assunto: `Diária ${aprovada ? "aprovada" : "reprovada"} — {ENTIDADE}`,
    html: `<p>Olá${nome ? `, ${String(nome).split(" ")[0]}` : ""}!</p><p>${mensagem}</p><p>Acompanhe em <a href="${SITE_URL}/painel/perfil/diarias">${SITE_URL}/painel/perfil/diarias</a>.</p><p>Confluir — {ENTIDADE}</p>`,
  })
}

/**
 * Aprova ou reprova uma solicitação AGUARDANDO. Aprovação gera a ordem de
 * pagamento direta ao funcionário (tipo 'Diária', situação 'Em autorização'
 * — segue autorização e pagamento no fluxo normal do financeiro; centro de
 * custo fica para o financeiro na autorização, como nas demais ordens).
 */
/** True se a tabela de descontos existe (feature de desconto disponível). */
async function descontoDisponivel(
  admin: Awaited<ReturnType<typeof createAdminClient>>
): Promise<boolean> {
  const { error } = await admin
    .from("pessoal_diarias_descontos")
    .select("id", { head: true, count: "exact" })
    .limit(1)
  return !error
}

export async function avaliarSolicitacaoDiaria(
  id: string,
  avaliadorId: string,
  aprovar: boolean,
  observacao: string | null,
  aplicarDescontos = true
): Promise<{ erro?: string }> {
  const solicitacao = await buscarSolicitacaoDiaria(id)
  if (!solicitacao) return { erro: "Solicitação não encontrada." }
  if (solicitacao.situacao !== "aguardando") {
    return { erro: "Esta solicitação já foi avaliada ou cancelada." }
  }
  if (aprovar && solicitacao.valor_total === null && solicitacao.valorDespesas === 0) {
    return {
      erro: "O tipo desta diária não tem valor de reembolso — defina o valor na tabela de tipos e peça uma nova solicitação.",
    }
  }

  const admin = await createAdminClient()
  let ordemId: string | null = null
  let codigo: string | undefined
  // Infrações do infrator abatidas nesta diária (para a trilha e o rollback).
  const abatidas: CobrancaDiariaPendente[] = []
  const desfazerBaixas = async () => {
    for (const c of abatidas) await reverterBaixaCobrancaDiaria(c.id)
  }

  if (aprovar) {
    codigo = gerarCodigoOrdem()

    // Abate infrações pendentes do infrator na forma "diária", até o valor da
    // diária. Reclama cada infração (pendente→baixada) ANTES de calcular o
    // líquido, para não descontar valor que outra via já baixou.
    if (
      aplicarDescontos &&
      solicitacao.funcionario_id &&
      (await descontoDisponivel(admin))
    ) {
      const pendentes = await cobrancasDiariaPendentes(
        solicitacao.funcionario_id
      )
      let restante = solicitacao.valor_total ?? 0
      for (const c of pendentes) {
        if (c.valor <= 0 || c.valor > restante) continue
        const { erro } = await baixarCobrancaComoDiaria(c.id, {
          avaliadorId,
          referencia: `Descontada na diária (ordem ${codigo}).`,
        })
        if (!erro) {
          abatidas.push(c)
          restante -= c.valor
        }
      }
    }
    const totalDesconto = abatidas.reduce((s, c) => s + c.valor, 0)
    // A diária entra líquida (as infrações saem dela); as despesas extras vão
    // por inteiro, cada uma na sua conta.
    const liquidoDiaria = (solicitacao.valor_total ?? 0) - totalDesconto
    const liquido = liquidoDiaria + solicitacao.valorDespesas

    // Contas: quadro × departamento × tipo de gasto. Sem de-para configurado,
    // a ordem sai sem conta e o financeiro classifica na autorização.
    const { contas } = await listarContasDiaria()
    const contaDiaria = contaDoGasto(
      contas,
      solicitacao.beneficiarioTipo,
      solicitacao.departamentoId,
      null
    )
    const linhasRateio: {
      centro_custo_despesa_id: string | null
      descricao: string
      valor: number
    }[] = [
      {
        centro_custo_despesa_id: contaDiaria,
        descricao: `Diária — ${solicitacao.tipoNome ?? "(sem tipo)"}`,
        valor: Math.round(liquidoDiaria * 100) / 100,
      },
      ...solicitacao.despesas.map((d) => ({
        centro_custo_despesa_id: contaDoGasto(
          contas,
          solicitacao.beneficiarioTipo,
          solicitacao.departamentoId,
          d.tipoId
        ),
        descricao: [d.tipoNome ?? "Despesa", d.descricao].filter(Boolean).join(" — "),
        valor: d.valor,
      })),
    ]

    const periodo =
      solicitacao.data_inicio &&
      `período ${formatarData(solicitacao.data_inicio)}${solicitacao.data_termino && solicitacao.data_termino !== solicitacao.data_inicio ? ` a ${formatarData(solicitacao.data_termino)}` : ""}`
    const descricao = [
      `Diária — ${solicitacao.tipoNome ?? "(sem tipo)"} × ${solicitacao.quantidade ?? 1}`,
      `(${formatarMoeda(solicitacao.valor_unitario)} cada)`,
      solicitacao.beneficiarioTipo === "diretor"
        ? `para ${solicitacao.funcionarioNome ?? "diretor(a)"} (diretoria${solicitacao.departamentoNome ? ` — ${solicitacao.departamentoNome}` : ""}).`
        : `para ${solicitacao.funcionarioNome ?? "funcionário"}.`,
      `Motivo: ${solicitacao.motivo ?? "—"}.`,
      periodo ? `${periodo}.` : null,
      solicitacao.despesas.length > 0
        ? `Com ${solicitacao.despesas.length} despesa(s) extra(s) (${formatarMoeda(solicitacao.valorDespesas)}): ${solicitacao.despesas.map((d) => d.tipoNome ?? "despesa").join(", ")}.`
        : null,
      totalDesconto > 0
        ? `Descontadas ${abatidas.length} infração(ões) de trânsito (${formatarMoeda(totalDesconto)}); valor líquido ${formatarMoeda(liquido)}.`
        : null,
    ]
      .filter(Boolean)
      .join(" ")

    const { data: ordem, error: erroOrdem } = await admin
      .from("ordens_pagamento")
      .insert({
        codigo,
        tipo: "Diária",
        descricao,
        situacao: "Em autorização",
        // valor_inicial_cobranca = valor devido LÍQUIDO (já sem as infrações),
        // somando a diária e as despesas extras.
        valor_inicial_cobranca: liquido,
        beneficiario_usuario_id: solicitacao.funcionario_id,
        // Conta PREDOMINANTE = a da diária; as despesas ficam no rateio.
        centro_custo_despesa_id: contaDiaria,
        departamento_id: solicitacao.departamentoId,
        emp_proprietaria_id: await tenantAtual(),
      })
      .select("id")
      .single()
    if (erroOrdem || !ordem) {
      await desfazerBaixas()
      return {
        erro: `Não foi possível gerar a ordem de pagamento: ${erroOrdem?.message}`,
      }
    }
    ordemId = ordem.id

    // Rateio: só quando há mais de uma linha (despesa extra). Diária sozinha
    // já está inteira no centro de custo da ordem.
    if (linhasRateio.length > 1) {
      const empId = await tenantAtual()
      const { error: erroRateio } = await admin.from("ordens_pagamento_rateio").insert(
        linhasRateio.map((l, i) => ({
          ordem_id: ordemId,
          centro_custo_despesa_id: l.centro_custo_despesa_id,
          departamento_id: solicitacao.departamentoId,
          descricao: l.descricao,
          valor: l.valor,
          ordem: i,
          emp_proprietaria_id: empId,
        }))
      )
      // Rateio é detalhe contábil: se a tabela ainda não existe, a ordem vale.
      if (erroRateio && !esquemaAusente(erroRateio)) {
        console.error("Falha ao gravar o rateio da diária:", erroRateio.message)
      }
    }
  }

  const avaliacao = {
    situacao: aprovar ? "aprovada" : "reprovada",
    avaliador_id: avaliadorId,
    avaliacao_data: new Date().toISOString(),
    avaliacao_observacao: observacao,
    ordem_pagamento_id: ordemId,
    updated_at: new Date().toISOString(),
  }
  const salvar = (comDespesas: boolean) =>
    admin
      .from("pessoal_diarias_solicitacoes")
      // valor_despesas = fotografia do que foi aprovado em despesa extra.
      .update(comDespesas ? { ...avaliacao, valor_despesas: solicitacao.valorDespesas } : avaliacao)
      .eq("id", id)
      .eq("situacao", "aguardando")
      .select("id")
  let { data: alteradas, error } = await salvar(true)
  if (error?.code === "PGRST204") ({ data: alteradas, error } = await salvar(false))
  if (error || (alteradas ?? []).length === 0) {
    // Erro ou corrida (outra pessoa avaliou): desfaz a ordem e as baixas.
    if (ordemId) await admin.from("ordens_pagamento").delete().eq("id", ordemId)
    await desfazerBaixas()
    return {
      erro: error
        ? `Não foi possível salvar a avaliação: ${error.message}`
        : "Esta solicitação já foi avaliada ou cancelada.",
    }
  }

  // Trilha dos descontos (após a aprovação confirmada).
  if (abatidas.length > 0) {
    const empId = await tenantAtual()
    await admin.from("pessoal_diarias_descontos").insert(
      abatidas.map((c) => ({
        emp_proprietaria_id: empId,
        diaria_solicitacao_id: id,
        infracao_id: c.id,
        valor: c.valor,
      }))
    )
  }

  await notificarAvaliacaoDiaria(solicitacao, aprovar, observacao, codigo)
  return {}
}

export type DescontoDiaria = {
  infracao_id: string
  valor: number
  infracaoCodigo: string | null
  descricao: string | null
  data: string | null
}

/** Infrações descontadas numa diária (para exibir no detalhe). [] se ausente. */
export async function descontosDaDiaria(
  solicitacaoId: string
): Promise<DescontoDiaria[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_diarias_descontos")
    .select("infracao_id, valor")
    .eq("diaria_solicitacao_id", solicitacaoId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return []
  const linhas = (data ?? []) as Record<string, unknown>[]
  if (linhas.length === 0) return []
  const ids = [...new Set(linhas.map((l) => String(l.infracao_id)))]
  const { data: infr } = await admin
    .from("veiculos_infracoes")
    .select("id, codigo, infracao_descricao, infracao_data")
    .in("id", ids)
  const porId = new Map(
    ((infr ?? []) as Record<string, unknown>[]).map((i) => [String(i.id), i])
  )
  return linhas.map((l) => {
    const i = porId.get(String(l.infracao_id))
    return {
      infracao_id: String(l.infracao_id),
      valor: Number(l.valor ?? 0),
      infracaoCodigo: (i?.codigo as string | null) ?? null,
      descricao: (i?.infracao_descricao as string | null) ?? null,
      data: (i?.infracao_data as string | null) ?? null,
    }
  })
}

// ── Tipos (gestão) ─────────────────────────────────────────────────────────

/** Solicitações + lançamentos do histórico que usam o tipo (bloqueiam a exclusão). */
export async function tipoDiariaEmUso(tipoId: string): Promise<number> {
  const admin = await createAdminClient()
  const [solicitacoes, lancamentos] = await Promise.all([
    admin
      .from("pessoal_diarias_solicitacoes")
      .select("id", { count: "exact", head: true })
      .eq("diaria_id", tipoId),
    admin
      .from("pessoal_diarias_lancamentos")
      .select("id", { count: "exact", head: true })
      .eq("tipo_id", tipoId),
  ])
  return (solicitacoes.error ? 0 : (solicitacoes.count ?? 0)) + (lancamentos.error ? 0 : (lancamentos.count ?? 0))
}
