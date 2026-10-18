"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPortal } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { depoisDaResposta } from "@/lib/db/avisos"
import { obterConfig, obterEvento } from "@/lib/db/eventos"
import { registrarRsvpNoProntuario } from "@/lib/db/eventos-filiados"
import {
  avisarReciboInscricao,
  cancelarInscricaoDoFiliado,
  inscreverFiliado,
} from "@/lib/db/eventos-portal"
import { responderRsvp } from "@/lib/db/eventos-publico"
import { bloqueioDaParte, opcoesDaParte } from "@/lib/db/portal-partes"
import { tenantAtual } from "@/lib/tenant"

/**
 * Eventos na área do filiado.
 *
 * A sessão do portal é a identidade — nada aqui aceita CPF vindo do
 * formulário, senão bastaria trocar o campo escondido para se inscrever no
 * lugar de outra pessoa.
 *
 * Filiados › Área do associado: com Eventos suspensa (ou o portal em modo de
 * consulta), inscrever e responder presença recusam aqui. Cancelar continua
 * — solta a vaga e evita a falta — a não ser que a gestão tenha desligado o
 * cancelamento pelo portal.
 */

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

export async function inscreverAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  const bloqueio = await bloqueioDaParte("eventos")
  if (bloqueio) return { erro: bloqueio }
  if (!filiado.ativo) {
    return { erro: "Sua filiação precisa estar ativa para se inscrever." }
  }

  const evento = await obterEvento(txt(fd, "eventoId"))
  if (!evento) return { erro: "Evento não encontrado." }

  const { erro, situacao, jaInscrito, reinscricao, inscricaoId, token } = await inscreverFiliado(
    evento,
    {
      cpf: filiado.cpf,
      nome: filiado.nome_completo,
      email: filiado.email,
      filiacaoId: filiado.filiacaoId,
    },
    await tenantAtual()
  )
  if (erro) return { erro }

  // Recibo no sino (e e-mail, se confirmada) depois da resposta (A122).
  if (!jaInscrito && inscricaoId && situacao) {
    depoisDaResposta(() =>
      avisarReciboInscricao(
        evento,
        { id: inscricaoId, token: token ?? null, situacao },
        { cpf: filiado.cpf, nome: filiado.nome_completo, email: filiado.email }
      )
    )
  }

  revalidatePath("/portal/eventos")
  // Nada foi gravado: dizer "Inscrição feita." seria mentir.
  if (jaInscrito) {
    return { ok: "Você já está inscrito(a) neste evento. Acompanhe a inscrição em Minhas inscrições." }
  }
  // Evento com foto obrigatória (A44): a inscrição só se completa com ela, e
  // quem acabou de tocar "Quero participar" precisa saber disso agora.
  const modoFoto = evento.exige_foto
    ? ((await obterConfig().catch(() => null))?.config.modo_foto ?? "nenhuma")
    : "nenhuma"
  // Na volta depois de cancelar, a foto antiga continua na inscrição.
  const foto =
    modoFoto === "nenhuma"
      ? ""
      : reinscricao
        ? " Este evento pede foto para a entrada — confira no cartão do evento."
        : " Falta enviar sua foto para a entrada — o botão está no cartão do evento."
  if (situacao === "pendente") {
    return {
      ok: `Inscrição recebida. Ela passa pela avaliação do sindicato — você recebe um aviso assim que houver resposta.${foto}`,
    }
  }
  return {
    ok: reinscricao
      ? `Pronto, você está inscrito(a) de novo. Acompanhe a inscrição em Minhas inscrições.${foto}`
      : `Inscrição feita. Acompanhe-a em Minhas inscrições.${foto}`,
  }
}

export async function responderRsvpPortalAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  const bloqueio = await bloqueioDaParte("eventos")
  if (bloqueio) return { erro: bloqueio }
  const token = txt(fd, "token")
  const vem = txt(fd, "vem") === "sim"
  if (!token) return { erro: "Inscrição inválida." }

  const tenantId = await tenantAtual()
  const { erro, inscricaoId } = await responderRsvp(token, tenantId, vem)
  if (erro) return { erro }
  if (inscricaoId) {
    await registrarRsvpNoProntuario(inscricaoId, tenantId, vem)
  }

  revalidatePath("/portal/eventos")
  return {
    ok: vem
      ? `Obrigado, ${filiado.nome_completo?.split(" ")[0] ?? ""}! Sua presença está confirmada.`.trim()
      : "Obrigado por avisar que não poderá comparecer.",
  }
}

export async function cancelarAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  // Sem trava de estado (suspensa ou desabilitada): cancelar solta a vaga.
  // Só a opção da gestão — eventos de lista fechada, desistência pela secretaria.
  const { permitir_cancelar } = await opcoesDaParte("eventos")
  if (!permitir_cancelar) {
    return { erro: "O cancelamento pelo portal não está disponível. Para cancelar, fale com o sindicato." }
  }
  const { erro, situacaoAnterior } = await cancelarInscricaoDoFiliado(
    txt(fd, "inscricaoId"),
    filiado.cpf,
    await tenantAtual()
  )
  if (erro) return { erro }

  revalidatePath("/portal/eventos")
  const volta = "Se mudar de ideia, é só se inscrever de novo enquanto houver vaga e prazo."
  // Quem esperava avaliação ou estava na lista de espera não tinha vaga a
  // liberar: "desistiu", não "cancelou a vaga" (A81).
  // Já cancelada (segundo toque, outra aba): nada mudou agora.
  return {
    ok:
      situacaoAnterior === "confirmada"
        ? `Inscrição cancelada — a vaga ficou livre para outra pessoa. ${volta}`
        : situacaoAnterior === "cancelada"
          ? `Sua inscrição já estava cancelada. ${volta}`
          : `Pronto, você desistiu da inscrição. ${volta}`,
  }
}
