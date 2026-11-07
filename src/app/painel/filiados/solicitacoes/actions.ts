"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { reenviarLinkPeloPainel } from "@/lib/db/filiacao-ficha-online"
import { avaliarSolicitacao, marcarDesistenciaFicha, registrarContatoFicha } from "@/lib/db/filiacao-publica"
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

const UUID_FICHA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Quem parou no meio: reenviar o link, registrar contato ou marcar desistência. */
export async function acaoFichaParadaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")
  const id = String(formData.get("id") ?? "")
  if (!UUID_FICHA.test(id)) return { erro: "Ficha inválida." }
  const acao = String(formData.get("acao") ?? "")
  const nota = String(formData.get("nota") ?? "")
  let r: { erro?: string; email?: string }
  let ok: string
  if (acao === "reenviar") {
    r = await reenviarLinkPeloPainel(id, sessao.usuario.id)
    ok = r.email ? `Link reenviado para ${r.email}.` : "Link reenviado."
  } else if (acao === "contato") {
    r = await registrarContatoFicha(id, nota, sessao.usuario.id)
    ok = "Contato registrado. A ficha volta aos avisos se continuar parada."
  } else if (acao === "desistencia") {
    r = await marcarDesistenciaFicha(id, nota)
    ok = "Marcada como desistência."
  } else {
    return { erro: "Ação inválida." }
  }
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/filiados/solicitacoes")
  revalidatePath(`/painel/filiados/solicitacoes/${id}`)
  return { ok }
}
