import "server-only"

import { esquemaAusente, hojeSP, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { listarDepartamentos } from "@/lib/db/compras"
import { listarEventos } from "@/lib/db/eventos"
import { formatarData } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"
import {
  type BeneficiarioViagem,
  type CriterioHorario,
  type FiltroViagens,
  type ItemViagemEntrada,
  type ModalPassagem,
  type SituacaoViagem,
  type TipoItemViagem,
  validarItensViagem,
} from "@/lib/viagens-constantes"

/**
 * Viagens — passagens e hospedagens pedidas para diretor, funcionário ou
 * convidado. Uma solicitação é a viagem inteira; cada trecho ou estadia é um
 * item (`viagens_itens`). A gestão atende com agências e fatura pela estrutura
 * de Compras (fases 2 e 3). Leituras degradam com `disponivel: false` até
 * supabase/viagens.sql rodar.
 */

export type ItemViagem = {
  id: string
  tipo: TipoItemViagem
  ordem: number
  modal: ModalPassagem | null
  origem: string | null
  destino: string | null
  dataViagem: string | null
  saidaCriterio: CriterioHorario | null
  saidaHora: string | null
  chegadaCriterio: CriterioHorario | null
  chegadaHora: string | null
  bagagemExtra: boolean
  bagagemDescricao: string | null
  cidade: string | null
  checkin: string | null
  checkout: string | null
  necessidadesEspeciais: string | null
  observacoes: string | null
  fornecedorId: string | null
  /** Agência ou operadora que emitiu a reserva. */
  fornecedorNome: string | null
  localizador: string | null
  reservaDescricao: string | null
  valor: number | null
  /** Caminho do bilhete/voucher no bucket `compras`. */
  voucher: string | null
  /** A gestão já registrou a reserva deste item. */
  reservado: boolean
}

export type Viagem = {
  id: string
  numero: number | null
  beneficiarioTipo: BeneficiarioViagem
  beneficiarioUsuarioId: string | null
  /** Nome de quem viaja — do usuário ou do convidado. */
  beneficiarioNome: string
  convidadoCpf: string | null
  convidadoNascimento: string | null
  convidadoEmail: string | null
  convidadoTelefone: string | null
  solicitanteId: string | null
  solicitanteNome: string | null
  departamentoId: string | null
  departamentoNome: string | null
  eventoId: string | null
  eventoTitulo: string | null
  motivo: string
  situacao: SituacaoViagem
  motivoSituacao: string | null
  atendidoPorNome: string | null
  atendidoEm: string | null
  createdAt: string
  itens: ItemViagem[]
  /** Primeira data da viagem (ida ou check-in) — ordena e resume a lista. */
  inicio: string | null
}

const SELECT_VIAGEM =
  "id, numero, beneficiario_tipo, beneficiario_usuario_id, convidado_nome, convidado_cpf, convidado_nascimento, convidado_email, convidado_telefone, solicitante_id, departamento_id, evento_id, motivo, situacao, motivo_situacao, atendido_por, atendido_em, created_at, empresa_departamentos(departamento), eventos(titulo), viagens_itens(*, fornecedor:empresa!viagens_itens_fornecedor_id_fkey(nome_fantasia, nome_razao))"

function hora(v: unknown): string | null {
  const s = texto(v)
  return s ? s.slice(0, 5) : null
}

function mapItem(i: Record<string, unknown>): ItemViagem {
  return {
    id: String(i.id),
    tipo: i.tipo as TipoItemViagem,
    ordem: Number(i.ordem ?? 0),
    modal: (i.modal as ModalPassagem | null) ?? null,
    origem: texto(i.origem),
    destino: texto(i.destino),
    dataViagem: texto(i.data_viagem),
    saidaCriterio: (i.saida_criterio as CriterioHorario | null) ?? null,
    saidaHora: hora(i.saida_hora),
    chegadaCriterio: (i.chegada_criterio as CriterioHorario | null) ?? null,
    chegadaHora: hora(i.chegada_hora),
    bagagemExtra: i.bagagem_extra === true,
    bagagemDescricao: texto(i.bagagem_descricao),
    cidade: texto(i.cidade),
    checkin: texto(i.checkin),
    checkout: texto(i.checkout),
    necessidadesEspeciais: texto(i.necessidades_especiais),
    observacoes: texto(i.observacoes),
    fornecedorId: texto(i.fornecedor_id),
    fornecedorNome: nomeEmpresa(i.fornecedor),
    localizador: texto(i.localizador),
    reservaDescricao: texto(i.reserva_descricao),
    valor: i.valor === null || i.valor === undefined ? null : Number(i.valor),
    voucher: texto(i.voucher),
    reservado: !!(texto(i.localizador) || texto(i.reserva_descricao)),
  }
}

function nomeEmpresa(v: unknown): string | null {
  const e = v as { nome_fantasia?: unknown; nome_razao?: unknown } | null
  return e ? (texto(e.nome_fantasia) ?? texto(e.nome_razao)) : null
}

async function normalizar(linhas: Record<string, unknown>[]): Promise<Viagem[]> {
  const nomes = await nomesDosUsuarios(
    linhas
      .flatMap((l) => [
        texto(l.beneficiario_usuario_id),
        texto(l.solicitante_id),
        texto(l.atendido_por),
      ])
      .filter((v): v is string => !!v)
  )
  return linhas.map((l) => {
    const itens = ((l.viagens_itens ?? []) as Record<string, unknown>[])
      .map(mapItem)
      .sort((a, b) => a.ordem - b.ordem)
    const datas = itens
      .map((i) => (i.tipo === "passagem" ? i.dataViagem : i.checkin))
      .filter((d): d is string => !!d)
      .sort()
    const beneficiarioUsuarioId = texto(l.beneficiario_usuario_id)
    const solicitanteId = texto(l.solicitante_id)
    const depto = l.empresa_departamentos as { departamento?: string } | null
    const evento = l.eventos as { titulo?: string } | null
    return {
      id: String(l.id),
      numero: l.numero === null || l.numero === undefined ? null : Number(l.numero),
      beneficiarioTipo: l.beneficiario_tipo as BeneficiarioViagem,
      beneficiarioUsuarioId,
      beneficiarioNome:
        texto(l.convidado_nome) ??
        (beneficiarioUsuarioId ? nomes.get(beneficiarioUsuarioId) : null) ??
        "(sem nome)",
      convidadoCpf: texto(l.convidado_cpf),
      convidadoNascimento: texto(l.convidado_nascimento),
      convidadoEmail: texto(l.convidado_email),
      convidadoTelefone: texto(l.convidado_telefone),
      solicitanteId,
      solicitanteNome: solicitanteId ? (nomes.get(solicitanteId) ?? null) : null,
      departamentoId: texto(l.departamento_id),
      departamentoNome: texto(depto?.departamento),
      eventoId: texto(l.evento_id),
      eventoTitulo: texto(evento?.titulo),
      motivo: String(l.motivo ?? ""),
      situacao: l.situacao as SituacaoViagem,
      motivoSituacao: texto(l.motivo_situacao),
      atendidoPorNome: texto(l.atendido_por) ? (nomes.get(String(l.atendido_por)) ?? null) : null,
      atendidoEm: texto(l.atendido_em),
      createdAt: String(l.created_at),
      itens,
      inicio: datas[0] ?? null,
    }
  })
}

// ── Leituras ────────────────────────────────────────────────────────────────

/**
 * Viagens em que a pessoa VIAJA. As que a gestão lançou por outros ficam de
 * fora — senão a lista de quem opera Viagens seria a de todo mundo.
 */
export async function minhasViagens(usuarioId: string): Promise<{
  disponivel: boolean
  viagens: Viagem[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("viagens_solicitacoes")
    .select(SELECT_VIAGEM)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("beneficiario_usuario_id", usuarioId)
    .order("created_at", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, viagens: [] }
    throw new Error(`Falha ao listar suas viagens: ${error.message}`)
  }
  return { disponivel: true, viagens: await normalizar((data ?? []) as Record<string, unknown>[]) }
}

/**
 * Todas as viagens do tenant, mais recentes primeiro (gestão). Em páginas de
 * 1.000: sem `.range` o PostgREST corta em 1.000 linhas calado.
 */
export async function listarViagens(): Promise<{ disponivel: boolean; viagens: Viagem[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linhas: Record<string, unknown>[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin
      .from("viagens_solicitacoes")
      .select(SELECT_VIAGEM)
      .eq("emp_proprietaria_id", emp)
      .order("created_at", { ascending: false })
      .range(de, de + 999)
    if (error) {
      if (esquemaAusente(error)) return { disponivel: false, viagens: [] }
      throw new Error(`Falha ao listar as viagens: ${error.message}`)
    }
    linhas.push(...((data ?? []) as Record<string, unknown>[]))
    if (!data || data.length < 1000) break
  }
  return { disponivel: true, viagens: await normalizar(linhas) }
}

/**
 * Filtro da lista da gestão. Tipo: a viagem tem ao menos um item daquele
 * tipo. Período: pela primeira data da viagem (ida ou check-in).
 */
export function filtrarViagens(viagens: Viagem[], filtro: FiltroViagens): Viagem[] {
  const pessoa = filtro.pessoa ? semAcento(filtro.pessoa) : ""
  return viagens.filter(
    (v) =>
      (!pessoa || semAcento(v.beneficiarioNome).includes(pessoa)) &&
      (!filtro.tipo || v.itens.some((i) => i.tipo === filtro.tipo)) &&
      (!filtro.situacao ||
        (filtro.situacao === "abertas"
          ? v.situacao === "solicitada" || v.situacao === "em_atendimento"
          : v.situacao === filtro.situacao)) &&
      (!filtro.quadro || v.beneficiarioTipo === filtro.quadro) &&
      (!filtro.eventoId || v.eventoId === filtro.eventoId) &&
      (!filtro.fornecedorId || v.itens.some((i) => i.fornecedorId === filtro.fornecedorId)) &&
      (!filtro.de || (v.inicio !== null && v.inicio >= filtro.de)) &&
      (!filtro.ate || (v.inicio !== null && v.inicio <= filtro.ate))
  )
}

export async function buscarViagem(id: string): Promise<Viagem | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("viagens_solicitacoes")
    .select(SELECT_VIAGEM)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", id)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao buscar a viagem: ${error.message}`)
  }
  if (!data) return null
  const [viagem] = await normalizar([data as Record<string, unknown>])
  return viagem ?? null
}

/** Departamentos e eventos que ainda não terminaram, para os selects do pedido. */
export async function opcoesDoFormViagem(): Promise<{
  departamentos: { id: string; nome: string }[]
  eventos: { id: string; nome: string }[]
}> {
  const [departamentos, { eventos }] = await Promise.all([
    listarDepartamentos(),
    listarEventos({ situacao: "publicado" }).catch(() => ({ eventos: [] })),
  ])
  const hoje = hojeSP()
  return {
    departamentos,
    eventos: eventos
      .filter((e) => (e.termino ?? e.inicio ?? hoje).slice(0, 10) >= hoje)
      .map((e) => ({
        id: e.id,
        nome: `${e.titulo ?? "(sem título)"}${e.inicio ? ` — ${formatarData(e.inicio)}` : ""}`,
      })),
  }
}

// ── Escrita ─────────────────────────────────────────────────────────────────

export type NovaViagem = {
  beneficiarioTipo: BeneficiarioViagem
  beneficiarioUsuarioId: string | null
  convidado?: {
    nome: string
    cpf: string | null
    nascimento: string | null
    email: string | null
    telefone: string | null
  }
  solicitanteId: string
  departamentoId: string | null
  eventoId: string | null
  motivo: string
  itens: ItemViagemEntrada[]
}

function linhaDoItem(item: ItemViagemEntrada, ordem: number): Record<string, unknown> {
  const comum = {
    tipo: item.tipo,
    ordem,
    necessidades_especiais: item.necessidades,
    observacoes: item.observacoes,
  }
  if (item.tipo === "passagem") {
    return {
      ...comum,
      modal: item.modal,
      origem: item.origem,
      destino: item.destino,
      data_viagem: item.data,
      saida_criterio: item.saidaCriterio,
      saida_hora: item.saidaHora,
      chegada_criterio: item.chegadaCriterio,
      chegada_hora: item.chegadaHora,
      bagagem_extra: item.bagagemExtra,
      bagagem_descricao: item.bagagemDescricao,
    }
  }
  // Numa inserção em lote, o PostgREST põe NULL (e não o default) nas colunas
  // que só aparecem nas outras linhas — bagagem_extra é NOT NULL.
  return {
    ...comum,
    cidade: item.cidade,
    checkin: item.checkin,
    checkout: item.checkout,
    bagagem_extra: false,
  }
}

/** Lê os itens que o formulário manda em JSON (campo `itens`) e valida. */
export function lerItensDoForm(
  formData: FormData
): { itens: ItemViagemEntrada[] } | { erro: string } {
  let bruto: unknown
  try {
    bruto = JSON.parse(String(formData.get("itens") ?? "[]"))
  } catch {
    return { erro: "Não foi possível ler os itens da viagem." }
  }
  return validarItensViagem(bruto, hojeSP())
}

/** Grava a viagem e os itens; se os itens falharem, desfaz a solicitação. */
export async function criarViagem(nova: NovaViagem): Promise<{ erro?: string; id?: string }> {
  if (nova.itens.length === 0) return { erro: "Acrescente pelo menos uma passagem ou hospedagem." }
  if (nova.beneficiarioTipo === "convidado" && !nova.convidado?.nome) {
    return { erro: "Informe o nome do convidado." }
  }
  if (nova.beneficiarioTipo !== "convidado" && !nova.beneficiarioUsuarioId) {
    return { erro: "Escolha quem vai viajar." }
  }

  const emp = await tenantAtual()
  const admin = await createAdminClient()
  const { data: criada, error } = await admin
    .from("viagens_solicitacoes")
    .insert({
      emp_proprietaria_id: emp,
      beneficiario_tipo: nova.beneficiarioTipo,
      beneficiario_usuario_id:
        nova.beneficiarioTipo === "convidado" ? null : nova.beneficiarioUsuarioId,
      convidado_nome: nova.convidado?.nome ?? null,
      convidado_cpf: nova.convidado?.cpf ?? null,
      convidado_nascimento: nova.convidado?.nascimento ?? null,
      convidado_email: nova.convidado?.email ?? null,
      convidado_telefone: nova.convidado?.telefone ?? null,
      solicitante_id: nova.solicitanteId,
      departamento_id: nova.departamentoId,
      evento_id: nova.eventoId,
      motivo: nova.motivo,
    })
    .select("id")
    .single()
  if (error || !criada) {
    if (error && esquemaAusente(error)) {
      return { erro: "Viagens ainda não configuradas — rode supabase/viagens.sql." }
    }
    return { erro: `Não foi possível registrar a viagem: ${error?.message ?? "sem retorno"}` }
  }
  const id = String(criada.id)

  const { error: erroItens } = await admin.from("viagens_itens").insert(
    nova.itens.map((item, i) => ({
      ...linhaDoItem(item, i),
      emp_proprietaria_id: emp,
      solicitacao_id: id,
    }))
  )
  if (erroItens) {
    await admin.from("viagens_solicitacoes").delete().eq("id", id)
    return { erro: `Não foi possível registrar os itens: ${erroItens.message}` }
  }
  return { id }
}

/**
 * Cancela a viagem enquanto ninguém começou a atender. Quem pode: quem viaja
 * ou quem pediu. Depois disso, o cancelamento é com a gestão (a reserva pode
 * já ter custo).
 */
export async function cancelarMinhaViagem(
  id: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const viagem = await buscarViagem(id)
  if (!viagem) return { erro: "Viagem não encontrada." }
  if (viagem.beneficiarioUsuarioId !== usuarioId && viagem.solicitanteId !== usuarioId) {
    return { erro: "Esta viagem não é sua." }
  }
  if (viagem.situacao !== "solicitada") {
    return { erro: "O atendimento já começou — peça o cancelamento à equipe de viagens." }
  }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("viagens_solicitacoes")
    .update({
      situacao: "cancelada",
      motivo_situacao: "Cancelada por quem pediu.",
      encerrado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("situacao", "solicitada")
  if (error) return { erro: `Não foi possível cancelar: ${error.message}` }
  return {}
}
