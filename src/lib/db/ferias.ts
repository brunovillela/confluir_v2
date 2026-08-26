import "server-only"
import { nomesDosUsuarios } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import { referenciaDaData } from "@/lib/db/carreira"
import { criarNotificacao } from "@/lib/db/notificacoes"
import { enviarPushTelegram } from "@/lib/db/telegram"
import { enviarEmail } from "@/lib/email"
import { SITE_URL } from "@/lib/env"
import { formatarData } from "@/lib/formato"
import {
  createAdminClient,
  createServiceClient,
} from "@/lib/supabase/admin"

/**
 * Férias — períodos aquisitivos/concessivos (`pessoal_ferias`, 63 migrados)
 * e gozos (`pessoal_ferias_gozo`, 48). Convenção do dado LEGADO (mantida):
 * `dias` = termino − inicio, ou seja, `termino` é a data de RETORNO ao
 * trabalho (último dia de descanso = termino − 1). `dias_disponiveis` é o
 * DIREITO do período (30 por padrão; menos quando há faltas injustificadas).
 *
 * Gozos migrados vieram com `ferias_periodo_id` NULO — o vínculo legado é
 * derivado por funcionário + início dentro do concessivo; gozos novos gravam
 * a FK.
 *
 * Regras CLT (art. 134) aplicadas na criação/edição de gozo:
 * - dentro do período concessivo;
 * - até 3 partes, uma ≥14 dias e as demais ≥5 (divisão exige concordância
 *   registrada do funcionário);
 * - início não pode cair nos 2 dias que antecedem feriado ou o DSR
 *   (sexta/sábado, DSR = domingo; feriados nacionais fixos + móveis);
 * - abono pecuniário vende 1/3: o descanso disponível cai para
 *   dias_disponiveis − floor(dias_disponiveis / 3).
 */

// ── Datas ──────────────────────────────────────────────────────────────────

function paraUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function somarDias(iso: string, dias: number): string {
  const d = paraUTC(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return paraISO(d)
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano: number): Date {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(ano, mes - 1, dia))
}

/** Feriados nacionais do ano (fixos + Carnaval, Sexta-feira Santa, Corpus Christi). */
export function feriadosNacionais(ano: number): Set<string> {
  const fixos = [
    "01-01", // Confraternização Universal
    "04-21", // Tiradentes
    "05-01", // Dia do Trabalho
    "09-07", // Independência
    "10-12", // Nossa Senhora Aparecida
    "11-02", // Finados
    "11-15", // Proclamação da República
    "11-20", // Consciência Negra (Lei 14.759/2023)
    "12-25", // Natal
  ]
  const feriados = new Set(fixos.map((f) => `${ano}-${f}`))
  const domingoPascoa = pascoa(ano)
  const mover = (dias: number) => {
    const d = new Date(domingoPascoa)
    d.setUTCDate(d.getUTCDate() + dias)
    return paraISO(d)
  }
  feriados.add(mover(-47)) // Carnaval (terça)
  feriados.add(mover(-2)) // Sexta-feira Santa
  feriados.add(mover(60)) // Corpus Christi
  return feriados
}

/**
 * CLT art. 134 §3º: férias não podem começar nos 2 dias que antecedem
 * feriado ou DSR. DSR = domingo → sexta e sábado vetados; feriado → os 2
 * dias anteriores vetados. Retorna a descrição do impedimento ou null.
 */
export function impedimentoInicioGozo(inicioISO: string): string | null {
  const d = paraUTC(inicioISO)
  const diaSemana = d.getUTCDay() // 0=domingo … 6=sábado
  if (diaSemana === 5 || diaSemana === 6) {
    return "as férias não podem iniciar na sexta ou no sábado (2 dias antes do descanso semanal de domingo)"
  }
  const ano = d.getUTCFullYear()
  const feriados = new Set([
    ...feriadosNacionais(ano),
    ...feriadosNacionais(ano + 1),
  ])
  for (const desloc of [1, 2]) {
    const alvo = somarDias(inicioISO, desloc)
    if (feriados.has(alvo)) {
      return `as férias não podem iniciar nos 2 dias que antecedem um feriado (${formatarData(alvo)})`
    }
  }
  return null
}

// ── Tipos e leitura ────────────────────────────────────────────────────────

export type GozoFerias = {
  id: string
  funcionario_id: string | null
  ferias_periodo_id: string | null
  inicio: string | null
  /** Data de RETORNO ao trabalho (convenção do legado). */
  termino: string | null
  dias: number | null
  autorizado: boolean | null
  data_autorizacao: string | null
  autorizador_id: string | null
  autorizadorNome: string | null
  autorizador_observacoes: string | null
  /** O funcionário pediu vender 1/3 (abono); aplicado ao período na autorização. */
  abono_solicitado: boolean | null
  aviso_ferias_url: string | null
  created_at: string | null
}

export type PeriodoFerias = {
  id: string
  trabalhador_id: string | null
  funcionarioNome: string | null
  aquisitivo_inicio: string | null
  aquisitivo_termino: string | null
  concessivo_inicio: string | null
  concessivo_termino: string | null
  /** Direito do período (30 padrão; menos com faltas injustificadas). */
  dias_disponiveis: number | null
  abono_pecuniario: boolean | null
  finalizado: boolean | null
  created_at: string | null
  gozos: GozoFerias[]
}

/** Dias vendidos no abono (1/3 do direito) e saldo de descanso. */
export function resumoPeriodo(p: PeriodoFerias): {
  direito: number
  abono: number
  descanso: number
  gozados: number
  saldo: number
} {
  const direito = p.dias_disponiveis ?? 0
  const abono = p.abono_pecuniario === true ? Math.floor(direito / 3) : 0
  const descanso = direito - abono
  const gozados = p.gozos.reduce((soma, g) => soma + (g.dias ?? 0), 0)
  return { direito, abono, descanso, gozados, saldo: descanso - gozados }
}

type GozoBruto = Omit<GozoFerias, "autorizadorNome">

const SELECT_GOZO =
  "id, funcionario_id, ferias_periodo_id, inicio, termino, dias, autorizado, data_autorizacao, autorizador_id, autorizador_observacoes, abono_solicitado, aviso_ferias_url, created_at"

/** Liga gozo ao período: FK quando existe; senão funcionário + início no concessivo (legado). */
function gozoDoPeriodo(
  g: GozoBruto,
  p: { id: string; trabalhador_id: string | null; concessivo_inicio: string | null; concessivo_termino: string | null }
): boolean {
  if (g.ferias_periodo_id) return g.ferias_periodo_id === p.id
  if (!g.funcionario_id || g.funcionario_id !== p.trabalhador_id) return false
  if (!g.inicio || !p.concessivo_inicio || !p.concessivo_termino) return false
  return g.inicio >= p.concessivo_inicio && g.inicio <= p.concessivo_termino
}

export async function listarPeriodosFerias(): Promise<PeriodoFerias[]> {
  const admin = await createAdminClient()
  const [periodos, gozos] = await Promise.all([
    admin
      .from("pessoal_ferias")
      .select(
        "id, trabalhador_id, aquisitivo_inicio, aquisitivo_termino, concessivo_inicio, concessivo_termino, dias_disponiveis, abono_pecuniario, finalizado, created_at"
      )
      .order("aquisitivo_inicio", { ascending: false, nullsFirst: false }),
    admin
      .from("pessoal_ferias_gozo")
      .select(SELECT_GOZO)
      .order("inicio", { ascending: true, nullsFirst: false }),
  ])
  if (periodos.error) {
    throw new Error(`Falha ao listar férias: ${periodos.error.message}`)
  }
  if (gozos.error) {
    throw new Error(`Falha ao listar gozos: ${gozos.error.message}`)
  }

  const brutosGozos = (gozos.data ?? []) as GozoBruto[]
  const nomes = await nomesDosUsuarios([
    ...new Set(
      [
        ...(periodos.data ?? []).map((p) => p.trabalhador_id),
        ...brutosGozos.map((g) => g.autorizador_id),
      ].filter((v): v is string => Boolean(v))
    ),
  ])

  return (periodos.data ?? []).map((p) => ({
    ...p,
    funcionarioNome: p.trabalhador_id
      ? (nomes.get(p.trabalhador_id) ?? null)
      : null,
    gozos: brutosGozos
      .filter((g) => gozoDoPeriodo(g, p))
      .map((g) => ({
        ...g,
        autorizadorNome: g.autorizador_id
          ? (nomes.get(g.autorizador_id) ?? null)
          : null,
      })),
  }))
}

export async function buscarPeriodoFerias(
  id: string
): Promise<PeriodoFerias | null> {
  const periodos = await listarPeriodosFerias()
  return periodos.find((p) => p.id === id) ?? null
}

/** Períodos do próprio funcionário (autosserviço, somente leitura). */
export async function minhasFerias(usuarioId: string): Promise<PeriodoFerias[]> {
  const periodos = await listarPeriodosFerias()
  return periodos.filter((p) => p.trabalhador_id === usuarioId)
}

// ── Períodos (gravação) ────────────────────────────────────────────────────

export type DadosPeriodoFerias = {
  trabalhador_id: string
  aquisitivo_inicio: string
  aquisitivo_termino: string | null
  concessivo_inicio: string | null
  concessivo_termino: string | null
  dias_disponiveis: number
  abono_pecuniario: boolean
  finalizado: boolean
}

/** Deriva as datas em branco: aquisitivo de 1 ano; concessivo = ano seguinte. */
function completarPeriodo(dados: DadosPeriodoFerias) {
  const aquisitivo_termino =
    dados.aquisitivo_termino ?? somarDias(dados.aquisitivo_inicio, 365)
  const concessivo_inicio = dados.concessivo_inicio ?? aquisitivo_termino
  const concessivo_termino =
    dados.concessivo_termino ?? somarDias(concessivo_inicio, 365)
  return {
    trabalhador_id: dados.trabalhador_id,
    aquisitivo_inicio: dados.aquisitivo_inicio,
    aquisitivo_termino,
    concessivo_inicio,
    concessivo_termino,
    dias_disponiveis: dados.dias_disponiveis,
    abono_pecuniario: dados.abono_pecuniario,
    finalizado: dados.finalizado,
  }
}

export async function criarPeriodoFerias(
  dados: DadosPeriodoFerias
): Promise<{ erro?: string; id?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_ferias")
    .insert({
      ...completarPeriodo(dados),
      emp_proprietaria_id: await tenantAtual(),
      empregador_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error || !data) {
    return { erro: `Não foi possível criar: ${error?.message}` }
  }
  return { id: data.id }
}

export async function atualizarPeriodoFerias(
  id: string,
  dados: DadosPeriodoFerias
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_ferias")
    .update(
      { ...completarPeriodo(dados), updated_at: new Date().toISOString() },
      { count: "exact" }
    )
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Período não encontrado." }
  return {}
}

export async function excluirPeriodoFerias(
  id: string
): Promise<{ erro?: string }> {
  const periodo = await buscarPeriodoFerias(id)
  if (!periodo) return { erro: "Período não encontrado." }
  if (periodo.gozos.length > 0) {
    return {
      erro: `O período tem ${periodo.gozos.length} gozo${periodo.gozos.length === 1 ? "" : "s"} — exclua os gozos antes.`,
    }
  }
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_ferias").delete().eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return {}
}

// ── Gozos (gravação com regras CLT) ────────────────────────────────────────

export type DadosGozo = {
  inicio: string
  dias: number
  /** Divisão em 2+ partes exige concordância registrada do funcionário. */
  divisaoAcordada: boolean
  autorizador_observacoes: string | null
  /** Caminho do aviso no bucket 'pessoal'; null mantém o atual. */
  aviso: string | null
}

/** Valida o CONJUNTO de gozos do período com o novo/editado incluído. */
function validarGozos(
  periodo: PeriodoFerias,
  outros: GozoFerias[],
  novo: { inicio: string; dias: number; divisaoAcordada: boolean }
): string | null {
  const { descanso } = resumoPeriodo({ ...periodo, gozos: [] })
  const ultimoDia = somarDias(novo.inicio, novo.dias - 1)
  const retorno = somarDias(novo.inicio, novo.dias)

  if (novo.dias < 5) {
    return "Nenhum período de gozo pode ter menos de 5 dias corridos (CLT art. 134)."
  }

  if (
    periodo.concessivo_inicio &&
    periodo.concessivo_termino &&
    (novo.inicio < periodo.concessivo_inicio ||
      ultimoDia > periodo.concessivo_termino)
  ) {
    return `O gozo deve estar dentro do período concessivo (${formatarData(periodo.concessivo_inicio)} a ${formatarData(periodo.concessivo_termino)}).`
  }

  const impedimento = impedimentoInicioGozo(novo.inicio)
  if (impedimento) return `Início inválido: ${impedimento}.`

  // Sobreposição com os demais gozos do período.
  for (const g of outros) {
    if (!g.inicio || !g.termino) continue
    if (novo.inicio < g.termino && g.inicio < retorno) {
      return `O gozo sobrepõe o período ${formatarData(g.inicio)} – ${formatarData(g.termino)}.`
    }
  }

  const partes = [...outros.map((g) => g.dias ?? 0), novo.dias]
  if (partes.length > 3) {
    return "As férias podem ser divididas em no máximo 3 períodos (CLT art. 134)."
  }
  if (partes.length > 1 && !novo.divisaoAcordada) {
    return "A divisão das férias exige a concordância do funcionário — confirme o acordo (ideal por escrito)."
  }

  const total = partes.reduce((s, d) => s + d, 0)
  if (total > descanso) {
    return `A soma dos gozos (${total} dias) passa do descanso disponível (${descanso} dias${periodo.abono_pecuniario ? ", já descontado o abono" : ""}).`
  }

  const temParteMinima = partes.some((d) => d >= 14)
  if (!temParteMinima && (partes.length === 3 || total === descanso)) {
    return "Um dos períodos deve ter no mínimo 14 dias corridos (CLT art. 134)."
  }

  return null
}

async function registroGozo(
  periodo: PeriodoFerias,
  dados: DadosGozo
): Promise<Record<string, unknown>> {
  const termino = somarDias(dados.inicio, dados.dias)
  const { mes, ano } = referenciaDaData(dados.inicio)
  return {
    funcionario_id: periodo.trabalhador_id,
    ferias_periodo_id: periodo.id,
    inicio: dados.inicio,
    termino,
    dias: dados.dias,
    mes,
    ano,
    autorizador_observacoes: dados.autorizador_observacoes,
    ...(dados.aviso !== null ? { aviso_ferias_url: dados.aviso } : {}),
  }
}

export async function criarGozo(
  periodoId: string,
  dados: DadosGozo
): Promise<{ erro?: string }> {
  const periodo = await buscarPeriodoFerias(periodoId)
  if (!periodo) return { erro: "Período de férias não encontrado." }
  if (periodo.finalizado === true) {
    return { erro: "Período finalizado não aceita novos gozos." }
  }

  const invalido = validarGozos(periodo, periodo.gozos, dados)
  if (invalido) return { erro: invalido }

  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_ferias_gozo").insert({
    ...(await registroGozo(periodo, dados)),
    autorizado: false,
    emp_proprietaria_id: await tenantAtual(),
    empregador_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível criar: ${error.message}` }
  return {}
}

// ── Autosserviço do funcionário ────────────────────────────────────────────

/**
 * Funcionário solicita um gozo das PRÓPRIAS férias (autosserviço). Grava com
 * `autorizado=false` — entra na fila do departamento de pessoal autorizar. A
 * própria solicitação é a concordância do funcionário com a divisão (CLT).
 */
export async function solicitarGozo(
  usuarioId: string,
  dados: {
    periodoId: string
    inicio: string
    termino: string
    /** Vender 1/3 das férias em dinheiro (abono pecuniário, CLT art. 143). */
    abono?: boolean
  }
): Promise<{ erro?: string }> {
  const periodo = await buscarPeriodoFerias(dados.periodoId)
  if (!periodo) return { erro: "Período de férias não encontrado." }
  if (periodo.trabalhador_id !== usuarioId) {
    return { erro: "Este período de férias não é seu." }
  }
  if (periodo.finalizado === true) {
    return { erro: "Este período já foi finalizado e não aceita novos gozos." }
  }
  if (!dados.inicio || !dados.termino) {
    return { erro: "Informe o início e a data de retorno." }
  }
  if (dados.termino <= dados.inicio) {
    return { erro: "O retorno ao trabalho deve ser depois do início." }
  }
  const dias = Math.round(
    (paraUTC(dados.termino).getTime() - paraUTC(dados.inicio).getTime()) /
      86_400_000
  )
  const gozo: DadosGozo = {
    inicio: dados.inicio,
    dias,
    divisaoAcordada: true,
    autorizador_observacoes: null,
    aviso: null,
  }
  // Com abono, o descanso disponível cai 1/3 — valida já descontando, mas o
  // abono só é APLICADO ao período quando o gestor autoriza o gozo.
  const abono = dados.abono === true
  const periodoEfetivo = abono
    ? { ...periodo, abono_pecuniario: true }
    : periodo
  const invalido = validarGozos(periodoEfetivo, periodoEfetivo.gozos, gozo)
  if (invalido) return { erro: invalido }

  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_ferias_gozo").insert({
    ...(await registroGozo(periodo, gozo)),
    autorizado: false,
    abono_solicitado: abono,
    emp_proprietaria_id: await tenantAtual(),
    empregador_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível solicitar: ${error.message}` }
  return {}
}

/**
 * Notifica (sino) quem tem `pessoal_gestao` no tenant. `permissoes` é deny-all
 * para o JWT do tenant (o proxy a lê por service role), então lemos igual e
 * restringimos os destinatários ao tenant via `usuarios.emp_proprietaria_id`.
 */
async function notificarPessoalGestao(
  texto: string,
  excetoUsuarioId: string | null
): Promise<void> {
  const empId = await tenantAtual()
  const service = createServiceClient()
  const { data: perms } = await service
    .from("permissoes")
    .select("usuario_id")
    .eq("pessoal_gestao", true)
  const ids = [
    ...new Set(
      (perms ?? [])
        .map((p) => p.usuario_id)
        .filter((v): v is string => Boolean(v))
    ),
  ]
  if (ids.length === 0) return
  const { data: us } = await service
    .from("usuarios")
    .select("id")
    .in("id", ids)
    .eq("emp_proprietaria_id", empId)
  for (const u of us ?? []) {
    if (excetoUsuarioId && u.id === excetoUsuarioId) continue
    try {
      await criarNotificacao({ usuarioId: String(u.id), texto })
    } catch (e) {
      console.error("Falha ao notificar pessoal:", e)
    }
  }
}

/**
 * Funcionário cancela o PRÓPRIO gozo — inclusive já autorizado (trocas ocorrem
 * com frequência, por necessidade dele ou do empregador). Quando o gozo já
 * estava AUTORIZADO, o departamento de pessoal é avisado (sino) para tratar a
 * troca. O confirm da UI reforça o aviso; aqui só garante que o gozo é dele.
 */
export async function cancelarMinhaSolicitacaoGozo(
  gozoId: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_ferias_gozo")
    .select("id, funcionario_id, autorizado, inicio, termino, dias")
    .eq("id", gozoId)
    .maybeSingle()
  if (error) return { erro: `Falha ao cancelar: ${error.message}` }
  if (!data || data.funcionario_id !== usuarioId) {
    return { erro: "Solicitação não encontrada." }
  }
  const eraAutorizado = data.autorizado === true
  const { error: erroDel, count } = await admin
    .from("pessoal_ferias_gozo")
    .delete({ count: "exact" })
    .eq("id", gozoId)
    .eq("funcionario_id", usuarioId)
  if (erroDel) return { erro: `Não foi possível cancelar: ${erroDel.message}` }
  if (count === 0) return { erro: "Solicitação não encontrada." }

  if (eraAutorizado) {
    const nomes = await nomesDosUsuarios([usuarioId])
    const nome = nomes.get(usuarioId) ?? "Um funcionário"
    const mensagem = `${nome} cancelou férias que já estavam autorizadas (${data.dias ?? "?"} dias a partir de ${formatarData(data.inicio)}, retorno em ${formatarData(data.termino)}). Verifique a necessidade de troca.`
    try {
      await notificarPessoalGestao(mensagem, usuarioId)
    } catch (e) {
      console.error("Falha ao notificar pessoal do cancelamento:", e)
    }
  }
  return {}
}

export async function atualizarGozo(
  periodoId: string,
  gozoId: string,
  dados: DadosGozo
): Promise<{ erro?: string }> {
  const periodo = await buscarPeriodoFerias(periodoId)
  if (!periodo) return { erro: "Período de férias não encontrado." }

  const atual = periodo.gozos.find((g) => g.id === gozoId)
  if (!atual) return { erro: "Gozo não encontrado neste período." }

  const outros = periodo.gozos.filter((g) => g.id !== gozoId)
  const invalido = validarGozos(periodo, outros, dados)
  if (invalido) return { erro: invalido }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_ferias_gozo")
    .update(
      {
        ...(await registroGozo(periodo, dados)),
        updated_at: new Date().toISOString(),
      },
      { count: "exact" }
    )
    .eq("id", gozoId)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Gozo não encontrado." }
  return {}
}

export async function excluirGozo(gozoId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_ferias_gozo")
    .delete({ count: "exact" })
    .eq("id", gozoId)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (count === 0) return { erro: "Gozo não encontrado." }
  return {}
}

/** Autoriza/desfaz e avisa o funcionário (autorização apenas). */
export async function definirAutorizacaoGozo(
  gozoId: string,
  autorizadorId: string,
  autorizado: boolean
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
  const { data, error } = await admin
    .from("pessoal_ferias_gozo")
    .update({
      autorizado,
      data_autorizacao: autorizado ? hoje : null,
      autorizador_id: autorizado ? autorizadorId : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", gozoId)
    .select(
      "funcionario_id, inicio, termino, dias, abono_solicitado, ferias_periodo_id"
    )
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if ((data ?? []).length === 0) return { erro: "Gozo não encontrado." }

  const g = data![0]

  // Autorizar um gozo com abono pedido CONFIRMA a venda de 1/3 no período.
  let abonoConfirmado = false
  if (autorizado && g.abono_solicitado === true && g.ferias_periodo_id) {
    const { error: erroAbono } = await admin
      .from("pessoal_ferias")
      .update({ abono_pecuniario: true, updated_at: new Date().toISOString() })
      .eq("id", g.ferias_periodo_id)
      .eq("emp_proprietaria_id", await tenantAtual())
    if (erroAbono) {
      return { erro: `Gozo autorizado, mas falhou ao aplicar o abono: ${erroAbono.message}` }
    }
    abonoConfirmado = true
  }

  if (autorizado && g.funcionario_id) {
    const mensagem = `Suas férias de ${g.dias ?? "?"} dias a partir de ${formatarData(g.inicio)} (retorno em ${formatarData(g.termino)}) foram autorizadas.${abonoConfirmado ? " O abono pecuniário (venda de 1/3) também foi confirmado." : ""}`
    try {
      await criarNotificacao({ usuarioId: g.funcionario_id, texto: mensagem })
    } catch (e) {
      console.error("Falha ao notificar férias:", e)
    }
    await enviarPushTelegram(g.funcionario_id, mensagem, "ferias")
    const { data: usuario } = await admin
      .from("usuarios")
      .select("email, nome_completo, nome_guerra")
      .eq("id", g.funcionario_id)
      .maybeSingle()
    if (usuario?.email) {
      const nome = usuario.nome_completo ?? usuario.nome_guerra ?? null
      await enviarEmail({
        email: usuario.email,
        nome,
        assunto: "Férias autorizadas — {ENTIDADE}",
        html: `<p>Olá${nome ? `, ${String(nome).split(" ")[0]}` : ""}!</p><p>${mensagem}</p><p>Acompanhe em <a href="${SITE_URL}/painel/perfil/contracheques">${SITE_URL}/painel/perfil/contracheques</a>.</p><p>Confluir — {ENTIDADE}</p>`,
      })
    }
  }
  return {}
}
