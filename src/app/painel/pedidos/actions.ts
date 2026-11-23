"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { enviarPedido } from "@/lib/db/pedidos"

/** Pedido por um formulário: vira demanda do setor (aberto a todo o painel). */
export async function enviarPedidoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const titulo = String(fd.get("titulo") ?? "").trim().slice(0, 150)
  const descricao = String(fd.get("descricao") ?? "").trim().slice(0, 4000)
  const prazoBruto = String(fd.get("prazo") ?? "")
  const prazo = /^\d{4}-\d{2}-\d{2}$/.test(prazoBruto) ? prazoBruto : null
  if (!titulo) return { erro: "Diga em poucas palavras o que você precisa." }
  const u = sessao.usuario as { id: string; nome_completo?: string | null; nome_guerra?: string | null }
  const r = await enviarPedido(String(fd.get("formulario_id") ?? ""), { titulo, descricao, prazo }, {
    id: String(u.id),
    nome: u.nome_guerra ?? u.nome_completo ?? null,
  })
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/pedidos")
  return { ok: "Pedido enviado. Acompanhe em Meus pedidos, abaixo." }
}
