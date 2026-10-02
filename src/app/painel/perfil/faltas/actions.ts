"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { cancelarMinhaFalta, registrarFalta, subirComprovacaoFalta } from "@/lib/db/faltas"
import { exigirFuncionario } from "@/lib/db/perfil"

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

function revalidar() {
  revalidatePath("/painel/perfil/faltas")
  revalidatePath("/painel/pessoal/faltas")
}

/** O funcionário pede a falta para si; nasce aguardando autorização. */
export async function solicitarFaltaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  // Só quem tem vínculo ATIVO com a entidade pede falta justificada.
  await exigirFuncionario(sessao.usuario.id, { ativo: true })
  const data = texto(fd, "data")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data da falta." }
  const up = await subirComprovacaoFalta(fd.get("comprovacao"), sessao.usuario.id)
  if ("erro" in up) return up
  const { erro } = await registrarFalta(
    {
      funcionarioId: sessao.usuario.id,
      data,
      tipo: texto(fd, "tipo"),
      observacao: texto(fd, "observacao") || null,
      comprovacao: up.caminho,
    },
    { solicitanteId: sessao.usuario.id }
  )
  if (erro) return { erro }
  revalidar()
  return { ok: "Pedido enviado — o departamento de pessoal vai avaliar." }
}

export async function cancelarFaltaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const id = texto(fd, "id")
  if (!id) return { erro: "Pedido inválido." }
  const { erro } = await cancelarMinhaFalta(id, sessao.usuario.id)
  if (erro) return { erro }
  revalidar()
  return { ok: "Pedido cancelado." }
}
