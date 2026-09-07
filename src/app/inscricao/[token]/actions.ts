"use server"

import { revalidatePath } from "next/cache"

import { type EstadoForm } from "@/lib/contas"
import {
  confirmarEmail,
  novoCodigo,
  responderRsvp,
  salvarFoto,
} from "@/lib/db/eventos-publico"
import { obterEvento } from "@/lib/db/eventos"
import { avisarAvaliacao } from "@/lib/db/eventos-emails"
import {
  registrarInscricaoNoProntuario,
  registrarRsvpNoProntuario,
} from "@/lib/db/eventos-filiados"
import { enviarEmail } from "@/lib/email"
import { tenantAtual } from "@/lib/tenant"

/**
 * Página privada do inscrito (`/inscricao/<token>`).
 *
 * O TOKEN é a credencial: quem tem o link é a pessoa. Não há sessão, então todas
 * as leituras e escritas passam pelo token + tenant do subdomínio — nunca por
 * um id vindo do formulário.
 */

const MAX_FOTO = 4 * 1024 * 1024

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

export async function confirmarEmailAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const token = txt(fd, "token")
  const codigo = txt(fd, "codigo")
  if (!token) return { erro: "Inscrição inválida." }
  if (!codigo) return { erro: "Informe o código recebido por e-mail." }

  const resultado = await confirmarEmail(token, codigo, await tenantAtual())
  if (resultado.erro) return { erro: resultado.erro }

  revalidatePath(`/inscricao/${token}`)

  // Evento sem aprovação confirma na hora. Vale um e-mail com data, local e o
  // link: a pessoa vai procurar isso na caixa de entrada semanas depois, não
  // nesta tela. Falhar no envio não desfaz a confirmação.
  if (resultado.inscricaoId) {
    // Casa a inscrição com a filiação pelo CPF e lança no prontuário. Vale
    // mesmo quando a inscrição ainda aguarda aprovação: quem se inscreveu,
    // se inscreveu.
    await registrarInscricaoNoProntuario(
      resultado.inscricaoId,
      await tenantAtual()
    )
  }

  if (resultado.confirmada && resultado.eventoId && resultado.inscricaoId) {
    const evento = await obterEvento(resultado.eventoId)
    if (evento) {
      await avisarAvaliacao(evento, resultado.inscricaoId, "confirmada", null)
    }
  }

  return { ok: "E-mail confirmado." }
}

export async function reenviarCodigoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const token = txt(fd, "token")
  if (!token) return { erro: "Inscrição inválida." }

  const { erro, codigo, email, nome } = await novoCodigo(
    token,
    await tenantAtual()
  )
  if (erro || !codigo || !email) return { erro: erro ?? "Falha ao gerar código." }

  const enviado = await enviarEmail({
    email,
    nome,
    assunto: "Seu novo código de confirmação",
    html: `<p>Olá${nome ? `, ${nome.split(" ")[0]}` : ""}!</p><p>Seu novo código é:</p><p style="font-size:28px;letter-spacing:4px;font-weight:bold">${codigo}</p><p>Ele vale por 30 minutos.</p><p>{ENTIDADE}</p>`,
  })
  if (!enviado) console.info(`[eventos] código de ${email}: ${codigo}`)

  return { ok: "Enviamos um novo código." }
}

/**
 * Envio da selfie. Recebe FormData direto (não é `useActionState`) porque quem
 * chama é o componente de câmera, com o blob montado no navegador.
 */
export async function enviarFotoAction(
  fd: FormData
): Promise<{ erro?: string; ok?: boolean }> {
  const token = txt(fd, "token")
  if (!token) return { erro: "Inscrição inválida." }

  const arquivo = fd.get("foto")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Nenhuma foto recebida." }
  }
  if (arquivo.size > MAX_FOTO) {
    return { erro: "A foto ficou grande demais. Tente novamente." }
  }

  const { erro } = await salvarFoto(token, await tenantAtual(), arquivo)
  if (erro) return { erro }

  revalidatePath(`/inscricao/${token}`)
  return { ok: true }
}

export async function responderRsvpAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const token = txt(fd, "token")
  const vem = txt(fd, "vem") === "sim"
  if (!token) return { erro: "Inscrição inválida." }

  const tenantId = await tenantAtual()
  const { erro, inscricaoId } = await responderRsvp(token, tenantId, vem)
  if (erro) return { erro }

  if (inscricaoId) {
    await registrarRsvpNoProntuario(inscricaoId, tenantId, vem)
  }

  revalidatePath(`/inscricao/${token}`)
  return {
    ok: vem
      ? "Obrigado! Sua presença está confirmada."
      : "Obrigado por avisar que não poderá comparecer.",
  }
}
