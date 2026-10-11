import "server-only"

import {
  capacidadeDoEvento,
  capacidadesDosEventos,
  inscricoesAbertas,
  obterEventos,
  type Evento,
  type SituacaoInscricao,
} from "@/lib/db/eventos"
import { registrarInscricaoNoProntuario } from "@/lib/db/eventos-filiados"
import { ZERAR_AO_REINSCREVER } from "@/lib/db/eventos-publico"
import { createAdminClient } from "@/lib/supabase/admin"

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
  /**
   * Tem inscrição VIVA — qualquer situação menos 'cancelada'. Quem cancelou
   * volta a ser só um interessado: o evento reaparece em "Inscrições abertas"
   * (se ainda houver) com o botão de sempre. 'recusada' continua contando:
   * foi decisão da entidade e não reabre.
   */
  inscrito: boolean
  /** Id e token só de inscrição viva. */
  inscricaoId: string | null
  inscricaoToken: string | null
  /** Situação da linha, mesmo cancelada (a página avisa que dá para voltar). */
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
  const service = await createAdminClient()

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
  // Inscrição cancelada não puxa evento que já saiu da lista (encerrado,
  // cancelado): não há o que acompanhar nem como voltar.
  for (const [id, i] of porEvento) {
    if (i.situacao === "cancelada") continue
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
    const viva = minha && minha.situacao !== "cancelada" ? minha : undefined

    lista.push({
      evento,
      inscrito: Boolean(viva),
      inscricaoId: (viva?.id as string) ?? null,
      inscricaoToken: (viva?.token as string) ?? null,
      situacao: (minha?.situacao as string) ?? null,
      rsvpConfirmado: (viva?.rsvp_confirmado as boolean | null) ?? null,
      rsvpAberto:
        evento.rsvp_abre_em !== null &&
        new Date(evento.rsvp_abre_em) <= new Date(),
      presencas: viva ? (contagem.get(viva.id as string) ?? 0) : 0,
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
 *
 * Quem cancelou e voltou reaproveita a mesma linha (um CPF, uma inscrição por
 * evento), com as mesmas travas e efeitos de uma inscrição nova. `jaInscrito`
 * avisa que nada foi gravado — a action não pode dizer "Inscrição feita.".
 */
export async function inscreverFiliado(
  evento: Evento,
  filiado: { cpf: string; nome: string | null; email: string | null; filiacaoId: string },
  tenantId: string
): Promise<{
  erro?: string
  token?: string
  situacao?: SituacaoInscricao
  jaInscrito?: boolean
  reinscricao?: boolean
}> {
  const service = await createAdminClient()
  const { data: existente } = await service
    .from("eventos_inscricoes")
    .select("id, token, situacao, reservada_por")
    .eq("emp_proprietaria_id", tenantId)
    .eq("evento_id", evento.id)
    .eq("cpf", filiado.cpf)
    .maybeSingle()

  // Recusa foi decisão da entidade: não se desfaz com um clique.
  if (existente?.situacao === "recusada") {
    return {
      erro: "Sua inscrição anterior neste evento não foi aprovada. Se tiver dúvidas, fale com o sindicato.",
    }
  }
  // Inscrição viva: nada a gravar, só o endereço dela.
  if (existente && existente.situacao !== "cancelada") {
    return { token: existente.token as string, jaInscrito: true }
  }

  // Nova ou de volta depois de cancelar: as mesmas travas, com as vagas
  // contadas AGORA — a de quem cancelou pode ter sido ocupada nesse meio-tempo.
  const capacidade = await capacidadeDoEvento(evento)
  const abertura = inscricoesAbertas(evento, capacidade)
  if (!abertura.aberta) {
    return { erro: abertura.motivo ?? "As inscrições estão fechadas." }
  }

  // Filiado entra CONFIRMADO quando o evento assim permite; senão espera
  // avaliação como qualquer um.
  const situacao: SituacaoInscricao =
    evento.exige_aprovacao && !evento.confirma_filiado_automatico
      ? "pendente"
      : "confirmada"

  const agora = new Date().toISOString()

  if (existente) {
    const { data: reaberta, error } = await service
      .from("eventos_inscricoes")
      .update({
        ...ZERAR_AO_REINSCREVER,
        // Convidado continua convidado de quem o trouxe; o resto passa a ter
        // vindo pelo portal, como a inscrição nova.
        ...(existente.reservada_por ? {} : { origem: "portal" }),
        situacao,
        // Dado ausente na filiação não apaga o que a inscrição já tinha.
        nome: filiado.nome ?? undefined,
        email: filiado.email ?? undefined,
        filiacao_id: filiado.filiacaoId,
        email_confirmado_em: agora,
        // O aceite agora é o do portal, como na inscrição nova: o termo e o IP
        // de um formulário público anterior não acompanham a data nova. O
        // termo da foto fica — a foto, se houver, continua na inscrição.
        consentimento_em: agora,
        termo_id: null,
        consentimento_ip: null,
        codigo_hash: null,
        updated_at: agora,
      })
      .eq("emp_proprietaria_id", tenantId)
      .eq("id", existente.id as string)
      // Só se continuar cancelada: dois cliques não se atropelam.
      .eq("situacao", "cancelada")
      .select("id, token")
      .maybeSingle()
    if (error) {
      return {
        erro: "Não foi possível refazer a inscrição. Recarregue a página e tente de novo.",
      }
    }
    // Nenhuma linha: outro envio simultâneo já a reabriu — nada foi gravado aqui.
    if (!reaberta) return { jaInscrito: true }
    await registrarInscricaoNoProntuario(reaberta.id as string, tenantId)
    return { token: reaberta.token as string, situacao, reinscricao: true }
  }

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
  // Índice único (evento, CPF): outro envio simultâneo inscreveu primeiro.
  if (error?.code === "23505") return { jaInscrito: true }
  if (error || !criada) {
    return { erro: "Não foi possível concluir a inscrição. Tente de novo em instantes." }
  }

  await registrarInscricaoNoProntuario(criada.id as string, tenantId)
  return { token: criada.token as string, situacao }
}

/**
 * Cancela a própria inscrição — desistir é direito de quem se inscreveu, e
 * voltar também: cancelada reabre o evento para a pessoa (inscreverFiliado).
 */
export async function cancelarInscricaoDoFiliado(
  inscricaoId: string,
  cpf: string,
  tenantId: string
): Promise<{ erro?: string }> {
  const service = await createAdminClient()
  const { data: insc } = await service
    .from("eventos_inscricoes")
    .select("id, cpf, situacao")
    .eq("emp_proprietaria_id", tenantId)
    .eq("id", inscricaoId)
    .maybeSingle()
  if (!insc || insc.cpf !== cpf) return { erro: "Inscrição não encontrada." }
  if (insc.situacao === "cancelada") return {}
  // Como cancelada reabre a inscrição, cancelar uma recusada seria o atalho
  // para desfazer a decisão da entidade.
  if (insc.situacao === "recusada") {
    return { erro: "Esta inscrição não foi aprovada — não há o que cancelar." }
  }

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
