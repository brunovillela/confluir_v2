import "server-only"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { randomInt, randomUUID } from "node:crypto"

import { tenantAtual } from "@/lib/tenant"

import { PERMISSOES_USUARIO_FK } from "@/lib/permissoes"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
import { enviarTelegram } from "@/lib/telegram"
import { semAcento } from "@/lib/texto"
import {
  normalizarPreferencias,
  type EventoTelegram,
  type PreferenciasTelegram,
} from "@/lib/telegram-eventos"

/**
 * Vínculo do usuário com o bot do Telegram.
 *
 * Duas metades:
 * - No PAINEL (tenant logado): gerar código / ver status / desvincular usam
 *   `createAdminClient` (JWT do tenant) e filtram por `emp_proprietaria_id`.
 * - No WEBHOOK (sem tenant): casar o `chat_id` com o usuário é CROSS-TENANT →
 *   `createServiceClient` (service role), pois o Telegram não sabe de tenant.
 */

const VALIDADE_MIN = 15

export async function statusTelegram(usuarioId: string): Promise<{
  vinculado: boolean
  telefone: string | null
  telefonePendente: string | null
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("usuarios")
    .select("telegram_chat_id, telegram_telefone, telegram_tel_pendente")
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) {
    // colunas de telefone ainda não existem → degrada só com o vínculo.
    const basico = await admin
      .from("usuarios")
      .select("telegram_chat_id")
      .eq("id", usuarioId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle()
    return {
      vinculado: Boolean(texto(basico.data?.telegram_chat_id)),
      telefone: null,
      telefonePendente: null,
    }
  }
  return {
    vinculado: Boolean(texto(data?.telegram_chat_id)),
    telefone: texto(data?.telegram_telefone),
    telefonePendente: texto(data?.telegram_tel_pendente),
  }
}

/** Gera um código de vínculo (expira em 15 min) e devolve o código. */
export async function gerarCodigoTelegram(
  usuarioId: string
): Promise<{ codigo?: string; erro?: string }> {
  const codigo = randomUUID().replace(/-/g, "").slice(0, 12)
  const expira = new Date(Date.now() + VALIDADE_MIN * 60_000).toISOString()
  const admin = await createAdminClient()
  const { error } = await admin
    .from("usuarios")
    .update({
      telegram_vinculo_codigo: codigo,
      telegram_vinculo_expira: expira,
    })
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    if (["PGRST204", "42703"].includes(error.code ?? "")) {
      return { erro: "Rode supabase/telegram.sql antes de usar o Telegram." }
    }
    return { erro: `Não foi possível gerar o código: ${error.message}` }
  }
  return { codigo }
}

export async function desvincularTelegram(
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("usuarios")
    .update({
      telegram_chat_id: null,
      telegram_vinculo_codigo: null,
      telegram_vinculo_expira: null,
      // desvincular zera também a confirmação de telefone.
      telegram_telefone: null,
      telegram_tel_pendente: null,
      telegram_tel_codigo: null,
      telegram_tel_expira: null,
    })
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error && !["PGRST204", "42703"].includes(error.code ?? "")) {
    return { erro: error.message }
  }
  return {}
}

const VALIDADE_TEL_MIN = 10

/** Só dígitos; aceita 10–13 (DDD, celular, com/sem +55). */
function telefoneValido(digitos: string): boolean {
  return digitos.length >= 10 && digitos.length <= 13
}

/**
 * Envia um código de confirmação PELO Telegram para o chat já vinculado. O bot
 * não inicia conversa por telefone; por isso exige vínculo (chat_id) antes.
 */
export async function solicitarCodigoTelefone(
  usuarioId: string,
  telefoneBruto: string
): Promise<{ erro?: string }> {
  const digitos = (telefoneBruto ?? "").replace(/\D/g, "")
  if (!telefoneValido(digitos)) {
    return { erro: "Telefone inválido. Informe com DDD (ex.: 21 99999-9999)." }
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("usuarios")
    .select("telegram_chat_id")
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  const chatId = texto(data?.telegram_chat_id)
  if (!chatId) {
    return { erro: "Vincule o Telegram antes de confirmar o telefone." }
  }
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const expira = new Date(Date.now() + VALIDADE_TEL_MIN * 60_000).toISOString()
  const { error } = await admin
    .from("usuarios")
    .update({
      telegram_tel_pendente: digitos,
      telegram_tel_codigo: codigo,
      telegram_tel_expira: expira,
    })
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", emp)
  if (error) {
    if (["PGRST204", "42703"].includes(error.code ?? "")) {
      return { erro: "Rode supabase/telegram-telefone.sql antes de confirmar o telefone." }
    }
    return { erro: error.message }
  }
  const enviado = await enviarTelegram({
    chatId,
    texto: `Seu código de confirmação do Confluir é ${codigo}. Vale por ${VALIDADE_TEL_MIN} minutos.`,
    formato: null,
  })
  if (!enviado) {
    return { erro: "Não consegui enviar o código pelo Telegram. Confira o vínculo e tente de novo." }
  }
  return {}
}

/** Confere o código digitado no painel e confirma o telefone pendente. */
export async function confirmarCodigoTelefone(
  usuarioId: string,
  codigoDigitado: string
): Promise<{ erro?: string; telefone?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("usuarios")
    .select("telegram_tel_codigo, telegram_tel_expira, telegram_tel_pendente")
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  const codigo = texto(data?.telegram_tel_codigo)
  const pendente = texto(data?.telegram_tel_pendente)
  if (!codigo || !pendente) {
    return { erro: "Nenhuma confirmação pendente. Solicite um novo código." }
  }
  const exp = texto(data?.telegram_tel_expira)
  if (exp && new Date(exp) < new Date()) {
    return { erro: "Código expirado. Solicite um novo." }
  }
  if ((codigoDigitado ?? "").replace(/\D/g, "") !== codigo) {
    return { erro: "Código incorreto." }
  }
  const { error } = await admin
    .from("usuarios")
    .update({
      telegram_telefone: pendente,
      telegram_tel_pendente: null,
      telegram_tel_codigo: null,
      telegram_tel_expira: null,
    })
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: error.message }
  return { telefone: pendente }
}

/**
 * Push do Telegram para um usuário (best-effort, NUNCA lança). Chamado dos
 * pontos de evento do painel logado (liberação de contracheque, aprovação de
 * férias/diária), que já rodam sob tenant → `createAdminClient` (RLS escopa ao
 * tenant). Silencioso se o usuário não vinculou o Telegram, se a coluna ainda
 * não existe, ou se o bot não está configurado. Simétrico ao `enviarEmail`:
 * usa a mesma `mensagem` da notificação do sino. Texto puro (formato: null)
 * para não depender de escape de HTML no conteúdo.
 */
export async function enviarPushTelegram(
  usuarioId: string,
  mensagem: string,
  evento: EventoTelegram
): Promise<void> {
  try {
    const admin = await createAdminClient()
    let chatId: string | null = null
    let prefsBruto: unknown = null
    let telefoneOk = true // sem a coluna (SQL não rodou) não bloqueia o push
    const full = await admin
      .from("usuarios")
      .select("telegram_chat_id, telegram_notif_prefs, telegram_telefone")
      .eq("id", usuarioId)
      .maybeSingle()
    if (full.error) {
      // colunas novas ainda não existem → segue só com o chat, prefs default.
      const basico = await admin
        .from("usuarios")
        .select("telegram_chat_id")
        .eq("id", usuarioId)
        .maybeSingle()
      chatId = texto(basico.data?.telegram_chat_id)
    } else {
      chatId = texto(full.data?.telegram_chat_id)
      prefsBruto = full.data?.telegram_notif_prefs
      telefoneOk = Boolean(texto(full.data?.telegram_telefone))
    }
    if (!chatId) return
    // Só entrega a quem confirmou o telefone (ativa a integração).
    if (!telefoneOk) return
    // Respeita a preferência do usuário (opt-out) para este tipo de aviso.
    if (!normalizarPreferencias(prefsBruto)[evento]) return
    await enviarTelegram({ chatId, texto: mensagem, formato: null })
  } catch {
    // best-effort: o push nunca derruba a ação de RH.
  }
}

/** Preferências de push do usuário (opt-out; ausência = tudo ligado). */
export async function preferenciasTelegram(
  usuarioId: string
): Promise<PreferenciasTelegram> {
  try {
    const admin = await createAdminClient()
    const { data } = await admin
      .from("usuarios")
      .select("telegram_notif_prefs")
      .eq("id", usuarioId)
      .maybeSingle()
    return normalizarPreferencias(data?.telegram_notif_prefs)
  } catch {
    return normalizarPreferencias(null)
  }
}

/** Grava as preferências de push (jsonb em usuarios). */
export async function definirPreferenciasTelegram(
  usuarioId: string,
  prefs: PreferenciasTelegram
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("usuarios")
    .update({ telegram_notif_prefs: prefs })
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    if (["PGRST204", "42703"].includes(error.code ?? "")) {
      return { erro: "Rode supabase/telegram-prefs.sql antes de usar as preferências." }
    }
    return { erro: error.message }
  }
  return {}
}

// ── Webhook (cross-tenant, service role) ─────────────────────────────────────

/**
 * Nome da entidade (tenant) para saudação tenant-aware no bot. O tenant é a
 * própria `empresa` cujo id = emp_proprietaria_id (ver obterOrganizacao).
 */
async function nomeEntidade(
  svc: ReturnType<typeof createServiceClient>,
  empId: string | null
): Promise<string | null> {
  if (!empId) return null
  const { data } = await svc
    .from("empresa")
    .select("nome_fantasia, nome_razao")
    .eq("id", empId)
    .maybeSingle()
  if (!data) return null
  return texto(data.nome_fantasia) ?? texto(data.nome_razao)
}

export type UsuarioTelegram = {
  id: string
  nome: string | null
  entidade: string | null
  /** emp_proprietaria_id — necessário p/ escopar relatórios por service role. */
  emp: string | null
  /** Telefone confirmado? O bot só responde a quem confirmou. */
  telefoneConfirmado: boolean
}

/** Casa um chat com o usuário pelo código (`/start <codigo>`). */
export async function vincularTelegramPorCodigo(
  codigo: string,
  chatId: string
): Promise<{
  nome?: string | null
  entidade?: string | null
  erro?: "codigo_invalido" | "codigo_expirado" | "falha"
}> {
  const svc = createServiceClient()
  const { data: u } = await svc
    .from("usuarios")
    .select(
      "id, nome_completo, nome_guerra, emp_proprietaria_id, telegram_vinculo_expira"
    )
    .eq("telegram_vinculo_codigo", codigo)
    .maybeSingle()
  if (!u) return { erro: "codigo_invalido" }
  const exp = texto(u.telegram_vinculo_expira)
  if (exp && new Date(exp) < new Date()) return { erro: "codigo_expirado" }

  // Um chat = um usuário: solta o chat de qualquer outro vínculo antes.
  await svc
    .from("usuarios")
    .update({ telegram_chat_id: null })
    .eq("telegram_chat_id", chatId)

  const { error } = await svc
    .from("usuarios")
    .update({
      telegram_chat_id: chatId,
      telegram_vinculo_codigo: null,
      telegram_vinculo_expira: null,
    })
    .eq("id", u.id)
  if (error) return { erro: "falha" }
  return {
    nome: texto(u.nome_completo) ?? texto(u.nome_guerra),
    entidade: await nomeEntidade(svc, texto(u.emp_proprietaria_id)),
  }
}

/** Usuário vinculado a um chat (para os comandos do bot), com a entidade. */
export async function usuarioPorChat(
  chatId: string
): Promise<UsuarioTelegram | null> {
  const svc = createServiceClient()
  // select tolerante à coluna de telefone ausente (telegram-telefone.sql).
  let data:
    | { id: unknown; nome_completo: unknown; nome_guerra: unknown; emp_proprietaria_id: unknown; telegram_telefone?: unknown }
    | null = null
  const full = await svc
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, emp_proprietaria_id, telegram_telefone")
    .eq("telegram_chat_id", chatId)
    .maybeSingle()
  if (full.error) {
    const basico = await svc
      .from("usuarios")
      .select("id, nome_completo, nome_guerra, emp_proprietaria_id")
      .eq("telegram_chat_id", chatId)
      .maybeSingle()
    data = basico.data
  } else {
    data = full.data
  }
  if (!data) return null
  const emp = texto(data.emp_proprietaria_id)
  return {
    id: data.id as string,
    nome: texto(data.nome_completo) ?? texto(data.nome_guerra),
    entidade: await nomeEntidade(svc, emp),
    emp,
    telefoneConfirmado: Boolean(texto(data.telegram_telefone)),
  }
}

// ── Relatórios do próprio usuário (webhook, service role, escopado por emp) ───
//
// O webhook NÃO tem sessão nem tenant: identifica a pessoa pelo chat_id (vínculo
// criado enquanto ela estava logada no painel) e busca SEUS dados por service
// role. Como o service role ignora RLS, TODA query filtra emp explicitamente.
// `usuarios.id` já é a pessoa: contracheque/diária usam `funcionario_id`, férias
// usa `trabalhador_id` (ver src/lib/db/pessoal.ts e ferias.ts).

export type ContrachequeTelegram = {
  remessaNome: string | null
  url: string | null
}

/** Último contracheque LIBERADO do usuário (maior `ordem` da remessa) + URL 1h. */
export async function ultimoContrachequeTelegram(
  usuarioId: string,
  empId: string
): Promise<{ disponivel: boolean; item: ContrachequeTelegram | null }> {
  const svc = createServiceClient()
  const [itens, remessas] = await Promise.all([
    svc
      .from("pessoal_contracheques")
      .select("arquivo, remessa_id")
      .eq("funcionario_id", usuarioId)
      .eq("liberado", true),
    svc
      .from("pessoal_contracheques_remessas")
      .select("id, nome_remessa, ordem")
      .eq("emp_proprietaria_id", empId),
  ])
  if (itens.error) {
    return { disponivel: !esquemaAusente(itens.error), item: null }
  }
  // Contracheque não tem coluna emp; o escopo vem pela remessa (já filtrada por
  // emp). Descarta itens cuja remessa não é deste tenant — sem vazamento.
  const mapa = new Map(
    (remessas.data ?? []).map((r) => [
      String(r.id),
      { nome: texto(r.nome_remessa), ordem: (r.ordem as number | null) ?? 0 },
    ])
  )
  const doTenant = (itens.data ?? [])
    .map((i) => ({
      arquivo: texto(i.arquivo),
      remessa: mapa.get(String(i.remessa_id)),
    }))
    .filter((i): i is { arquivo: string | null; remessa: { nome: string | null; ordem: number } } =>
      Boolean(i.remessa)
    )
  if (doTenant.length === 0) return { disponivel: true, item: null }
  doTenant.sort((a, b) => b.remessa.ordem - a.remessa.ordem)
  const alvo = doTenant[0]
  return {
    disponivel: true,
    item: { remessaNome: alvo.remessa.nome, url: await urlArquivo(svc, alvo.arquivo) },
  }
}

/** URL assinada (1h) do bucket 'pessoal'; URL legada (http/ /​/) passa direto. */
async function urlArquivo(
  svc: ReturnType<typeof createServiceClient>,
  caminho: string | null
): Promise<string | null> {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const { data } = await svc.storage.from("pessoal").createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

export type FeriasPeriodoTelegram = {
  aquisitivo: string | null
  finalizado: boolean
  saldo: number
  descanso: number
  gozados: number
}

/**
 * Saldo de descanso por período (espelha `resumoPeriodo` em src/lib/db/ferias.ts
 * — regra CLT: abono = 1/3 do direito, saldo = descanso − dias gozados).
 */
export async function resumoFeriasTelegram(
  usuarioId: string,
  empId: string
): Promise<{ disponivel: boolean; periodos: FeriasPeriodoTelegram[]; saldoTotal: number }> {
  const svc = createServiceClient()
  const [periodos, gozos] = await Promise.all([
    svc
      .from("pessoal_ferias")
      .select(
        "id, trabalhador_id, aquisitivo_inicio, aquisitivo_termino, concessivo_inicio, concessivo_termino, dias_disponiveis, abono_pecuniario, finalizado"
      )
      .eq("trabalhador_id", usuarioId)
      .eq("emp_proprietaria_id", empId),
    svc
      .from("pessoal_ferias_gozo")
      .select("ferias_periodo_id, funcionario_id, inicio, dias")
      .eq("funcionario_id", usuarioId)
      .eq("emp_proprietaria_id", empId),
  ])
  if (periodos.error) {
    return { disponivel: !esquemaAusente(periodos.error), periodos: [], saldoTotal: 0 }
  }
  const listaGozos = gozos.data ?? []
  // Liga gozo↔período: FK quando existe; senão início dentro do concessivo (legado).
  const gozoDo = (p: {
    id: string
    trabalhador_id: string | null
    concessivo_inicio: string | null
    concessivo_termino: string | null
  }): number =>
    listaGozos
      .filter((g) => {
        const fk = texto(g.ferias_periodo_id)
        if (fk) return fk === p.id
        const ini = texto(g.inicio)
        if (!ini || !p.concessivo_inicio || !p.concessivo_termino) return false
        return ini >= p.concessivo_inicio && ini <= p.concessivo_termino
      })
      .reduce((s, g) => s + ((g.dias as number | null) ?? 0), 0)

  const resultado = (periodos.data ?? []).map((p) => {
    const direito = (p.dias_disponiveis as number | null) ?? 0
    const abono = p.abono_pecuniario === true ? Math.floor(direito / 3) : 0
    const descanso = direito - abono
    const gozados = gozoDo({
      id: String(p.id),
      trabalhador_id: texto(p.trabalhador_id),
      concessivo_inicio: texto(p.concessivo_inicio),
      concessivo_termino: texto(p.concessivo_termino),
    })
    return {
      aquisitivo: texto(p.aquisitivo_inicio),
      finalizado: p.finalizado === true,
      saldo: descanso - gozados,
      descanso,
      gozados,
    }
  })
  const saldoTotal = resultado
    .filter((p) => !p.finalizado)
    .reduce((s, p) => s + p.saldo, 0)
  return { disponivel: true, periodos: resultado, saldoTotal }
}

export type DiariaTelegram = {
  tipoNome: string | null
  quantidade: number | null
  data_inicio: string | null
  data_termino: string | null
  situacao: string
  valor_total: number | null
}

/** Últimas solicitações de diária do usuário (padrão: 5). */
export async function diariasRecentesTelegram(
  usuarioId: string,
  empId: string,
  limite = 5
): Promise<{ disponivel: boolean; itens: DiariaTelegram[] }> {
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("pessoal_diarias_solicitacoes")
    .select("diaria_id, quantidade, data_inicio, data_termino, situacao, valor_total, created_at")
    .eq("funcionario_id", usuarioId)
    .eq("emp_proprietaria_id", empId)
    .order("created_at", { ascending: false })
    .limit(limite)
  if (error) return { disponivel: !esquemaAusente(error), itens: [] }
  const brutas = data ?? []
  const tipoIds = [
    ...new Set(brutas.map((s) => texto(s.diaria_id)).filter((v): v is string => Boolean(v))),
  ]
  const tipos = new Map<string, string | null>()
  if (tipoIds.length) {
    const { data: t } = await svc.from("financeiro_diarias").select("*").in("id", tipoIds)
    for (const row of t ?? []) {
      tipos.set(String(row.id), texto(row.nome) ?? texto(row.diaria))
    }
  }
  return {
    disponivel: true,
    itens: brutas.map((s) => ({
      tipoNome: texto(s.diaria_id) ? (tipos.get(String(s.diaria_id)) ?? null) : null,
      quantidade: (s.quantidade as number | null) ?? null,
      data_inicio: texto(s.data_inicio),
      data_termino: texto(s.data_termino),
      situacao: String(s.situacao ?? "aguardando"),
      valor_total: (s.valor_total as number | null) ?? null,
    })),
  }
}

export type InformeTelegram = { ano: string | null; url: string | null }

/** Informes de rendimentos LIBERADOS do usuário (ano mais recente primeiro). */
export async function informesTelegram(
  usuarioId: string,
  empId: string,
  limite = 6
): Promise<{ disponivel: boolean; itens: InformeTelegram[] }> {
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("pessoal_informes_rendimentos")
    .select("ano_referencia_os, arquivo_url")
    .eq("funcionario_id", usuarioId)
    .eq("liberado", true)
    .eq("emp_proprietaria_id", empId)
  if (error) return { disponivel: !esquemaAusente(error), itens: [] }
  const ordenado = (data ?? [])
    .slice()
    .sort((a, b) =>
      String(b.ano_referencia_os ?? "").localeCompare(String(a.ano_referencia_os ?? ""))
    )
    .slice(0, limite)
  const itens: InformeTelegram[] = []
  for (const i of ordenado) {
    itens.push({
      ano: texto(i.ano_referencia_os),
      url: await urlArquivo(svc, texto(i.arquivo_url)),
    })
  }
  return { disponivel: true, itens }
}

export type AsoTelegram = {
  tipo: string | null
  data: string | null
  vencimento: string | null
  ultimo: boolean
  vencido: boolean
}

/**
 * ASOs do usuário (mais recente primeiro). A tabela `aso` NÃO tem
 * emp_proprietaria_id; `funcionario_id` já escopa à própria pessoa (que é o
 * requisitante), então não há vazamento entre tenants.
 */
export async function asosTelegram(
  usuarioId: string,
  limite = 5
): Promise<{ disponivel: boolean; itens: AsoTelegram[] }> {
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("aso")
    .select("data, tipo, vencimento, ultimo")
    .eq("funcionario_id", usuarioId)
    .order("data", { ascending: false, nullsFirst: false })
    .limit(limite)
  if (error) return { disponivel: !esquemaAusente(error), itens: [] }
  const hoje = new Date().toISOString().slice(0, 10)
  return {
    disponivel: true,
    itens: (data ?? []).map((a) => {
      const venc = texto(a.vencimento)
      return {
        tipo: texto(a.tipo),
        data: texto(a.data),
        vencimento: venc,
        ultimo: a.ultimo === true,
        vencido: Boolean(venc && venc < hoje),
      }
    }),
  }
}

// ── Comandos institucionais (gateados por permissão) ─────────────────────────

/** Permissões do usuário (por usuario_id, como faz auth.ts). null = sem linha. */
export async function permissoesPorUsuario(
  usuarioId: string
): Promise<Record<string, unknown> | null> {
  const svc = createServiceClient()
  const { data } = await svc
    .from("permissoes")
    .select("*")
    .eq(PERMISSOES_USUARIO_FK, usuarioId)
    .maybeSingle()
  return data ?? null
}

export type VeiculoDisponivelTelegram = {
  codigo: string | null
  placa: string | null
  marcaModelo: string | null
}

/**
 * Veículos DISPONÍVEIS do tenant: ativos, fora de manutenção e sem movimentação
 * aberta (retirada sem devolução no fluxo novo). Espelha a derivação de
 * `listarVeiculos`/`movimentacoesAbertas` em src/lib/db/veiculos.ts.
 */
export async function veiculosDisponiveisTelegram(
  empId: string
): Promise<{ disponivel: boolean; itens: VeiculoDisponivelTelegram[] }> {
  const svc = createServiceClient()
  const { data: veiculos, error } = await svc
    .from("veiculos")
    .select("id, codigo, placa, marca_modelo, inativo, manutencao")
    .eq("emp_proprietaria_id", empId)
    .eq("inativo", false)
  if (error) return { disponivel: !esquemaAusente(error), itens: [] }
  // Em uso agora = movimentação aberta do fluxo novo. Se a tabela ainda não
  // existe, degrada tratando ninguém como em uso.
  const { data: abertas } = await svc
    .from("veiculos_disponibilidade")
    .select("veiculo_id")
    .eq("emp_proprietaria_id", empId)
    .is("data_devolucao", null)
    .not("registrado_por_id", "is", null)
  const emUso = new Set((abertas ?? []).map((m) => String(m.veiculo_id)))
  const itens = (veiculos ?? [])
    .filter((v) => v.manutencao !== true && !emUso.has(String(v.id)))
    .map((v) => ({
      codigo: texto(v.codigo),
      placa: texto(v.placa),
      marcaModelo: texto(v.marca_modelo),
    }))
  return { disponivel: true, itens }
}

export type FiliadoTelegram = {
  nome: string | null
  cpf: string | null
  matricula: string | null
  condicao: string | null
  ativo: boolean
}

/**
 * Busca filiados por nome (sem acento) OU CPF/matrícula (só dígitos), agrupando
 * por CPF (uma pessoa tem vários registros migrados). `ativo` = algum registro
 * não-excluído com condição "Ativo". Espelha `aplicarFiltros` em db/filiados.ts.
 */
export async function buscarFiliadoTelegram(
  termo: string,
  empId: string,
  limitePessoas = 8
): Promise<{ disponivel: boolean; itens: FiliadoTelegram[] }> {
  const t = termo.trim()
  if (t.length < 3) return { disponivel: true, itens: [] }
  const svc = createServiceClient()
  let q = svc
    .from("filiacoes")
    .select("nome_completo, cpf, matricula_sindical, filiacao_condicao")
    .eq("emp_proprietaria_id", empId)
    .not("filiacao_excluida", "is", true)
    .limit(limitePessoas * 6)
  const digitos = t.replace(/\D/g, "")
  const soNumerico = digitos.length >= 3 && /^[\d.\-\s/]+$/.test(t)
  if (soNumerico) {
    q = q.or(`cpf.like.${digitos}%,matricula_sindical.like.${digitos}%`)
  } else {
    for (const palavra of semAcento(t).split(/\s+/).filter(Boolean)) {
      q = q.ilike("nome_completo_norm", `%${escaparLike(palavra)}%`)
    }
  }
  const { data, error } = await q
  if (error) return { disponivel: !esquemaAusente(error), itens: [] }

  // Agrupa por CPF (fallback nome); ativo = alguma linha "Ativo".
  const grupos = new Map<string, FiliadoTelegram>()
  for (const f of data ?? []) {
    const cpf = texto(f.cpf)
    const chave = cpf ?? texto(f.nome_completo) ?? crypto_random()
    const cond = texto(f.filiacao_condicao)
    const atual = grupos.get(chave)
    if (!atual) {
      grupos.set(chave, {
        nome: texto(f.nome_completo),
        cpf,
        matricula: texto(f.matricula_sindical),
        condicao: cond,
        ativo: cond === "Ativo",
      })
    } else {
      atual.ativo = atual.ativo || cond === "Ativo"
      if (atual.ativo) atual.condicao = "Ativo"
      atual.nome = atual.nome ?? texto(f.nome_completo)
      atual.matricula = atual.matricula ?? texto(f.matricula_sindical)
    }
  }
  return { disponivel: true, itens: [...grupos.values()].slice(0, limitePessoas) }
}

/** Escapa curingas do LIKE/ILIKE do Postgres. */
function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Chave anônima estável só para agrupar linhas sem cpf/nome (raro). */
function crypto_random(): string {
  return randomUUID()
}
