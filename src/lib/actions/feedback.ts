"use server"

import { requireSessaoPainel } from "@/lib/auth"
import { registrarFeedback, type TipoFeedback } from "@/lib/db/feedback"
import { origemAtual } from "@/lib/tenant-url"

export type EstadoFeedback = { ok?: { id: string }; erro?: string }

export async function enviarFeedbackAction(_prev: EstadoFeedback, formData: FormData): Promise<EstadoFeedback> {
  const sessao = await requireSessaoPainel()
  const tipoBruto = String(formData.get("tipo") ?? "problema")
  const tipo: TipoFeedback = tipoBruto === "sugestao" ? "sugestao" : "problema"
  const print = formData.get("print")
  const { id, erro } = await registrarFeedback(sessao, {
    tipo,
    texto: String(formData.get("texto") ?? ""),
    url: String(formData.get("url") ?? "").slice(0, 500),
    navegador: String(formData.get("navegador") ?? "").slice(0, 300),
    print: print instanceof File ? print : null,
    origem: await origemAtual(),
  })
  if (erro || !id) return { erro: erro ?? "Não foi possível registrar." }
  return { ok: { id } }
}
