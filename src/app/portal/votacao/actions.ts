"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPortal } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  confirmarVerificacaoEmail,
  definirEmailVotacaoDireto,
  registrarVotoFiliado,
  solicitarVerificacaoEmail,
} from "@/lib/db/votacao-portal"

/** Envia o código de verificação para o e-mail de votação informado. */
export async function enviarCodigoEmailVotacao(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  const email = String(formData.get("email") ?? "").trim()
  if (!email) return { erro: "Informe o e-mail." }

  // Se for exatamente o e-mail com que entra no portal, já vale (verificado).
  if (filiado.email && email.toLowerCase() === filiado.email.toLowerCase()) {
    await definirEmailVotacaoDireto(filiado.cpf, email)
    revalidatePath("/portal/votacao")
    return { ok: "E-mail definido e verificado." }
  }

  const r = await solicitarVerificacaoEmail(filiado.cpf, email)
  if (r.erro) return { erro: r.erro }
  revalidatePath("/portal/votacao")
  return { ok: r.ok }
}

/** Confirma o código de 6 dígitos e verifica o e-mail de votação. */
export async function confirmarCodigoEmailVotacao(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  const codigo = String(formData.get("codigo") ?? "").trim()
  const r = await confirmarVerificacaoEmail(filiado.cpf, codigo)
  if (r.erro) return { erro: r.erro }
  revalidatePath("/portal/votacao")
  return { ok: "E-mail de votação verificado." }
}

/** Registra o voto do filiado (secreto). Uma escolha por pergunta. */
export async function votarNaAssembleia(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  if (!assembleiaId) return { erro: "Assembleia inválida." }

  // As escolhas chegam como pares p_<perguntaId> = <opcaoId>.
  const escolhas: { perguntaId: string; opcaoId: string }[] = []
  for (const [chave, valor] of formData.entries()) {
    if (chave.startsWith("p_") && typeof valor === "string" && valor) {
      escolhas.push({ perguntaId: chave.slice(2), opcaoId: valor })
    }
  }
  const r = await registrarVotoFiliado(filiado.cpf, assembleiaId, escolhas)
  if (r.erro) return { erro: r.erro }
  revalidatePath("/portal/votacao")
  revalidatePath("/portal/inicio")
  return { ok: "Voto registrado. Obrigado por participar." }
}
