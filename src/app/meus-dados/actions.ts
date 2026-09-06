"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { type EstadoForm } from "@/lib/contas"
import { validarEmail } from "@/lib/db/eventos-publico"
import {
  confirmarAcesso,
  corrigirDados,
  excluirDadosDoTitular,
  iniciarAcesso,
} from "@/lib/db/eventos-titular"
import { enviarEmail } from "@/lib/email"
import { tenantAtual } from "@/lib/tenant"

/**
 * Canal do titular dos dados (LGPD art. 18) — para quem não é filiado.
 *
 * NÃO revela se um e-mail existe na base: quem digita o endereço de outra
 * pessoa recebe exatamente a mesma resposta de quem digita o próprio. É o
 * mínimo para o canal não virar ferramenta de descoberta de participantes.
 */

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

export async function pedirCodigoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const email = txt(fd, "email").toLowerCase()
  if (!validarEmail(email)) return { erro: "Informe um e-mail válido." }

  const tenantId = await tenantAtual()
  const { token, codigo, nome } = await iniciarAcesso(email, tenantId)
  if (!token) return { erro: "Não foi possível iniciar. Tente novamente." }

  if (codigo) {
    const enviado = await enviarEmail({
      email,
      nome,
      assunto: "Seu código para acessar seus dados",
      html: `<p>Olá${nome ? `, ${nome.split(" ")[0]}` : ""}!</p><p>Recebemos um pedido para acessar os dados ligados a este e-mail. Seu código é:</p><p style="font-size:28px;letter-spacing:4px;font-weight:bold">${codigo}</p><p>Ele vale por 30 minutos. Se não foi você quem pediu, ignore esta mensagem — nada acontece sem o código.</p><p>{ENTIDADE}</p>`,
    })
    if (!enviado) console.info(`[eventos/titular] código de ${email}: ${codigo}`)
  }

  redirect(`/meus-dados/${token}`)
}

export async function confirmarAcessoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const token = txt(fd, "token")
  const codigo = txt(fd, "codigo")
  if (!token) return { erro: "Sessão inválida." }
  if (!codigo) return { erro: "Informe o código recebido." }

  const { erro } = await confirmarAcesso(token, codigo, await tenantAtual())
  if (erro) return { erro }

  revalidatePath(`/meus-dados/${token}`)
  return { ok: "Acesso liberado." }
}

export async function corrigirAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const token = txt(fd, "token")
  const nome = txt(fd, "nome")
  const telefone = txt(fd, "telefone").replace(/\D/g, "")
  if (!token) return { erro: "Sessão inválida." }
  if (nome && nome.length < 5) return { erro: "Nome muito curto." }

  const { erro } = await corrigirDados(token, await tenantAtual(), {
    nome: nome || undefined,
    telefone,
  })
  if (erro) return { erro }

  revalidatePath(`/meus-dados/${token}`)
  return { ok: "Dados corrigidos." }
}

export async function excluirAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const token = txt(fd, "token")
  if (!token) return { erro: "Sessão inválida." }
  // Confirmação por digitação: exclusão é irreversível e não pode acontecer
  // por toque acidental numa tela de celular.
  if (txt(fd, "confirmacao").toUpperCase() !== "EXCLUIR") {
    return { erro: 'Digite EXCLUIR para confirmar.' }
  }

  const res = await excluirDadosDoTitular(
    token,
    await tenantAtual(),
    txt(fd, "motivo") || null
  )
  if (res.erro) return { erro: res.erro }

  const partes = [
    `${res.anonimizadas} inscrição(ões) anonimizada(s).`,
    res.fotosApagadas ? `${res.fotosApagadas} foto(s) apagada(s).` : null,
    res.remocaoAcessoPendente
      ? "Sua remoção do sistema de controle de acesso foi registrada e será executada pela equipe — ela é feita fora deste sistema."
      : null,
  ].filter(Boolean)

  revalidatePath(`/meus-dados/${token}`)
  return { ok: partes.join(" ") }
}
