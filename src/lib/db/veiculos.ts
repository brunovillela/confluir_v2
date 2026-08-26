import "server-only"
import { esquemaAusente, hojeSP, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import { gerarCodigoProcesso } from "@/lib/db/compras"
import { criarNotificacao } from "@/lib/db/notificacoes"
import { enviarEmail } from "@/lib/email"
import { SITE_URL } from "@/lib/env"
import { formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  TIPO_ORDEM_ALUGUEL,
  TIPO_ORDEM_MULTA,
  type FormaCobranca,
  type SituacaoAgendamento,
  type SituacaoCobranca,
} from "@/lib/veiculos-constantes"

/**
 * Veículos — frota, condutores, agendamentos, abastecimentos, infrações e
 * contratos de aluguel (decisões confirmadas com o Bruno em 2026-07-19).
 *
 * • Agendamento é a SOLICITAÇÃO (só condutor autorizado com CNH válida);
 *   `veiculos_disponibilidade` é a MOVIMENTAÇÃO real de retirada/devolução.
 * • Abastecimentos novos exigem veículo + hodômetro; o legado veio sem
 *   vínculo com veículo e fica fora dos indicadores de consumo.
 * • Infração não sindical gera cobrança ao infrator (contracheque ou
 *   desconto em diárias) com baixa no Financeiro e histórico imutável
 *   (`veiculos_infracoes_historico`) para a auditoria do Conselho Fiscal.
 * • Ordens: multa = tipo legado 'Multa de trânsito'; aluguel = 'Locação de
 *   veículos - Mensalidade'; ambas nascem 'Em autorização'.
 *
 * Colunas novas vêm de supabase/veiculos.sql — as leituras degradam com
 * `disponivel: false` até o SQL rodar. Legado do Bubble: somente leitura.
 */

const AVISO_SQL =
  "Veículos ainda não configurados — rode supabase/veiculos.sql no Supabase."

// ── Auxiliares ─────────────────────────────────────────────────────────────

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

/** JSONB que pode ter vindo como string serializada na migração (padrão Bubble). */
function listaJsonb(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      const arr = JSON.parse(v)
      return Array.isArray(arr) ? arr.map(String) : []
    } catch {
      return []
    }
  }
  return []
}

async function notificarUsuario(
  usuarioId: string,
  assunto: string,
  mensagem: string,
  rota = "/painel/veiculos"
): Promise<void> {
  try {
    await criarNotificacao({ usuarioId, texto: mensagem })
  } catch (e) {
    console.error("Falha ao notificar (veículos):", e)
  }
  const admin = await createAdminClient()
  const { data: usuario } = await admin
    .from("usuarios")
    .select("email, nome_completo, nome_guerra")
    .eq("id", usuarioId)
    .maybeSingle()
  if (!usuario?.email) return
  const nome = usuario.nome_completo ?? usuario.nome_guerra ?? null
  await enviarEmail({
    email: usuario.email,
    nome,
    assunto: `${assunto} — {ENTIDADE}`,
    html: `<p>Olá${nome ? `, ${String(nome).split(" ")[0]}` : ""}!</p><p>${mensagem}</p><p>Acompanhe em <a href="${SITE_URL}${rota}">${SITE_URL}${rota}</a>.</p><p>Confluir — {ENTIDADE}</p>`,
  })
}

// ── Frota ──────────────────────────────────────────────────────────────────

export type VeiculoLinha = {
  id: string
  codigo: string | null
  placa: string | null
  marca_modelo: string | null
  cor: string | null
  combustivel: string | null
  lotacao: string | null
  eh_alugado: boolean
  inativo: boolean
  manutencao: boolean
  /** Movimentação aberta (veículo na rua) — null = SQL não rodado. */
  emUso: boolean | null
  condutorEmUsoNome: string | null
}

export type FiltrosFrota = {
  busca?: string
  situacao?: "ativos" | "inativos" | "todos"
}

export async function listarVeiculos(
  filtros: FiltrosFrota = {}
): Promise<VeiculoLinha[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("veiculos")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())

  const situacao = filtros.situacao ?? "ativos"
  if (situacao === "ativos") q = q.eq("inativo", false)
  if (situacao === "inativos") q = q.eq("inativo", true)

  const busca = (filtros.busca ?? "").trim().replace(/[,()]/g, " ").trim()
  if (busca) {
    q = q.or(
      `placa.ilike.%${busca}%,marca_modelo.ilike.%${busca}%,codigo.ilike.%${busca}%`
    )
  }

  const { data, error } = await q
    .order("inativo", { ascending: true })
    .order("placa", { ascending: true })
  if (error) throw new Error(`Falha ao listar a frota: ${error.message}`)
  const brutos = (data ?? []) as Record<string, unknown>[]

  const abertas = await movimentacoesAbertas()
  return brutos.map((v) => {
    const aberta = abertas?.get(String(v.id))
    return {
      id: String(v.id),
      codigo: texto(v.codigo),
      placa: texto(v.placa),
      marca_modelo: texto(v.marca_modelo),
      cor: texto(v.cor),
      combustivel: texto(v.combustivel),
      lotacao: texto(v.lotacao_os) ?? texto(v.lotacao),
      eh_alugado: v.eh_alugado === true,
      inativo: v.inativo === true,
      manutencao: v.manutencao === true,
      emUso: abertas === null ? null : Boolean(aberta),
      condutorEmUsoNome: aberta?.condutorNome ?? null,
    }
  })
}

/**
 * Movimentações do FLUXO NOVO sem devolução, por veículo. O marcador é
 * `registrado_por_id` (sempre preenchido nas retiradas novas) — as 221
 * movimentações legadas sem devolução ficam de fora do status "em uso".
 * Null = esquema sem o SQL novo.
 */
async function movimentacoesAbertas(): Promise<Map<
  string,
  { id: string; condutor_id: string | null; condutorNome: string | null }
> | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_disponibilidade")
    .select("id, veiculo_id, condutor_id, registrado_por_id")
    .is("data_devolucao", null)
    .not("registrado_por_id", "is", null)
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao consultar movimentações: ${error.message}`)
  }
  const linhas = (data ?? []) as Record<string, unknown>[]
  const nomes = await nomesDosUsuarios(
    linhas.map((l) => String(l.condutor_id ?? "")).filter(Boolean)
  )
  const mapa = new Map<
    string,
    { id: string; condutor_id: string | null; condutorNome: string | null }
  >()
  for (const l of linhas) {
    if (!l.veiculo_id) continue
    mapa.set(String(l.veiculo_id), {
      id: String(l.id),
      condutor_id: texto(l.condutor_id),
      condutorNome: l.condutor_id
        ? (nomes.get(String(l.condutor_id)) ?? null)
        : null,
    })
  }
  return mapa
}

export type VeiculoDetalhe = VeiculoLinha & {
  renavan: string | null
  ano_fabricacao: string | null
  ano_modelo: string | null
  seguro_vencimento: string | null
  seguro_apolice_url: string | null
  crlv_urls: string[]
  crv_transferencia_url: string | null
  contrato_aluguel_id: string | null
  contrato: ContratoLinha | null
  movimentacaoAbertaId: string | null
  legado: boolean
}

export async function buscarVeiculo(
  id: string
): Promise<VeiculoDetalhe | null> {
  const admin = await createAdminClient()
  const { data: v, error } = await admin
    .from("veiculos")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar o veículo: ${error.message}`)
  if (!v) return null

  const abertas = await movimentacoesAbertas()
  const aberta = abertas?.get(String(v.id))

  let contrato: ContratoLinha | null = null
  const contratoId = texto(v.contrato_aluguel_id)
  if (contratoId) {
    const contratos = await listarContratos({ ids: [contratoId] })
    contrato = contratos.contratos[0] ?? null
  }

  return {
    id: String(v.id),
    codigo: texto(v.codigo),
    placa: texto(v.placa),
    marca_modelo: texto(v.marca_modelo),
    cor: texto(v.cor),
    combustivel: texto(v.combustivel),
    lotacao: texto(v.lotacao_os) ?? texto(v.lotacao),
    eh_alugado: v.eh_alugado === true,
    inativo: v.inativo === true,
    manutencao: v.manutencao === true,
    emUso: abertas === null ? null : Boolean(aberta),
    condutorEmUsoNome: aberta?.condutorNome ?? null,
    movimentacaoAbertaId: aberta?.id ?? null,
    renavan: texto(v.renavan),
    ano_fabricacao: texto(v.ano_fabricacao),
    ano_modelo: texto(v.ano_modelo),
    seguro_vencimento: texto(v.seguro_vencimento),
    seguro_apolice_url: texto(v.seguro_apolice_url),
    crlv_urls: listaJsonb(v.crlv),
    crv_transferencia_url: texto(v.crv_transferencia_url),
    contrato_aluguel_id: contratoId,
    contrato,
    legado: Boolean(v.bubble_id),
  }
}

export type DadosVeiculo = {
  placa: string
  marca_modelo: string
  cor: string | null
  combustivel: string | null
  lotacao: string | null
  renavan: string | null
  ano_fabricacao: string | null
  ano_modelo: string | null
  eh_alugado: boolean
  seguro_vencimento: string | null
  contrato_aluguel_id: string | null
}

export async function criarVeiculo(
  dados: DadosVeiculo
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos")
    .insert({
      codigo: `${gerarCodigoProcesso()} V`,
      placa: dados.placa.toUpperCase(),
      marca_modelo: dados.marca_modelo,
      cor: dados.cor,
      combustivel: dados.combustivel,
      lotacao_os: dados.lotacao,
      lotacao: dados.lotacao,
      renavan: dados.renavan,
      // Colunas DATE no legado (ano veio como 1º de setembro — aqui usamos 1º de janeiro).
      ano_fabricacao: dados.ano_fabricacao,
      ano_modelo: dados.ano_modelo,
      eh_alugado: dados.eh_alugado,
      seguro_vencimento: dados.seguro_vencimento,
      contrato_aluguel_id: dados.contrato_aluguel_id,
      inativo: false,
      manutencao: false,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível cadastrar o veículo: ${error.message}` }
  }
  return { id: data.id }
}

export async function atualizarVeiculo(
  id: string,
  dados: Partial<DadosVeiculo> & { inativo?: boolean; manutencao?: boolean }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const mudancas: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (dados.placa !== undefined) mudancas.placa = dados.placa.toUpperCase()
  if (dados.marca_modelo !== undefined) mudancas.marca_modelo = dados.marca_modelo
  if (dados.cor !== undefined) mudancas.cor = dados.cor
  if (dados.combustivel !== undefined) mudancas.combustivel = dados.combustivel
  if (dados.lotacao !== undefined) {
    mudancas.lotacao_os = dados.lotacao
    mudancas.lotacao = dados.lotacao
  }
  if (dados.renavan !== undefined) mudancas.renavan = dados.renavan
  if (dados.ano_fabricacao !== undefined) mudancas.ano_fabricacao = dados.ano_fabricacao
  if (dados.ano_modelo !== undefined) mudancas.ano_modelo = dados.ano_modelo
  if (dados.eh_alugado !== undefined) mudancas.eh_alugado = dados.eh_alugado
  if (dados.seguro_vencimento !== undefined) mudancas.seguro_vencimento = dados.seguro_vencimento
  if (dados.contrato_aluguel_id !== undefined) mudancas.contrato_aluguel_id = dados.contrato_aluguel_id
  if (dados.inativo !== undefined) mudancas.inativo = dados.inativo
  if (dados.manutencao !== undefined) mudancas.manutencao = dados.manutencao

  const { data, error } = await admin
    .from("veiculos")
    .update(mudancas)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .select("id")
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível salvar: ${error.message}` }
  }
  if ((data ?? []).length === 0) return { erro: "Veículo não encontrado." }
  return {}
}

// ── Condutores ─────────────────────────────────────────────────────────────

export type Condutor = {
  id: string
  usuario_id: string
  usuarioNome: string | null
  cnh_numero: string | null
  cnh_categoria: string | null
  cnh_validade: string | null
  cnh_arquivo_url: string | null
  autorizado: boolean
  autorizadoPorNome: string | null
  autorizado_em: string | null
  observacao: string | null
  /** Autorizado e com CNH em dia — pode solicitar veículo. */
  apto: boolean
  cnhVencida: boolean
}

function montarCondutor(
  c: Record<string, unknown>,
  nomes: Map<string, string>
): Condutor {
  const validade = texto(c.cnh_validade)
  const vencida = validade !== null && validade < hojeSP()
  return {
    id: String(c.id),
    usuario_id: String(c.usuario_id),
    usuarioNome: nomes.get(String(c.usuario_id)) ?? null,
    cnh_numero: texto(c.cnh_numero),
    cnh_categoria: texto(c.cnh_categoria),
    cnh_validade: validade,
    cnh_arquivo_url: texto(c.cnh_arquivo_url),
    autorizado: c.autorizado === true,
    autorizadoPorNome: c.autorizado_por_id
      ? (nomes.get(String(c.autorizado_por_id)) ?? null)
      : null,
    autorizado_em: texto(c.autorizado_em),
    observacao: texto(c.observacao),
    // Sem validade preenchida (backfill da flag legada) não bloqueia — a
    // exigência de CNH em dia vale quando a validade é conhecida.
    apto: c.autorizado === true && !vencida,
    cnhVencida: vencida,
  }
}

export async function listarCondutores(): Promise<{
  disponivel: boolean
  condutores: Condutor[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_condutores")
    .select("*")
    .order("created_at", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, condutores: [] }
    throw new Error(`Falha ao listar condutores: ${error.message}`)
  }
  const brutos = (data ?? []) as Record<string, unknown>[]
  const nomes = await nomesDosUsuarios(
    brutos.flatMap((c) => [String(c.usuario_id ?? ""), String(c.autorizado_por_id ?? "")])
  )
  const condutores = brutos
    .map((c) => montarCondutor(c, nomes))
    .sort((a, b) => (a.usuarioNome ?? "").localeCompare(b.usuarioNome ?? "", "pt-BR"))
  return { disponivel: true, condutores }
}

export async function buscarCondutorDoUsuario(
  usuarioId: string
): Promise<Condutor | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_condutores")
    .select("*")
    .eq("usuario_id", usuarioId)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao buscar condutor: ${error.message}`)
  }
  if (!data) return null
  const nomes = await nomesDosUsuarios([
    usuarioId,
    String(data.autorizado_por_id ?? ""),
  ])
  return montarCondutor(data as Record<string, unknown>, nomes)
}

export type DadosCondutor = {
  usuario_id: string
  cnh_numero: string | null
  cnh_categoria: string | null
  cnh_validade: string | null
  cnh_arquivo_url: string | null
  observacao: string | null
}

/** Cria ou atualiza o cadastro do condutor (upsert por usuário). */
export async function salvarCondutor(
  dados: DadosCondutor
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("veiculos_condutores").upsert(
    {
      usuario_id: dados.usuario_id,
      cnh_numero: dados.cnh_numero,
      cnh_categoria: dados.cnh_categoria,
      cnh_validade: dados.cnh_validade,
      ...(dados.cnh_arquivo_url ? { cnh_arquivo_url: dados.cnh_arquivo_url } : {}),
      observacao: dados.observacao,
      emp_proprietaria_id: await tenantAtual(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "usuario_id" }
  )
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível salvar o condutor: ${error.message}` }
  }
  return {}
}

export async function definirAutorizacaoCondutor(
  condutorId: string,
  autorizado: boolean,
  gestorId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_condutores")
    .update({
      autorizado,
      autorizado_por_id: autorizado ? gestorId : null,
      autorizado_em: autorizado ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", condutorId)
    .select("usuario_id")
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  const linha = (data ?? [])[0]
  if (!linha) return { erro: "Condutor não encontrado." }

  // Mantém a flag legada em `usuarios` sincronizada (o Bubble ainda a lê).
  await admin
    .from("usuarios")
    .update({ cnh_autorizado: autorizado })
    .eq("id", linha.usuario_id)
  return {}
}

// ── Agendamentos (solicitações) ────────────────────────────────────────────

export type Agendamento = {
  id: string
  situacao: SituacaoAgendamento
  motivo: string | null
  destino: string | null
  data_retirada: string | null
  data_retorno: string | null
  sede_retirada: string | null
  condutor_id: string | null
  condutorNome: string | null
  veiculo_id: string | null
  veiculoPlaca: string | null
  veiculoModelo: string | null
  atendidoPorNome: string | null
  negado_motivo: string | null
  created_at: string | null
  legado: boolean
}

async function montarAgendamentos(
  brutos: Record<string, unknown>[]
): Promise<Agendamento[]> {
  const admin = await createAdminClient()
  const nomes = await nomesDosUsuarios(
    brutos.flatMap((a) => [
      String(a.condutor_id ?? ""),
      String(a.atendido_por_id ?? ""),
    ])
  )
  const veiculoIds = [
    ...new Set(
      brutos.map((a) => String(a.veiculo_id ?? "")).filter(Boolean)
    ),
  ]
  const veiculos = veiculoIds.length
    ? await admin
        .from("veiculos")
        .select("id, placa, marca_modelo")
        .in("id", veiculoIds)
    : { data: [] }
  const veiculoPorId = new Map(
    ((veiculos.data ?? []) as Record<string, unknown>[]).map((v) => [
      String(v.id),
      v,
    ])
  )
  return brutos.map((a) => {
    const veiculo = a.veiculo_id ? veiculoPorId.get(String(a.veiculo_id)) : undefined
    // Sem o SQL rodado, linhas legadas não têm `situacao` — deriva do
    // `atendido` igual ao backfill, para não reabrir pendências antigas.
    const situacaoLegado: SituacaoAgendamento =
      a.atendido === true ? "concluida" : a.bubble_id ? "expirada" : "solicitada"
    return {
      id: String(a.id),
      situacao: (texto(a.situacao) as SituacaoAgendamento) ?? situacaoLegado,
      motivo: texto(a.motivo),
      destino: texto(a.destino),
      data_retirada: texto(a.data_retirada),
      data_retorno: texto(a.data_retorno),
      sede_retirada: texto(a.sede_retirada_os),
      condutor_id: texto(a.condutor_id),
      condutorNome: a.condutor_id
        ? (nomes.get(String(a.condutor_id)) ?? null)
        : null,
      veiculo_id: texto(a.veiculo_id),
      veiculoPlaca: texto(veiculo?.placa),
      veiculoModelo: texto(veiculo?.marca_modelo),
      atendidoPorNome: a.atendido_por_id
        ? (nomes.get(String(a.atendido_por_id)) ?? null)
        : null,
      negado_motivo: texto(a.negado_motivo),
      created_at: texto(a.created_at),
      legado: Boolean(a.bubble_id),
    }
  })
}

export async function listarAgendamentos(filtros: {
  situacoes?: SituacaoAgendamento[]
  condutorId?: string
  limite?: number
}): Promise<{ disponivel: boolean; agendamentos: Agendamento[] }> {
  const admin = await createAdminClient()
  let q = admin
    .from("veiculos_agendamentos")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
  if (filtros.situacoes?.length) q = q.in("situacao", filtros.situacoes)
  if (filtros.condutorId) q = q.eq("condutor_id", filtros.condutorId)
  const { data, error } = await q
    .order("data_retirada", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(filtros.limite ?? 200)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, agendamentos: [] }
    throw new Error(`Falha ao listar agendamentos: ${error.message}`)
  }
  return {
    disponivel: true,
    agendamentos: await montarAgendamentos(
      (data ?? []) as Record<string, unknown>[]
    ),
  }
}

export type NovoAgendamento = {
  condutor_usuario_id: string
  motivo: string
  destino: string
  data_retirada: string
  data_retorno: string | null
  sede_retirada: string
}

/** Solicitação de veículo — exige condutor autorizado com CNH em dia. */
export async function criarAgendamento(
  novo: NovoAgendamento
): Promise<{ erro?: string }> {
  const condutor = await buscarCondutorDoUsuario(novo.condutor_usuario_id)
  if (!condutor) {
    return {
      erro: "Você não tem cadastro de condutor — procure a gestão da frota.",
    }
  }
  if (!condutor.autorizado) {
    return { erro: "Seu cadastro de condutor não está autorizado a dirigir." }
  }
  if (condutor.cnhVencida) {
    return { erro: "Sua CNH está vencida — atualize o cadastro para solicitar." }
  }
  if (novo.data_retirada < hojeSP()) {
    return { erro: "A data de retirada não pode estar no passado." }
  }
  if (novo.data_retorno && novo.data_retorno < novo.data_retirada) {
    return { erro: "O retorno previsto não pode ser antes da retirada." }
  }

  const admin = await createAdminClient()
  const { error } = await admin.from("veiculos_agendamentos").insert({
    situacao: "solicitada",
    atendido: false,
    motivo: novo.motivo,
    destino: novo.destino,
    data_retirada: novo.data_retirada,
    data_retorno: novo.data_retorno,
    sede_retirada_os: novo.sede_retirada,
    condutor_id: novo.condutor_usuario_id,
    empresa_id: await tenantAtual(),
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível solicitar: ${error.message}` }
  }
  return {}
}

/** Cancela a PRÓPRIA solicitação, enquanto não retirada. */
export async function cancelarAgendamento(
  id: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_agendamentos")
    .update({ situacao: "cancelada", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("condutor_id", usuarioId)
    .in("situacao", ["solicitada", "atendida"])
    .select("id")
  if (error) return { erro: `Não foi possível cancelar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "Solicitação não encontrada ou já em andamento." }
  }
  return {}
}

/** Gestor atende a solicitação vinculando um veículo disponível. */
export async function atenderAgendamento(
  id: string,
  veiculoId: string,
  gestorId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: veiculo } = await admin
    .from("veiculos")
    .select("id, placa, marca_modelo, inativo, manutencao")
    .eq("id", veiculoId)
    .maybeSingle()
  if (!veiculo) return { erro: "Veículo não encontrado." }
  if (veiculo.inativo === true) return { erro: "Este veículo está inativo." }
  if (veiculo.manutencao === true) {
    return { erro: "Este veículo está em manutenção." }
  }

  const { data, error } = await admin
    .from("veiculos_agendamentos")
    .update({
      situacao: "atendida",
      atendido: true,
      veiculo_id: veiculoId,
      atendido_por_id: gestorId,
      atendido_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("situacao", ["solicitada", "atendida"])
    .select("condutor_id")
  if (error) return { erro: `Não foi possível atender: ${error.message}` }
  const linha = (data ?? [])[0]
  if (!linha) return { erro: "Solicitação não encontrada ou já em andamento." }

  if (linha.condutor_id) {
    await notificarUsuario(
      String(linha.condutor_id),
      "Veículo reservado",
      `Sua solicitação de veículo foi atendida: ${veiculo.marca_modelo ?? ""} placa ${veiculo.placa ?? "—"}. Retire na sede combinada.`,
      "/painel/veiculos/agendamentos"
    )
  }
  return {}
}

export async function negarAgendamento(
  id: string,
  gestorId: string,
  motivo: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_agendamentos")
    .update({
      situacao: "negada",
      negado_motivo: motivo,
      atendido_por_id: gestorId,
      atendido_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("situacao", "solicitada")
    .select("condutor_id")
  if (error) return { erro: `Não foi possível negar: ${error.message}` }
  const linha = (data ?? [])[0]
  if (!linha) return { erro: "Solicitação não encontrada ou já em andamento." }
  if (linha.condutor_id) {
    await notificarUsuario(
      String(linha.condutor_id),
      "Solicitação de veículo negada",
      `Sua solicitação de veículo foi negada. Motivo: ${motivo}`,
      "/painel/veiculos/agendamentos"
    )
  }
  return {}
}

// ── Movimentações (retirada/devolução) ─────────────────────────────────────

export type Movimentacao = {
  id: string
  veiculo_id: string | null
  veiculoPlaca: string | null
  veiculoModelo: string | null
  condutor_id: string | null
  condutorNome: string | null
  motivo: string | null
  destino: string | null
  sede_retirada: string | null
  sede_devolucao: string | null
  data_retirada: string | null
  data_devolucao: string | null
  hodometro_retirada: number | null
  hodometro_devolucao: number | null
  km_rodado: number | null
  observacao_retorno: string | null
  aberta: boolean
}

export async function listarMovimentacoes(filtros: {
  veiculoId?: string
  condutorId?: string
  abertas?: boolean
  /** Só o fluxo novo (com registrado_por_id) — exclui as 221 aberturas legadas. */
  fluxoNovo?: boolean
  limite?: number
}): Promise<Movimentacao[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("veiculos_disponibilidade")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
  if (filtros.veiculoId) q = q.eq("veiculo_id", filtros.veiculoId)
  if (filtros.condutorId) q = q.eq("condutor_id", filtros.condutorId)
  if (filtros.abertas) q = q.is("data_devolucao", null)
  if (filtros.fluxoNovo) q = q.not("registrado_por_id", "is", null)
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(filtros.limite ?? 100)
  if (error) {
    // Filtro por coluna nova sem o SQL rodado: degrada para lista vazia.
    if (filtros.fluxoNovo && esquemaAusente(error)) return []
    throw new Error(`Falha ao listar movimentações: ${error.message}`)
  }
  const brutos = (data ?? []) as Record<string, unknown>[]

  const nomes = await nomesDosUsuarios(
    brutos.map((m) => String(m.condutor_id ?? "")).filter(Boolean)
  )
  const veiculoIds = [
    ...new Set(brutos.map((m) => String(m.veiculo_id ?? "")).filter(Boolean)),
  ]
  const veiculos = veiculoIds.length
    ? await admin.from("veiculos").select("id, placa, marca_modelo").in("id", veiculoIds)
    : { data: [] }
  const veiculoPorId = new Map(
    ((veiculos.data ?? []) as Record<string, unknown>[]).map((v) => [String(v.id), v])
  )

  return brutos.map((m) => {
    const veiculo = m.veiculo_id ? veiculoPorId.get(String(m.veiculo_id)) : undefined
    return {
      id: String(m.id),
      veiculo_id: texto(m.veiculo_id),
      veiculoPlaca: texto(veiculo?.placa),
      veiculoModelo: texto(veiculo?.marca_modelo),
      condutor_id: texto(m.condutor_id),
      condutorNome: m.condutor_id ? (nomes.get(String(m.condutor_id)) ?? null) : null,
      motivo: texto(m.motivo),
      destino: texto(m.destino),
      sede_retirada: texto(m.sede_retirada_os) ?? texto(m.sede_retirada),
      sede_devolucao: texto(m.sede_devolucao_os) ?? texto(m.sede_devolucao),
      data_retirada: texto(m.data_retirada),
      data_devolucao: texto(m.data_devolucao),
      hodometro_retirada: numero(m.hodometro_retirada),
      hodometro_devolucao: numero(m.hodometro_devolucao),
      km_rodado: numero(m.km_rodado),
      observacao_retorno: texto(m.observacao_retorno),
      aberta: !m.data_devolucao,
    }
  })
}

export type NovaRetirada = {
  /** Solicitação atendida que origina a retirada (null = retirada avulsa). */
  agendamento_id: string | null
  veiculo_id: string
  condutor_usuario_id: string
  hodometro: number
  sede: string
  motivo: string | null
  destino: string | null
  registrado_por_id: string
}

export async function registrarRetirada(
  nova: NovaRetirada
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()

  const { data: veiculo } = await admin
    .from("veiculos")
    .select("id, inativo, manutencao")
    .eq("id", nova.veiculo_id)
    .maybeSingle()
  if (!veiculo) return { erro: "Veículo não encontrado." }
  if (veiculo.inativo === true) return { erro: "Este veículo está inativo." }
  if (veiculo.manutencao === true) return { erro: "Este veículo está em manutenção." }

  const { count: emUso } = await admin
    .from("veiculos_disponibilidade")
    .select("id", { count: "exact", head: true })
    .eq("veiculo_id", nova.veiculo_id)
    .not("registrado_por_id", "is", null)
    .is("data_devolucao", null)
  if ((emUso ?? 0) > 0) {
    return { erro: "Este veículo já está com movimentação em aberto." }
  }

  const condutor = await buscarCondutorDoUsuario(nova.condutor_usuario_id)
  if (!condutor?.autorizado) {
    return { erro: "O condutor não está autorizado a dirigir." }
  }
  if (condutor.cnhVencida) return { erro: "A CNH do condutor está vencida." }

  const { error } = await admin.from("veiculos_disponibilidade").insert({
    agendamento_id: nova.agendamento_id,
    veiculo_id: nova.veiculo_id,
    condutor_id: nova.condutor_usuario_id,
    data_retirada: hojeSP(),
    hodometro_retirada: nova.hodometro,
    sede_retirada_os: nova.sede,
    sede_retirada: nova.sede,
    motivo: nova.motivo,
    destino: nova.destino,
    disponivel: false,
    manutencao: false,
    registrado_por_id: nova.registrado_por_id,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível registrar a retirada: ${error.message}` }
  }

  if (nova.agendamento_id) {
    await admin
      .from("veiculos_agendamentos")
      .update({
        situacao: "retirada",
        veiculo_id: nova.veiculo_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", nova.agendamento_id)
  }
  return {}
}

export type Devolucao = {
  movimentacao_id: string
  hodometro: number
  sede: string
  observacao: string | null
}

export async function registrarDevolucao(
  dev: Devolucao
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: mov } = await admin
    .from("veiculos_disponibilidade")
    .select("id, hodometro_retirada, agendamento_id, data_devolucao")
    .eq("id", dev.movimentacao_id)
    .maybeSingle()
  if (!mov) return { erro: "Movimentação não encontrada." }
  if (mov.data_devolucao) return { erro: "Esta movimentação já foi devolvida." }
  const hodometroRetirada = numero(mov.hodometro_retirada)
  if (hodometroRetirada !== null && dev.hodometro < hodometroRetirada) {
    return {
      erro: `O hodômetro da devolução (${dev.hodometro}) não pode ser menor que o da retirada (${hodometroRetirada}).`,
    }
  }

  const { error } = await admin
    .from("veiculos_disponibilidade")
    .update({
      data_devolucao: hojeSP(),
      hodometro_devolucao: dev.hodometro,
      sede_devolucao_os: dev.sede,
      sede_devolucao: dev.sede,
      km_rodado:
        hodometroRetirada !== null ? dev.hodometro - hodometroRetirada : null,
      observacao_retorno: dev.observacao,
      disponivel: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dev.movimentacao_id)
    .is("data_devolucao", null)
  if (error) return { erro: `Não foi possível registrar a devolução: ${error.message}` }

  if (mov.agendamento_id) {
    await admin
      .from("veiculos_agendamentos")
      .update({ situacao: "concluida", updated_at: new Date().toISOString() })
      .eq("id", mov.agendamento_id)
  }
  return {}
}

// ── Abastecimentos ─────────────────────────────────────────────────────────

export type Abastecimento = {
  id: string
  veiculo_id: string | null
  veiculoPlaca: string | null
  usuarioNome: string | null
  posto: string | null
  cidade: string | null
  combustivel: string | null
  volume: number | null
  valor: number | null
  hodometro: number | null
  data_hora: string | null
  legado: boolean
}

export const ABASTECIMENTOS_POR_PAGINA = 50

export async function listarAbastecimentos(filtros: {
  veiculoId?: string
  busca?: string
  pagina?: number
}): Promise<{
  linhas: Abastecimento[]
  total: number
  pagina: number
  totalPaginas: number
}> {
  const admin = await createAdminClient()
  const pagina = Math.max(1, filtros.pagina ?? 1)
  let q = admin
    .from("veiculos_abastecimentos")
    .select("*", { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
  if (filtros.veiculoId) q = q.eq("veiculo_id", filtros.veiculoId)
  const busca = (filtros.busca ?? "").trim().replace(/[,()]/g, " ").trim()
  if (busca) q = q.or(`posto.ilike.%${busca}%,cidade.ilike.%${busca}%`)

  const de = (pagina - 1) * ABASTECIMENTOS_POR_PAGINA
  const { data, error, count } = await q
    .order("data_hora_abastecimento", { ascending: false })
    .range(de, de + ABASTECIMENTOS_POR_PAGINA - 1)
  if (error) {
    if (esquemaAusente(error)) {
      return { linhas: [], total: 0, pagina: 1, totalPaginas: 1 }
    }
    throw new Error(`Falha ao listar abastecimentos: ${error.message}`)
  }
  const brutos = (data ?? []) as Record<string, unknown>[]

  const nomes = await nomesDosUsuarios(
    brutos.map((a) => String(a.usuario_id ?? "")).filter(Boolean)
  )
  const veiculoIds = [
    ...new Set(brutos.map((a) => String(a.veiculo_id ?? "")).filter(Boolean)),
  ]
  const veiculos = veiculoIds.length
    ? await admin.from("veiculos").select("id, placa").in("id", veiculoIds)
    : { data: [] }
  const placaPorId = new Map(
    ((veiculos.data ?? []) as Record<string, unknown>[]).map((v) => [
      String(v.id),
      texto(v.placa),
    ])
  )

  const total = count ?? 0
  return {
    linhas: brutos.map((a) => ({
      id: String(a.id),
      veiculo_id: texto(a.veiculo_id),
      veiculoPlaca: a.veiculo_id
        ? (placaPorId.get(String(a.veiculo_id)) ?? null)
        : null,
      usuarioNome: a.usuario_id ? (nomes.get(String(a.usuario_id)) ?? null) : null,
      posto: texto(a.posto),
      cidade: texto(a.cidade),
      combustivel: texto(a.combustivel),
      volume: numero(a.volume_abastecido),
      valor: numero(a.valor_abastecimento),
      hodometro: numero(a.hodometro),
      data_hora: texto(a.data_hora_abastecimento),
      legado: Boolean(a.bubble_id),
    })),
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / ABASTECIMENTOS_POR_PAGINA)),
  }
}

export type NovoAbastecimento = {
  veiculo_id: string
  condutor_usuario_id: string
  posto: string
  cidade: string | null
  combustivel: string
  volume: number
  valor: number
  hodometro: number
  data_hora: string
  lote_id?: string | null
}

/** Lançamento novo — sempre com veículo + hodômetro (decisão 2026-07-19). */
export async function criarAbastecimento(
  novo: NovoAbastecimento
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("veiculos_abastecimentos").insert({
    veiculo_id: novo.veiculo_id,
    usuario_id: novo.condutor_usuario_id,
    posto: novo.posto,
    cidade: novo.cidade,
    combustivel: novo.combustivel,
    volume_abastecido: novo.volume,
    valor_abastecimento: novo.valor,
    hodometro: novo.hodometro,
    data_hora_abastecimento: novo.data_hora,
    lote_id: novo.lote_id ?? null,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível lançar o abastecimento: ${error.message}` }
  }
  return {}
}

export type LinhaImportacao = {
  placa: string
  condutor_usuario_id: string | null
  posto: string
  cidade: string | null
  combustivel: string
  volume: number
  valor: number
  hodometro: number | null
  data_hora: string
}

/** Importa a fatura/planilha em lote; tudo-ou-nada por validação prévia. */
export async function importarAbastecimentos(
  linhas: LinhaImportacao[],
  arquivoNome: string,
  importadorId: string
): Promise<{ importados?: number; erro?: string }> {
  if (linhas.length === 0) return { erro: "Nenhuma linha válida para importar." }
  const admin = await createAdminClient()

  // Resolve as placas para veículos de uma vez.
  const placas = [...new Set(linhas.map((l) => l.placa.toUpperCase()))]
  const { data: veiculos, error: erroVeiculos } = await admin
    .from("veiculos")
    .select("id, placa")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("placa", placas)
  if (erroVeiculos) {
    return { erro: `Falha ao conferir as placas: ${erroVeiculos.message}` }
  }
  const veiculoPorPlaca = new Map(
    (veiculos ?? []).map((v) => [String(v.placa).toUpperCase(), String(v.id)])
  )
  const desconhecidas = placas.filter((p) => !veiculoPorPlaca.has(p))
  if (desconhecidas.length > 0) {
    return {
      erro: `Placas não encontradas na frota: ${desconhecidas.join(", ")}. Cadastre os veículos ou corrija o arquivo.`,
    }
  }

  const { data: lote, error: erroLote } = await admin
    .from("veiculos_abastecimentos_lotes")
    .insert({
      arquivo_nome: arquivoNome,
      importado_por_id: importadorId,
      qtd_linhas: linhas.length,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (erroLote || !lote) {
    if (esquemaAusente(erroLote)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível abrir o lote: ${erroLote?.message}` }
  }

  const empId = await tenantAtual()
  const { error } = await admin.from("veiculos_abastecimentos").insert(
    linhas.map((l) => ({
      veiculo_id: veiculoPorPlaca.get(l.placa.toUpperCase()),
      usuario_id: l.condutor_usuario_id,
      posto: l.posto,
      cidade: l.cidade,
      combustivel: l.combustivel,
      volume_abastecido: l.volume,
      valor_abastecimento: l.valor,
      hodometro: l.hodometro,
      data_hora_abastecimento: l.data_hora,
      lote_id: lote.id,
      emp_proprietaria_id: empId,
    }))
  )
  if (error) {
    await admin.from("veiculos_abastecimentos_lotes").delete().eq("id", lote.id)
    return { erro: `Não foi possível importar: ${error.message}` }
  }
  return { importados: linhas.length }
}

export type ConsumoVeiculo = {
  totalGasto: number
  totalLitros: number
  kmRodados: number | null
  kmPorLitro: number | null
  lancamentos: number
}

/** Indicadores por veículo — só lançamentos novos (com hodômetro). */
export async function consumoDoVeiculo(
  veiculoId: string
): Promise<ConsumoVeiculo | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_abastecimentos")
    .select("volume_abastecido, valor_abastecimento, hodometro")
    .eq("veiculo_id", veiculoId)
    .order("data_hora_abastecimento", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao calcular consumo: ${error.message}`)
  }
  const linhas = (data ?? []) as Record<string, unknown>[]
  if (linhas.length === 0) return null

  const totalGasto = linhas.reduce(
    (s, l) => s + (numero(l.valor_abastecimento) ?? 0),
    0
  )
  const totalLitros = linhas.reduce(
    (s, l) => s + (numero(l.volume_abastecido) ?? 0),
    0
  )
  const hodometros = linhas
    .map((l) => numero(l.hodometro))
    .filter((h): h is number => h !== null)
  const kmRodados =
    hodometros.length >= 2
      ? Math.max(...hodometros) - Math.min(...hodometros)
      : null
  // km/l só faz sentido com a janela de hodômetro conhecida; desconta o
  // primeiro tanque (o volume que encheu antes do primeiro registro).
  const kmPorLitro =
    kmRodados !== null && totalLitros > 0 && kmRodados > 0
      ? Math.round((kmRodados / totalLitros) * 10) / 10
      : null
  return {
    totalGasto: Math.round(totalGasto * 100) / 100,
    totalLitros: Math.round(totalLitros * 100) / 100,
    kmRodados,
    kmPorLitro,
    lancamentos: linhas.length,
  }
}

// ── Infrações ──────────────────────────────────────────────────────────────

export type Infracao = {
  id: string
  codigo: string | null
  veiculo_id: string | null
  veiculoPlaca: string | null
  veiculoModelo: string | null
  condutor_id: string | null
  condutorNome: string | null
  infracao_data: string | null
  infracao_tipo: string | null
  orgao_autuador: string | null
  auto_de: string | null
  descricao: string | null
  local: string | null
  custo: number | null
  arquivo_notificacao: string | null
  boleto_url: string | null
  notificado: boolean
  notificado_em: string | null
  justificativa: string | null
  justificativa_em: string | null
  justificativa_sindical: boolean
  avaliadorNome: string | null
  ordem_pagamento_id: string | null
  ordemCodigo: string | null
  ordemSituacao: string | null
  cobranca_forma: FormaCobranca | null
  cobranca_situacao: SituacaoCobranca | null
  cobranca_valor: number | null
  baixaPorNome: string | null
  baixa_em: string | null
  baixa_observacao: string | null
  baixa_comprovante_url: string | null
  created_at: string | null
  legado: boolean
}

async function montarInfracoes(
  brutos: Record<string, unknown>[]
): Promise<Infracao[]> {
  const admin = await createAdminClient()
  const nomes = await nomesDosUsuarios(
    brutos.flatMap((i) => [
      String(i.condutor_infrator_id ?? ""),
      String(i.justificativa_avaliador_id ?? ""),
      String(i.baixa_usuario_id ?? ""),
    ])
  )
  const veiculoIds = [
    ...new Set(brutos.map((i) => String(i.veiculo_id ?? "")).filter(Boolean)),
  ]
  const ordemIds = [
    ...new Set(
      brutos.map((i) => String(i.ordem_pagamento_id ?? "")).filter(Boolean)
    ),
  ]
  const [veiculos, ordens] = await Promise.all([
    veiculoIds.length
      ? admin.from("veiculos").select("id, placa, marca_modelo").in("id", veiculoIds)
      : Promise.resolve({ data: [] }),
    ordemIds.length
      ? admin
          .from("ordens_pagamento")
          .select("id, codigo, situacao")
          .in("id", ordemIds)
      : Promise.resolve({ data: [] }),
  ])
  const veiculoPorId = new Map(
    ((veiculos.data ?? []) as Record<string, unknown>[]).map((v) => [
      String(v.id),
      v,
    ])
  )
  const ordemPorId = new Map(
    ((ordens.data ?? []) as Record<string, unknown>[]).map((o) => [
      String(o.id),
      o,
    ])
  )

  return brutos.map((i) => {
    const veiculo = i.veiculo_id ? veiculoPorId.get(String(i.veiculo_id)) : undefined
    const ordem = i.ordem_pagamento_id
      ? ordemPorId.get(String(i.ordem_pagamento_id))
      : undefined
    return {
      id: String(i.id),
      codigo: texto(i.codigo),
      veiculo_id: texto(i.veiculo_id),
      veiculoPlaca: texto(veiculo?.placa),
      veiculoModelo: texto(veiculo?.marca_modelo),
      condutor_id: texto(i.condutor_infrator_id),
      condutorNome: i.condutor_infrator_id
        ? (nomes.get(String(i.condutor_infrator_id)) ?? null)
        : null,
      infracao_data: texto(i.infracao_data),
      infracao_tipo: texto(i.infracao_tipo),
      orgao_autuador: texto(i.infracao_orgao_autuador),
      auto_de: texto(i.infracao_auto_de),
      descricao: texto(i.infracao_descricao),
      local: texto(i.infracao_local),
      custo: numero(i.infracao_custo),
      arquivo_notificacao: texto(i.infracao_arquivo_notificacao),
      boleto_url: texto(i.boleto),
      notificado: i.notificacao_infrator === true,
      notificado_em: texto(i.notificacao_infrator_quando),
      justificativa: texto(i.justificativa_descricao),
      justificativa_em: texto(i.justificativa_quando),
      justificativa_sindical: i.justificativa_sindical === true,
      avaliadorNome: i.justificativa_avaliador_id
        ? (nomes.get(String(i.justificativa_avaliador_id)) ?? null)
        : null,
      ordem_pagamento_id: texto(i.ordem_pagamento_id),
      ordemCodigo: texto(ordem?.codigo),
      ordemSituacao: texto(ordem?.situacao),
      cobranca_forma: (texto(i.cobranca_forma) as FormaCobranca) ?? null,
      cobranca_situacao:
        (texto(i.cobranca_situacao) as SituacaoCobranca) ?? null,
      cobranca_valor: numero(i.cobranca_valor),
      baixaPorNome: i.baixa_usuario_id
        ? (nomes.get(String(i.baixa_usuario_id)) ?? null)
        : null,
      baixa_em: texto(i.baixa_em),
      baixa_observacao: texto(i.baixa_observacao),
      baixa_comprovante_url: texto(i.baixa_comprovante_url),
      created_at: texto(i.created_at),
      legado: Boolean(i.bubble_id),
    }
  })
}

export async function listarInfracoes(filtros: {
  veiculoId?: string
  condutorId?: string
  cobranca?: SituacaoCobranca
  limite?: number
}): Promise<Infracao[]> {
  const admin = await createAdminClient()
  let q = admin.from("veiculos_infracoes").select("*")
  if (filtros.veiculoId) q = q.eq("veiculo_id", filtros.veiculoId)
  if (filtros.condutorId) q = q.eq("condutor_infrator_id", filtros.condutorId)
  if (filtros.cobranca) q = q.eq("cobranca_situacao", filtros.cobranca)
  const { data, error } = await q
    .order("infracao_data", { ascending: false })
    .limit(filtros.limite ?? 200)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar infrações: ${error.message}`)
  }
  return montarInfracoes((data ?? []) as Record<string, unknown>[])
}

export async function buscarInfracao(id: string): Promise<Infracao | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_infracoes")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao buscar infração: ${error.message}`)
  }
  if (!data) return null
  const [linha] = await montarInfracoes([data as Record<string, unknown>])
  return linha ?? null
}

/** Evento no histórico imutável (auditoria do Conselho Fiscal) — só INSERT. */
async function registrarEventoInfracao(
  infracaoId: string,
  usuarioId: string | null,
  evento: string,
  detalhe: string | null
): Promise<void> {
  const admin = await createAdminClient()
  const { error } = await admin.from("veiculos_infracoes_historico").insert({
    infracao_id: infracaoId,
    usuario_id: usuarioId,
    evento,
    detalhe,
  })
  if (error && !esquemaAusente(error)) {
    console.error("Falha ao registrar histórico da infração:", error.message)
  }
}

export type EventoInfracao = {
  id: string
  usuarioNome: string | null
  evento: string
  detalhe: string | null
  created_at: string
}

export async function historicoDaInfracao(
  infracaoId: string
): Promise<EventoInfracao[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_infracoes_historico")
    .select("*")
    .eq("infracao_id", infracaoId)
    .order("created_at", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao buscar histórico: ${error.message}`)
  }
  const brutos = (data ?? []) as Record<string, unknown>[]
  const nomes = await nomesDosUsuarios(
    brutos.map((e) => String(e.usuario_id ?? "")).filter(Boolean)
  )
  return brutos.map((e) => ({
    id: String(e.id),
    usuarioNome: e.usuario_id ? (nomes.get(String(e.usuario_id)) ?? null) : null,
    evento: String(e.evento ?? ""),
    detalhe: texto(e.detalhe),
    created_at: String(e.created_at ?? ""),
  }))
}

export type NovaInfracao = {
  veiculo_id: string
  condutor_usuario_id: string
  infracao_data: string
  infracao_tipo: string
  orgao_autuador: string
  auto_de: string | null
  descricao: string
  local: string | null
  custo: number | null
  arquivo_notificacao_url: string | null
  registrado_por_id: string
}

/** Registra a infração, notifica o infrator (sino + email) e abre o histórico. */
export async function criarInfracao(
  nova: NovaInfracao
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_infracoes")
    .insert({
      codigo: `${gerarCodigoProcesso()} I`,
      veiculo_id: nova.veiculo_id,
      condutor_infrator_id: nova.condutor_usuario_id,
      infracao_data: nova.infracao_data,
      infracao_tipo: nova.infracao_tipo,
      infracao_orgao_autuador: nova.orgao_autuador,
      infracao_auto_de: nova.auto_de,
      infracao_descricao: nova.descricao,
      infracao_local: nova.local,
      infracao_custo: nova.custo,
      infracao_arquivo_notificacao: nova.arquivo_notificacao_url,
      notificacao_infrator: true,
      notificacao_infrator_quando: hojeSP(),
      justificativa_sindical: false,
      reembolso: false,
    })
    .select("id")
    .single()
  if (error || !data) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível registrar a infração: ${error?.message}` }
  }

  await registrarEventoInfracao(
    data.id,
    nova.registrado_por_id,
    "registro",
    `Infração ${nova.infracao_tipo} de ${nova.infracao_data} registrada e infrator notificado.`
  )
  await notificarUsuario(
    nova.condutor_usuario_id,
    "Infração de trânsito registrada",
    `Foi registrada uma infração de trânsito em seu nome (${nova.infracao_tipo}, ${nova.descricao}). Apresente sua justificativa na área de Veículos.`,
    "/painel/veiculos/infracoes"
  )
  return { id: data.id }
}

/** Justificativa do condutor (ou registrada pela gestão em nome dele). */
export async function registrarJustificativa(
  infracaoId: string,
  usuarioId: string,
  descricao: string,
  proprioCondutor: boolean
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  let q = admin
    .from("veiculos_infracoes")
    .update({
      justificativa_descricao: descricao,
      justificativa_quando: hojeSP(),
    })
    .eq("id", infracaoId)
  if (proprioCondutor) q = q.eq("condutor_infrator_id", usuarioId)
  const { data, error } = await q.select("id")
  if (error) return { erro: `Não foi possível justificar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "Infração não encontrada (ou não é sua)." }
  }
  await registrarEventoInfracao(
    infracaoId,
    usuarioId,
    "justificativa",
    descricao
  )
  return {}
}

export type AvaliacaoInfracao = {
  sindical: boolean
  /** Quando NÃO sindical: como o infrator devolve o valor. */
  cobranca_forma: FormaCobranca | null
  cobranca_valor: number | null
  observacao: string | null
}

/**
 * Avalia a justificativa: sindical → sindicato assume (cobrança isenta);
 * não sindical → cobrança pendente ao infrator (contracheque ou diárias).
 */
export async function avaliarInfracao(
  infracaoId: string,
  avaliadorId: string,
  avaliacao: AvaliacaoInfracao
): Promise<{ erro?: string }> {
  const infracao = await buscarInfracao(infracaoId)
  if (!infracao) return { erro: "Infração não encontrada." }
  if (infracao.cobranca_situacao === "baixada") {
    return { erro: "Esta infração já teve a cobrança baixada." }
  }

  if (!avaliacao.sindical) {
    if (!avaliacao.cobranca_forma) {
      return { erro: "Informe a forma de cobrança ao infrator." }
    }
    const valor = avaliacao.cobranca_valor ?? infracao.custo
    if (!valor || valor <= 0) {
      return { erro: "Informe o valor da cobrança (a infração não tem custo registrado)." }
    }
  }

  const valorCobranca = avaliacao.sindical
    ? null
    : (avaliacao.cobranca_valor ?? infracao.custo)

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_infracoes")
    .update({
      justificativa_sindical: avaliacao.sindical,
      justificativa_avaliador_id: avaliadorId,
      avaliacao_quando: hojeSP(),
      cobranca_situacao: avaliacao.sindical ? "isenta" : "pendente",
      cobranca_forma: avaliacao.sindical ? null : avaliacao.cobranca_forma,
      cobranca_valor: valorCobranca,
    })
    .eq("id", infracaoId)
    .select("id")
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível avaliar: ${error.message}` }
  }
  if ((data ?? []).length === 0) return { erro: "Infração não encontrada." }

  await registrarEventoInfracao(
    infracaoId,
    avaliadorId,
    "avaliacao",
    avaliacao.sindical
      ? `Justificativa aceita como atividade sindical — sem cobrança ao condutor.${avaliacao.observacao ? ` Obs.: ${avaliacao.observacao}` : ""}`
      : `Justificativa NÃO sindical — cobrança de ${formatarMoeda(valorCobranca)} ao condutor via ${avaliacao.cobranca_forma === "contracheque" ? "contracheque" : "desconto em diárias"}.${avaliacao.observacao ? ` Obs.: ${avaliacao.observacao}` : ""}`
  )
  if (infracao.condutor_id) {
    await notificarUsuario(
      infracao.condutor_id,
      "Justificativa de infração avaliada",
      avaliacao.sindical
        ? "Sua justificativa foi aceita como atividade sindical — a multa será assumida pelo sindicato."
        : `Sua justificativa não caracterizou atividade sindical: o valor de ${formatarMoeda(valorCobranca)} será cobrado via ${avaliacao.cobranca_forma === "contracheque" ? "contracheque" : "desconto em diárias"}.`,
      "/painel/veiculos/infracoes"
    )
  }
  return {}
}

/** Gera a ordem de pagamento da multa (tipo legado, nasce 'Em autorização'). */
export async function gerarOrdemMulta(
  infracaoId: string,
  dados: { vencimento: string | null; boleto_url: string | null },
  usuarioId: string
): Promise<{ erro?: string }> {
  const infracao = await buscarInfracao(infracaoId)
  if (!infracao) return { erro: "Infração não encontrada." }
  if (infracao.ordem_pagamento_id) {
    return { erro: "Esta infração já tem ordem de pagamento." }
  }
  if (!infracao.custo || infracao.custo <= 0) {
    return { erro: "Registre o valor da multa antes de gerar a ordem." }
  }

  const admin = await createAdminClient()
  const { data: ordem, error: erroOrdem } = await admin
    .from("ordens_pagamento")
    .insert({
      codigo: gerarCodigoProcesso(),
      tipo: TIPO_ORDEM_MULTA,
      descricao: `Infração de trânsito no veículo ${infracao.veiculoPlaca ?? ""} ${infracao.veiculoModelo ?? ""} — auto ${infracao.auto_de ?? "s/n"}`,
      situacao: "Em autorização",
      valor_inicial_cobranca: infracao.custo,
      vencimento: dados.vencimento,
      excluido: false,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (erroOrdem || !ordem) {
    return { erro: `Não foi possível gerar a ordem: ${erroOrdem?.message}` }
  }

  const { error: erroVinculo } = await admin
    .from("veiculos_infracoes")
    .update({
      ordem_pagamento_id: ordem.id,
      ...(dados.boleto_url ? { boleto: dados.boleto_url } : {}),
    })
    .eq("id", infracaoId)
    .is("ordem_pagamento_id", null)
  if (erroVinculo) {
    await admin.from("ordens_pagamento").delete().eq("id", ordem.id)
    return { erro: `Não foi possível vincular a ordem: ${erroVinculo.message}` }
  }
  await registrarEventoInfracao(
    infracaoId,
    usuarioId,
    "ordem_pagamento",
    `Ordem de pagamento da multa gerada (${formatarMoeda(infracao.custo)}, 'Em autorização').`
  )
  return {}
}

// ── Cobranças de multa (Financeiro / Conselho Fiscal) ──────────────────────

/** Fila do Financeiro: cobranças pendentes de infratores. */
export async function listarCobrancasPendentes(): Promise<{
  disponivel: boolean
  cobrancas: Infracao[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_infracoes")
    .select("*")
    .eq("cobranca_situacao", "pendente")
    .order("infracao_data", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, cobrancas: [] }
    throw new Error(`Falha ao listar cobranças: ${error.message}`)
  }
  return {
    disponivel: true,
    cobrancas: await montarInfracoes((data ?? []) as Record<string, unknown>[]),
  }
}

export type CobrancaDiariaPendente = {
  id: string
  codigo: string | null
  valor: number
  descricao: string | null
  data: string | null
}

/**
 * Infrações de um infrator com cobrança PENDENTE na forma "diária" — as que um
 * pagamento de diária dele pode abater. `valor` = cobranca_valor (definido na
 * avaliação) com o custo da infração como fallback.
 */
export async function cobrancasDiariaPendentes(
  infratorId: string
): Promise<CobrancaDiariaPendente[]> {
  if (!infratorId) return []
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_infracoes")
    .select(
      "id, codigo, infracao_data, infracao_descricao, infracao_custo, cobranca_valor"
    )
    .eq("condutor_infrator_id", infratorId)
    .eq("cobranca_forma", "diaria")
    .eq("cobranca_situacao", "pendente")
    .order("infracao_data", { ascending: true, nullsFirst: false })
  if (error) return [] // esquema/coluna ausente → sem descontos
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    codigo: texto(r.codigo),
    valor: numero(r.cobranca_valor ?? r.infracao_custo) ?? 0,
    descricao: texto(r.infracao_descricao),
    data: texto(r.infracao_data),
  }))
}

/**
 * Baixa uma cobrança pela via do desconto em diária (pendente → baixada). Guarda
 * por `pendente` para não baixar duas vezes numa corrida. Sem comprovante: a
 * referência aponta a diária/ordem que absorveu o valor.
 */
export async function baixarCobrancaComoDiaria(
  infracaoId: string,
  opcoes: { avaliadorId: string; referencia: string }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_infracoes")
    .update({
      cobranca_situacao: "baixada",
      reembolso: true,
      reembolso_quando: hojeSP(),
      baixa_usuario_id: opcoes.avaliadorId,
      baixa_em: new Date().toISOString(),
      baixa_observacao: opcoes.referencia,
    })
    .eq("id", infracaoId)
    .eq("cobranca_situacao", "pendente")
    .select("id, condutor_infrator_id, cobranca_valor")
  if (error) return { erro: error.message }
  const linha = (data ?? [])[0]
  if (!linha) return { erro: "Cobrança não encontrada ou já baixada." }

  await registrarEventoInfracao(
    infracaoId,
    opcoes.avaliadorId,
    "baixa",
    opcoes.referencia
  )
  return {}
}

/** Reverte uma baixa por desconto em diária (rollback de corrida na aprovação). */
export async function reverterBaixaCobrancaDiaria(
  infracaoId: string
): Promise<void> {
  const admin = await createAdminClient()
  await admin
    .from("veiculos_infracoes")
    .update({
      cobranca_situacao: "pendente",
      reembolso: false,
      reembolso_quando: null,
      baixa_usuario_id: null,
      baixa_em: null,
      baixa_observacao: null,
    })
    .eq("id", infracaoId)
}

/** Baixa da cobrança pelo Financeiro (comprovante + histórico p/ auditoria). */
export async function baixarCobranca(
  infracaoId: string,
  usuarioId: string,
  dados: { observacao: string; comprovante_url: string | null }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_infracoes")
    .update({
      cobranca_situacao: "baixada",
      reembolso: true,
      reembolso_quando: hojeSP(),
      baixa_usuario_id: usuarioId,
      baixa_em: new Date().toISOString(),
      baixa_observacao: dados.observacao,
      baixa_comprovante_url: dados.comprovante_url,
    })
    .eq("id", infracaoId)
    .eq("cobranca_situacao", "pendente")
    .select("condutor_infrator_id, cobranca_valor")
  if (error) return { erro: `Não foi possível dar baixa: ${error.message}` }
  const linha = (data ?? [])[0]
  if (!linha) return { erro: "Cobrança não encontrada ou já baixada." }

  await registrarEventoInfracao(
    infracaoId,
    usuarioId,
    "baixa",
    `Cobrança de ${formatarMoeda(numero(linha.cobranca_valor))} baixada pelo Financeiro. ${dados.observacao}`
  )
  if (linha.condutor_infrator_id) {
    await notificarUsuario(
      String(linha.condutor_infrator_id),
      "Cobrança de multa quitada",
      `A cobrança da sua infração de trânsito (${formatarMoeda(numero(linha.cobranca_valor))}) foi registrada como quitada.`,
      "/painel/veiculos/infracoes"
    )
  }
  return {}
}

// ── Contratos de aluguel ───────────────────────────────────────────────────

export type ContratoLinha = {
  id: string
  numero: string | null
  fornecedor_id: string | null
  fornecedorNome: string | null
  responsavelNome: string | null
  vigencia_inicio: string | null
  vigencia_termino: string | null
  valor_mensal: number | null
  finalidade: string | null
  finalizado: boolean
  arquivo_contrato_url: string | null
  qtdVeiculos: number
  legado: boolean
}

export async function listarContratos(filtros: {
  situacao?: "vigentes" | "finalizados" | "todos"
  ids?: string[]
}): Promise<{ disponivel: boolean; contratos: ContratoLinha[] }> {
  const admin = await createAdminClient()
  let q = admin
    .from("veiculo_contratos_aluguel")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
  const situacao = filtros.situacao ?? "todos"
  if (situacao === "vigentes") q = q.eq("finalizado", false)
  if (situacao === "finalizados") q = q.eq("finalizado", true)
  if (filtros.ids?.length) q = q.in("id", filtros.ids)
  const { data, error } = await q.order("vigencia_inicio", { ascending: false })
  if (error) throw new Error(`Falha ao listar contratos: ${error.message}`)
  const brutos = (data ?? []) as Record<string, unknown>[]

  const nomes = await nomesDosUsuarios(
    brutos.map((c) => String(c.responsavel_id ?? "")).filter(Boolean)
  )
  const fornecedorIds = [
    ...new Set(brutos.map((c) => String(c.fornecedor_id ?? "")).filter(Boolean)),
  ]
  const fornecedores = fornecedorIds.length
    ? await admin
        .from("empresa")
        .select("id, nome_fantasia, nome_razao")
        .in("id", fornecedorIds)
    : { data: [] }
  const fornecedorPorId = new Map(
    ((fornecedores.data ?? []) as Record<string, unknown>[]).map((f) => [
      String(f.id),
      [f.nome_fantasia, f.nome_razao].find(
        (v): v is string => typeof v === "string" && v.trim() !== ""
      ) ?? "(sem nome)",
    ])
  )

  // Quantos veículos apontam para cada contrato (coluna nova; degrada p/ 0).
  const contagem = new Map<string, number>()
  const { data: vinculos, error: erroVinculos } = await admin
    .from("veiculos")
    .select("contrato_aluguel_id")
    .not("contrato_aluguel_id", "is", null)
  if (!erroVinculos) {
    for (const v of (vinculos ?? []) as Record<string, unknown>[]) {
      const chave = String(v.contrato_aluguel_id)
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
    }
  }

  return {
    disponivel: !(erroVinculos && esquemaAusente(erroVinculos)),
    contratos: brutos.map((c) => ({
      id: String(c.id),
      numero: texto(c.numero_contrato_locadora),
      fornecedor_id: texto(c.fornecedor_id),
      fornecedorNome: c.fornecedor_id
        ? (fornecedorPorId.get(String(c.fornecedor_id)) ?? null)
        : null,
      responsavelNome: c.responsavel_id
        ? (nomes.get(String(c.responsavel_id)) ?? null)
        : null,
      vigencia_inicio: texto(c.vigencia_inicio),
      vigencia_termino: texto(c.vigencia_termino),
      valor_mensal: numero(c.valor_mensal),
      finalidade: texto(c.finalidade),
      finalizado: c.finalizado === true,
      arquivo_contrato_url: texto(c.arquivo_contrato_url),
      qtdVeiculos: contagem.get(String(c.id)) ?? 0,
      legado: Boolean(c.bubble_id),
    })),
  }
}

export type ContratoDetalhe = ContratoLinha & {
  centro_custo_id: string | null
  departamento_id: string | null
  veiculos: { id: string; placa: string | null; marca_modelo: string | null }[]
  ordens: {
    id: string
    codigo: string | null
    descricao: string | null
    situacao: string | null
    valor: number | null
    vencimento: string | null
  }[]
}

export async function buscarContrato(
  id: string
): Promise<ContratoDetalhe | null> {
  const { contratos } = await listarContratos({ ids: [id] })
  const contrato = contratos[0]
  if (!contrato) return null

  const admin = await createAdminClient()
  const [bruto, veiculosRes, ordensRes] = await Promise.all([
    admin
      .from("veiculo_contratos_aluguel")
      .select("centro_custo_id, departamento_id")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("veiculos")
      .select("id, placa, marca_modelo")
      .eq("contrato_aluguel_id", id)
      .order("placa", { ascending: true }),
    admin
      .from("ordens_pagamento")
      .select("id, codigo, descricao, situacao, valor_inicial_cobranca, vencimento")
      .eq("contrato_aluguel_id", id)
      .eq("excluido", false)
      .order("vencimento", { ascending: false }),
  ])

  return {
    ...contrato,
    centro_custo_id: texto(bruto.data?.centro_custo_id),
    departamento_id: texto(bruto.data?.departamento_id),
    veiculos: veiculosRes.error
      ? []
      : ((veiculosRes.data ?? []) as Record<string, unknown>[]).map((v) => ({
          id: String(v.id),
          placa: texto(v.placa),
          marca_modelo: texto(v.marca_modelo),
        })),
    ordens: ordensRes.error
      ? []
      : ((ordensRes.data ?? []) as Record<string, unknown>[]).map((o) => ({
          id: String(o.id),
          codigo: texto(o.codigo),
          descricao: texto(o.descricao),
          situacao: texto(o.situacao),
          valor: numero(o.valor_inicial_cobranca),
          vencimento: texto(o.vencimento),
        })),
  }
}

export type NovoContrato = {
  numero: string
  fornecedor_id: string
  responsavel_id: string
  vigencia_inicio: string
  vigencia_termino: string | null
  valor_mensal: number | null
  finalidade: string | null
  centro_custo_id: string | null
  departamento_id: string | null
  arquivo_contrato_url: string | null
}

export async function criarContrato(
  novo: NovoContrato
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculo_contratos_aluguel")
    .insert({
      numero_contrato_locadora: novo.numero,
      fornecedor_id: novo.fornecedor_id,
      responsavel_id: novo.responsavel_id,
      vigencia_inicio: novo.vigencia_inicio,
      vigencia_termino: novo.vigencia_termino,
      valor_mensal: novo.valor_mensal,
      finalidade: novo.finalidade,
      centro_custo_id: novo.centro_custo_id,
      departamento_id: novo.departamento_id,
      arquivo_contrato_url: novo.arquivo_contrato_url,
      finalizado: false,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível registrar o contrato: ${error.message}` }
  }
  return { id: data.id }
}

/** Encerra o contrato e desvincula os veículos apontados para ele. */
export async function finalizarContrato(
  id: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculo_contratos_aluguel")
    .update({ finalizado: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("finalizado", false)
    .select("id")
  if (error) return { erro: `Não foi possível finalizar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "Contrato não encontrado ou já finalizado." }
  }
  await admin
    .from("veiculos")
    .update({ contrato_aluguel_id: null, updated_at: new Date().toISOString() })
    .eq("contrato_aluguel_id", id)
  return {}
}

/** Ordem mensal do aluguel ('Em autorização', tipo legado). */
export async function gerarOrdemAluguel(
  contratoId: string,
  dados: { competencia: string; valor: number; vencimento: string | null }
): Promise<{ erro?: string }> {
  const contrato = await buscarContrato(contratoId)
  if (!contrato) return { erro: "Contrato não encontrado." }
  if (contrato.finalizado) return { erro: "O contrato está finalizado." }
  if (!contrato.fornecedor_id) {
    return { erro: "O contrato não tem fornecedor definido." }
  }
  if (dados.valor <= 0) return { erro: "Informe o valor da mensalidade." }

  const admin = await createAdminClient()
  const { error } = await admin.from("ordens_pagamento").insert({
    codigo: gerarCodigoProcesso(),
    tipo: TIPO_ORDEM_ALUGUEL,
    descricao: `Locação de veículos — contrato ${contrato.numero ?? ""} (${dados.competencia})`,
    situacao: "Em autorização",
    valor_inicial_cobranca: dados.valor,
    vencimento: dados.vencimento,
    beneficiario_fornecedor_id: contrato.fornecedor_id,
    departamento_id: contrato.departamento_id,
    centro_custo_despesa_id: contrato.centro_custo_id,
    contrato_aluguel_id: contratoId,
    excluido: false,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Não foi possível gerar a ordem: ${error.message}` }
  }
  return {}
}

// ── Resumo (dashboard) ─────────────────────────────────────────────────────

export type ResumoVeiculos = {
  frotaAtiva: number
  emUso: number | null
  solicitacoesPendentes: number | null
  cobrancasPendentes: number | null
  cnhsVencendo: Condutor[]
  segurosVencendo: { id: string; placa: string | null; vencimento: string }[]
  contratosVencendo: ContratoLinha[]
  emManutencao: number
  /** false = rodar supabase/veiculos.sql. */
  disponivel: boolean
}

export async function resumoVeiculos(): Promise<ResumoVeiculos> {
  const admin = await createAdminClient()
  const hoje = hojeSP()
  const em30dias = new Date(Date.now() + 30 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10)

  const [frota, manutencao, solicitacoes, cobrancas, seguros, condutoresRes, contratosRes] =
    await Promise.all([
      admin
        .from("veiculos")
        .select("id", { count: "exact", head: true })
        .eq("emp_proprietaria_id", await tenantAtual())
        .eq("inativo", false),
      admin
        .from("veiculos")
        .select("id", { count: "exact", head: true })
        .eq("emp_proprietaria_id", await tenantAtual())
        .eq("inativo", false)
        .eq("manutencao", true),
      admin
        .from("veiculos_agendamentos")
        .select("id", { count: "exact", head: true })
        .eq("situacao", "solicitada"),
      admin
        .from("veiculos_infracoes")
        .select("id", { count: "exact", head: true })
        .eq("cobranca_situacao", "pendente"),
      admin
        .from("veiculos")
        .select("id, placa, seguro_vencimento")
        .eq("emp_proprietaria_id", await tenantAtual())
        .eq("inativo", false)
        .not("seguro_vencimento", "is", null)
        .lte("seguro_vencimento", em30dias),
      listarCondutores(),
      listarContratos({ situacao: "vigentes" }),
    ])

  const abertas = await movimentacoesAbertas()

  const cnhsVencendo = condutoresRes.condutores.filter(
    (c) =>
      c.autorizado &&
      c.cnh_validade !== null &&
      c.cnh_validade <= em30dias
  )
  const contratosVencendo = contratosRes.contratos.filter(
    (c) =>
      c.vigencia_termino !== null &&
      c.vigencia_termino >= hoje &&
      c.vigencia_termino <= em30dias
  )

  return {
    frotaAtiva: frota.count ?? 0,
    emUso: abertas === null ? null : abertas.size,
    // Head-count com coluna ausente volta count null — sinal de rodar o SQL.
    solicitacoesPendentes: solicitacoes.error
      ? null
      : (solicitacoes.count ?? null),
    cobrancasPendentes: cobrancas.error ? null : (cobrancas.count ?? null),
    cnhsVencendo,
    segurosVencendo: ((seguros.data ?? []) as Record<string, unknown>[]).map(
      (v) => ({
        id: String(v.id),
        placa: texto(v.placa),
        vencimento: String(v.seguro_vencimento),
      })
    ),
    contratosVencendo,
    emManutencao: manutencao.count ?? 0,
    disponivel: condutoresRes.disponivel && abertas !== null,
  }
}

// ── Arquivos (bucket 'veiculos') ───────────────────────────────────────────

/** URL assinada (1h); caminhos http(s) legados do Bubble passam direto. */
export async function urlArquivoVeiculos(
  caminho: string | null
): Promise<string | null> {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage
    .from("veiculos")
    .createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

const TIPOS_ARQUIVO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
}

/** Sobe PDF/JPG/PNG no bucket 'veiculos' e devolve o caminho gravável. */
export async function subirArquivoVeiculos(
  prefixo: string,
  arquivo: File
): Promise<{ caminho?: string; erro?: string }> {
  const extensao = TIPOS_ARQUIVO[arquivo.type]
  if (!extensao) return { erro: "O arquivo deve ser PDF, JPG ou PNG." }
  if (arquivo.size > 5 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 5 MB." }
  }
  const caminho = `${prefixo}/${Date.now()}.${extensao}`
  const admin = await createAdminClient()
  const { error } = await admin.storage
    .from("veiculos")
    .upload(caminho, arquivo, { contentType: arquivo.type })
  if (error) return { erro: `Falha ao subir o arquivo: ${error.message}` }
  return { caminho }
}

// ── Lookups ────────────────────────────────────────────────────────────────

export type OpcaoUsuario = { id: string; nome: string }

/** Usuários ativos para os combos (condutor, responsável). */
export async function listarUsuariosAtivos(): Promise<OpcaoUsuario[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("permissoes")
    .select("usuario_id")
  if (error) throw new Error(`Falha ao listar usuários: ${error.message}`)
  const ids = [
    ...new Set(
      ((data ?? []) as Record<string, unknown>[])
        .map((p) => String(p.usuario_id ?? ""))
        .filter(Boolean)
    ),
  ]
  if (ids.length === 0) return []
  const { data: usuarios } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, inativo, deletado")
    .in("id", ids)
  return ((usuarios ?? []) as Record<string, unknown>[])
    .filter((u) => u.inativo !== true && u.deletado !== true)
    .map((u) => ({
      id: String(u.id),
      nome:
        [u.nome_completo, u.nome_guerra].find(
          (v): v is string => typeof v === "string" && v.trim() !== ""
        ) ?? "(sem nome)",
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}
