import "server-only"

import { type Evento } from "@/lib/db/eventos"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * A ponte entre Eventos e Filiados.
 *
 * Duas coisas moram aqui:
 *
 * 1. **Casar a inscrição com a filiação pelo CPF.** A coluna `filiacao_id`
 *    existia desde o começo e nunca era preenchida — sem ela não dá para dizer
 *    quantos dos inscritos são filiados nem levar nada ao prontuário.
 *
 * 2. **Registrar no prontuário** os três momentos: inscreveu, respondeu se vem,
 *    compareceu. O prontuário é o "log de vida" da pessoa no sindicato, e
 *    participação em evento é exatamente o tipo de coisa que se quer ver ali
 *    anos depois.
 *
 * Cada momento tem seu CARIMBO na inscrição (`prontuario_*_em`). Sem isso,
 * qualquer reprocessamento encheria o histórico de linhas repetidas.
 *
 * SQL: supabase/eventos-filiados-agenda.sql
 */

const TIPO_PRONTUARIO = "Evento"

/**
 * Filiação ativa de um CPF, no tenant informado.
 *
 * `filiacoes` pode ter mais de uma linha para a mesma pessoa (histórico de
 * vínculos). Vale a mais recente que não esteja excluída — mesma regra que
 * `buscarFiliadoPorCpf` usa para o login do portal.
 */
export async function filiacaoDoCpf(
  cpf: string,
  tenantId: string
): Promise<{ id: string; nome: string | null } | null> {
  if (!cpf || cpf.length !== 11) return null
  const service = createServiceClient()
  const { data } = await service
    .from("filiacoes")
    .select("id, nome_completo, updated_at")
    .eq("emp_proprietaria_id", tenantId)
    .eq("cpf", cpf)
    .not("filiacao_excluida", "is", true)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
  const f = (data ?? [])[0]
  if (!f) return null
  return { id: f.id as string, nome: (f.nome_completo as string | null) ?? null }
}

/** Grava um apontamento no prontuário, no formato que o resto do sistema usa. */
async function apontar(
  filiacaoId: string,
  tenantId: string,
  descricao: string
): Promise<boolean> {
  const service = createServiceClient()
  const agora = new Date().toISOString()
  const { error } = await service.from("filiacao_prontuario").insert({
    filiacao_id: filiacaoId,
    data: agora,
    tipo: TIPO_PRONTUARIO,
    descricao,
    diretor_funcionario_id: null,
    emp_proprietaria_id: tenantId,
    created_at: agora,
    modified_at: agora,
  })
  return !error
}

function nomeDoEvento(evento: { titulo: string | null }): string {
  return evento.titulo ? `"${evento.titulo}"` : "de um evento"
}

// ── Os três momentos ─────────────────────────────────────────────────────────

/**
 * Casa a inscrição com a filiação e registra a inscrição no prontuário.
 *
 * Chamada quando a inscrição passa a valer (e-mail confirmado, ou lançamento
 * pelo painel/portal). Idempotente: o carimbo impede a segunda linha.
 */
export async function registrarInscricaoNoProntuario(
  inscricaoId: string,
  tenantId: string
): Promise<{ filiado: boolean }> {
  const service = createServiceClient()
  const { data: insc } = await service
    .from("eventos_inscricoes")
    .select("id, cpf, evento_id, filiacao_id, prontuario_inscricao_em, origem")
    .eq("emp_proprietaria_id", tenantId)
    .eq("id", inscricaoId)
    .maybeSingle()
  if (!insc) return { filiado: false }

  let filiacaoId = insc.filiacao_id as string | null
  if (!filiacaoId) {
    const f = await filiacaoDoCpf((insc.cpf as string) ?? "", tenantId)
    filiacaoId = f?.id ?? null
    if (filiacaoId) {
      await service
        .from("eventos_inscricoes")
        .update({ filiacao_id: filiacaoId })
        .eq("id", inscricaoId)
    }
  }
  if (!filiacaoId) return { filiado: false }
  if (insc.prontuario_inscricao_em) return { filiado: true }

  const { data: ev } = await service
    .from("eventos")
    .select("titulo, inicio")
    .eq("id", insc.evento_id as string)
    .maybeSingle()

  const comoEntrou =
    insc.origem === "portal"
      ? " pela área do associado"
      : insc.origem === "planilha" || insc.origem === "painel"
        ? " (inscrição lançada pela entidade)"
        : ""

  const ok = await apontar(
    filiacaoId,
    tenantId,
    `Inscreveu-se no evento ${nomeDoEvento({ titulo: (ev?.titulo as string | null) ?? null })}${comoEntrou}.`
  )
  if (ok) {
    await service
      .from("eventos_inscricoes")
      .update({ prontuario_inscricao_em: new Date().toISOString() })
      .eq("id", inscricaoId)
  }
  return { filiado: true }
}

/** Resposta ao RSVP no prontuário — inclusive o "não vou", que também informa. */
export async function registrarRsvpNoProntuario(
  inscricaoId: string,
  tenantId: string,
  vem: boolean
): Promise<void> {
  const service = createServiceClient()
  const { data: insc } = await service
    .from("eventos_inscricoes")
    .select("id, evento_id, filiacao_id, prontuario_rsvp_em")
    .eq("emp_proprietaria_id", tenantId)
    .eq("id", inscricaoId)
    .maybeSingle()
  if (!insc?.filiacao_id) return
  // Trocar de ideia reescreve a resposta, mas não gera um segundo apontamento:
  // o prontuário guarda o fato de ter respondido, não cada clique.
  if (insc.prontuario_rsvp_em) return

  const { data: ev } = await service
    .from("eventos")
    .select("titulo")
    .eq("id", insc.evento_id as string)
    .maybeSingle()

  const ok = await apontar(
    insc.filiacao_id as string,
    tenantId,
    vem
      ? `Confirmou que vai comparecer ao evento ${nomeDoEvento({ titulo: (ev?.titulo as string | null) ?? null })}.`
      : `Avisou que não poderá comparecer ao evento ${nomeDoEvento({ titulo: (ev?.titulo as string | null) ?? null })}.`
  )
  if (ok) {
    await service
      .from("eventos_inscricoes")
      .update({ prontuario_rsvp_em: new Date().toISOString() })
      .eq("id", inscricaoId)
  }
}

/**
 * Presença no prontuário. Registrada UMA vez por evento, mesmo num congresso
 * de três dias: o que importa no histórico é ter comparecido, não a contagem
 * de catracas.
 */
export async function registrarPresencaNoProntuario(
  inscricaoId: string,
  tenantId: string
): Promise<void> {
  const service = createServiceClient()
  const { data: insc } = await service
    .from("eventos_inscricoes")
    .select("id, evento_id, filiacao_id, prontuario_presenca_em")
    .eq("emp_proprietaria_id", tenantId)
    .eq("id", inscricaoId)
    .maybeSingle()
  if (!insc?.filiacao_id || insc.prontuario_presenca_em) return

  const { data: ev } = await service
    .from("eventos")
    .select("titulo")
    .eq("id", insc.evento_id as string)
    .maybeSingle()

  const ok = await apontar(
    insc.filiacao_id as string,
    tenantId,
    `Compareceu ao evento ${nomeDoEvento({ titulo: (ev?.titulo as string | null) ?? null })}.`
  )
  if (ok) {
    await service
      .from("eventos_inscricoes")
      .update({ prontuario_presenca_em: new Date().toISOString() })
      .eq("id", inscricaoId)
  }
}

// ── Conciliação retroativa ───────────────────────────────────────────────────

/**
 * Casa por CPF as inscrições que ainda não têm filiação apontada.
 *
 * Existe porque as inscrições feitas antes desta ligação ficaram órfãs, e
 * porque alguém pode se filiar DEPOIS de se inscrever num evento — nesse caso
 * o vínculo só aparece quando a conciliação roda de novo.
 */
export async function conciliarFiliados(
  eventoId?: string
): Promise<{ conferidas: number; casadas: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  let q = admin
    .from("eventos_inscricoes")
    .select("id, cpf")
    .eq("emp_proprietaria_id", emp)
    .is("filiacao_id", null)
    .is("anonimizada_em", null)
    .not("cpf", "is", null)
  if (eventoId) q = q.eq("evento_id", eventoId)

  const { data } = await q.limit(1000)
  const linhas = data ?? []
  if (linhas.length === 0) return { conferidas: 0, casadas: 0 }

  // Uma consulta para todos os CPFs, não uma por inscrição.
  const cpfs = [...new Set(linhas.map((i) => i.cpf as string))]
  const { data: filiacoes } = await admin
    .from("filiacoes")
    .select("id, cpf, updated_at")
    .eq("emp_proprietaria_id", emp)
    .in("cpf", cpfs)
    .not("filiacao_excluida", "is", true)
    .order("updated_at", { ascending: false, nullsFirst: false })

  const porCpf = new Map<string, string>()
  for (const f of filiacoes ?? []) {
    const cpf = f.cpf as string
    if (!porCpf.has(cpf)) porCpf.set(cpf, f.id as string)
  }

  let casadas = 0
  for (const i of linhas) {
    const filiacaoId = porCpf.get(i.cpf as string)
    if (!filiacaoId) continue
    const { error } = await admin
      .from("eventos_inscricoes")
      .update({ filiacao_id: filiacaoId })
      .eq("id", i.id as string)
    if (!error) casadas++
  }

  return { conferidas: linhas.length, casadas }
}

/** Quantos dos inscritos são filiados — indicador da página do evento. */
export async function contarFiliados(
  eventoId: string
): Promise<{ filiados: number; naoFiliados: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("eventos_inscricoes")
    .select("filiacao_id")
    .eq("emp_proprietaria_id", emp)
    .eq("evento_id", eventoId)
    .is("anonimizada_em", null)

  const linhas = data ?? []
  const filiados = linhas.filter((i) => i.filiacao_id !== null).length
  return { filiados, naoFiliados: linhas.length - filiados }
}

// ── Agenda ───────────────────────────────────────────────────────────────────

/**
 * Espelha o evento na Agenda da entidade.
 *
 * Sem isso o evento existia só dentro do módulo: não aparecia na Agenda do
 * painel nem na do portal, e o filiado não ficava sabendo que ele existe. O
 * espelho é de mão dupla — `eventos.agenda_id` aponta para o compromisso e
 * `agenda.evento_id` volta para o evento, que é o que deixa a agenda oferecer
 * a inscrição.
 *
 * Rascunho não vai para a agenda; cancelado sai dela.
 */
export async function sincronizarAgenda(evento: Evento): Promise<void> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const deveAparecer =
    evento.situacao === "publicado" || evento.situacao === "adiado"

  if (!deveAparecer) {
    if (evento.agenda_id) {
      await admin
        .from("agenda")
        .delete()
        .eq("emp_proprietaria_id", emp)
        .eq("id", evento.agenda_id)
      await admin
        .from("eventos")
        .update({ agenda_id: null })
        .eq("emp_proprietaria_id", emp)
        .eq("id", evento.id)
    }
    return
  }

  const dados = {
    atividade: evento.titulo,
    tipo: "Evento",
    inicio: evento.inicio,
    termino: evento.termino,
    dia_todo: false,
    local: evento.local,
    evento_id: evento.id,
    emp_proprietaria_id: emp,
  }

  if (evento.agenda_id) {
    const { error } = await admin
      .from("agenda")
      .update(dados)
      .eq("emp_proprietaria_id", emp)
      .eq("id", evento.agenda_id)
    if (!error) return
    // Compromisso apagado à mão na Agenda: recria em vez de sumir do calendário.
  }

  const { data: criado } = await admin
    .from("agenda")
    .insert(dados)
    .select("id")
    .single()
  if (criado) {
    await admin
      .from("eventos")
      .update({ agenda_id: criado.id as string })
      .eq("emp_proprietaria_id", emp)
      .eq("id", evento.id)
  }
}
