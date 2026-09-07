import "server-only"

import {
  capacidadeDoEvento,
  capacidadesDosEventos,
  inscricoesAbertas,
  obterEventos,
  type Evento,
} from "@/lib/db/eventos"
import { registrarInscricaoNoProntuario } from "@/lib/db/eventos-filiados"
import { createServiceClient } from "@/lib/supabase/admin"

/**
 * Eventos na área do filiado.
 *
 * O filiado já está identificado — nome, CPF e e-mail vêm da filiação. Então o
 * caminho dele é bem mais curto que o do público: um clique e pronto, sem
 * formulário e SEM código de confirmação por e-mail, porque não há e-mail a
 * confirmar: quem entrou no portal já provou quem é.
 *
 * SQL: supabase/eventos-filiados-agenda.sql
 */

export type EventoDoFiliado = {
  evento: Evento
  inscrito: boolean
  inscricaoId: string | null
  inscricaoToken: string | null
  situacao: string | null
  rsvpConfirmado: boolean | null
  rsvpAberto: boolean
  presencas: number
  aberta: boolean
  motivoFechada?: string
  vagasRestantes: number | null
}

/**
 * Eventos que interessam ao filiado: os publicados que ainda não terminaram,
 * mais aqueles em que ele já está inscrito (inclusive adiados — a inscrição
 * dele continua valendo e ele precisa acompanhar).
 */
export async function eventosParaFiliado(
  cpf: string,
  tenantId: string
): Promise<EventoDoFiliado[]> {
  const service = createServiceClient()

  const { data: brutos } = await service
    .from("eventos")
    .select("id")
    .eq("emp_proprietaria_id", tenantId)
    .in("situacao", ["publicado", "adiado"])
    .order("inicio", { ascending: true })
    .limit(50)

  const ids = (brutos ?? []).map((e) => e.id as string)

  // As inscrições dele, mesmo em evento que saiu da lista acima.
  const { data: minhas } = await service
    .from("eventos_inscricoes")
    .select(
      "id, evento_id, token, situacao, rsvp_confirmado, prontuario_presenca_em"
    )
    .eq("emp_proprietaria_id", tenantId)
    .eq("cpf", cpf)
    .is("anonimizada_em", null)

  const porEvento = new Map(
    (minhas ?? []).map((i) => [i.evento_id as string, i])
  )
  for (const id of porEvento.keys()) {
    if (!ids.includes(id)) ids.push(id)
  }
  if (ids.length === 0) return []

  // Presenças, para mostrar "você compareceu".
  const { data: presencas } = await service
    .from("eventos_presencas")
    .select("inscricao_id")
    .in(
      "inscricao_id",
      (minhas ?? []).map((i) => i.id as string)
    )
  const contagem = new Map<string, number>()
  for (const p of presencas ?? []) {
    const id = p.inscricao_id as string
    contagem.set(id, (contagem.get(id) ?? 0) + 1)
  }

  // Duas consultas para a lista inteira, não duas por evento.
  const eventos = await obterEventos(ids)
  const capacidades = await capacidadesDosEventos(eventos)

  const lista: EventoDoFiliado[] = []
  for (const evento of eventos) {
    const capacidade = capacidades.get(evento.id)
    if (!capacidade) continue
    const abertura = inscricoesAbertas(evento, capacidade)
    const minha = porEvento.get(evento.id)

    lista.push({
      evento,
      inscrito: Boolean(minha),
      inscricaoId: (minha?.id as string) ?? null,
      inscricaoToken: (minha?.token as string) ?? null,
      situacao: (minha?.situacao as string) ?? null,
      rsvpConfirmado: (minha?.rsvp_confirmado as boolean | null) ?? null,
      rsvpAberto:
        evento.rsvp_abre_em !== null &&
        new Date(evento.rsvp_abre_em) <= new Date(),
      presencas: minha ? (contagem.get(minha.id as string) ?? 0) : 0,
      aberta: abertura.aberta,
      motivoFechada: abertura.motivo,
      vagasRestantes: capacidade.publicasRestantes,
    })
  }

  // Quem já está inscrito primeiro; depois por data.
  return lista.sort((a, b) => {
    if (a.inscrito !== b.inscrito) return a.inscrito ? -1 : 1
    return (a.evento.inicio ?? "").localeCompare(b.evento.inicio ?? "")
  })
}

/**
 * Inscreve o filiado. Sem código por e-mail: a sessão do portal já é a prova
 * de identidade, e mandar a pessoa confirmar um e-mail que ela usou para
 * entrar seria burocracia sem ganho.
 */
export async function inscreverFiliado(
  evento: Evento,
  filiado: { cpf: string; nome: string | null; email: string | null; filiacaoId: string },
  tenantId: string
): Promise<{ erro?: string; token?: string }> {
  const capacidade = await capacidadeDoEvento(evento)
  const abertura = inscricoesAbertas(evento, capacidade)
  if (!abertura.aberta) {
    return { erro: abertura.motivo ?? "As inscrições estão fechadas." }
  }

  const service = createServiceClient()
  const { data: existente } = await service
    .from("eventos_inscricoes")
    .select("id, token")
    .eq("emp_proprietaria_id", tenantId)
    .eq("evento_id", evento.id)
    .eq("cpf", filiado.cpf)
    .maybeSingle()
  if (existente) return { token: existente.token as string }

  // Filiado entra CONFIRMADO quando o evento assim permite; senão espera
  // avaliação como qualquer um.
  const situacao =
    evento.exige_aprovacao && !evento.confirma_filiado_automatico
      ? "pendente"
      : "confirmada"

  const agora = new Date().toISOString()
  const { data: criada, error } = await service
    .from("eventos_inscricoes")
    .insert({
      emp_proprietaria_id: tenantId,
      evento_id: evento.id,
      nome: filiado.nome,
      cpf: filiado.cpf,
      email: filiado.email,
      filiacao_id: filiado.filiacaoId,
      origem: "portal",
      situacao,
      // Entrou pela área logada: o e-mail já está provado.
      email_confirmado_em: agora,
      consentimento_em: agora,
    })
    .select("id, token")
    .single()
  if (error || !criada) {
    return { erro: `Não foi possível inscrever: ${error?.message ?? "?"}` }
  }

  await registrarInscricaoNoProntuario(criada.id as string, tenantId)
  return { token: criada.token as string }
}

/** Cancela a própria inscrição — desistir é direito de quem se inscreveu. */
export async function cancelarInscricaoDoFiliado(
  inscricaoId: string,
  cpf: string,
  tenantId: string
): Promise<{ erro?: string }> {
  const service = createServiceClient()
  const { data: insc } = await service
    .from("eventos_inscricoes")
    .select("id, cpf")
    .eq("emp_proprietaria_id", tenantId)
    .eq("id", inscricaoId)
    .maybeSingle()
  if (!insc || insc.cpf !== cpf) return { erro: "Inscrição não encontrada." }

  const { count } = await service
    .from("eventos_presencas")
    .select("id", { count: "exact", head: true })
    .eq("inscricao_id", inscricaoId)
  if ((count ?? 0) > 0) {
    return { erro: "Você já teve presença registrada neste evento." }
  }

  const { error } = await service
    .from("eventos_inscricoes")
    .update({ situacao: "cancelada", updated_at: new Date().toISOString() })
    .eq("id", inscricaoId)
  if (error) return { erro: "Não foi possível cancelar." }
  return {}
}
