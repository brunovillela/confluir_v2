"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { avaliarSolicitacao } from "@/lib/db/filiacao-publica"
import { enviarEmail } from "@/lib/email"

export async function avaliarSolicitacaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Solicitação inválida." }
  const aprovar = String(formData.get("decisao") ?? "") === "aprovar"
  const motivo = String(formData.get("motivo") ?? "").trim() || null

  const res = await avaliarSolicitacao(id, aprovar, motivo, sessao.usuario.id)
  if (res.erro) return { erro: res.erro }

  // Avisa o aspirante do resultado.
  if (res.email) {
    const html = res.aprovado
      ? `<p>Olá${res.nome ? `, ${res.nome.split(" ")[0]}` : ""}!</p><p>Sua filiação foi <strong>aprovada</strong>. Seja bem-vindo(a)!</p><p>Confluir</p>`
      : `<p>Olá${res.nome ? `, ${res.nome.split(" ")[0]}` : ""}!</p><p>Sua solicitação de filiação não foi aprovada${motivo ? `: ${motivo}` : "."}</p><p>Em caso de dúvidas, procure o sindicato.</p><p>Confluir</p>`
    await enviarEmail({
      email: res.email,
      nome: res.nome,
      assunto: res.aprovado ? "Filiação aprovada" : "Sobre a sua filiação",
      html,
    })
  }

  revalidatePath("/painel/filiados/solicitacoes")
  revalidatePath(`/painel/filiados/solicitacoes/${id}`)
  redirect(`/painel/filiados/solicitacoes/${id}?avaliado=1`)
}
