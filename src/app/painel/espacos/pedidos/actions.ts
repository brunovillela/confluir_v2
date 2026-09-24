"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import {
  agendarVisita,
  assumirPedido,
  cancelarPedido,
  confirmarCessao,
  decidirAutorizacao,
  dispensarVisita,
  lancarCusteio,
  recusarPedido,
  registrarPagamento,
  registrarVisita,
} from "@/lib/db/espacos-esteira"
import { gerarTermoDaCessao } from "@/lib/db/espacos-termo"
import {
  cancelarAssinaturaCessao,
  enviarTermoParaAssinatura,
} from "@/lib/db/cessao-assinatura"

type Estado = { erro?: string; ok?: string }

const txt = (fd: FormData, nome: string) => String(fd.get(nome) ?? "").trim()
const caminho = (id: string) => `/painel/espacos/pedidos/${id}`

const depois = (id: string) => {
  revalidatePath(caminho(id))
  revalidatePath("/painel/espacos/pedidos")
}

export async function assumirAction(_prev: Estado, fd: FormData): Promise<Estado> {
  const sessao = await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  const { erro } = await assumirPedido(id, sessao.usuario.id as string)
  if (erro) return { erro }
  depois(id)
  return { ok: "Pedido assumido." }
}

export async function agendarVisitaAction(
  _prev: Estado,
  fd: FormData
): Promise<Estado> {
  const sessao = await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  const { erro } = await agendarVisita(
    id,
    { quando: txt(fd, "quando"), responsavelId: txt(fd, "responsavel") || null },
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  depois(id)
  return { ok: "Visita agendada e solicitante avisado." }
}

export async function registrarVisitaAction(
  _prev: Estado,
  fd: FormData
): Promise<Estado> {
  const sessao = await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  const { erro } = await registrarVisita(
    id,
    txt(fd, "parecer"),
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  depois(id)
  return { ok: "Visita registrada." }
}

export async function dispensarVisitaAction(fd: FormData): Promise<void> {
  const sessao = await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  await dispensarVisita(id, sessao.usuario.id as string)
  depois(id)
}

/**
 * A autorização é a avaliação POLÍTICA — permissão própria, separada de quem
 * organiza a agenda.
 */
export async function autorizarAction(_prev: Estado, fd: FormData): Promise<Estado> {
  const sessao = await requirePermissao("espacos_autorizacao")
  const id = txt(fd, "id")
  const decisao = txt(fd, "decisao")
  if (decisao !== "autorizada" && decisao !== "negada") {
    return { erro: "Decisão inválida." }
  }
  const { erro } = await decidirAutorizacao(
    id,
    decisao,
    txt(fd, "parecer"),
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  depois(id)
  return {
    ok: decisao === "autorizada" ? "Cessão autorizada." : "Cessão negada, solicitante avisado.",
  }
}

export async function custeioAction(_prev: Estado, fd: FormData): Promise<Estado> {
  const sessao = await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  const descricoes = fd.getAll("item_descricao").map(String)
  const valores = fd.getAll("item_valor").map((v) => Number(String(v).replace(",", ".")))
  const itens = descricoes.map((d, i) => ({
    descricao: d,
    valor: Number.isFinite(valores[i]) ? valores[i] : 0,
  }))
  if (itens.some((i) => i.valor < 0)) return { erro: "Valor não pode ser negativo." }

  const { erro } = await lancarCusteio(
    id,
    { itens, observacao: txt(fd, "observacao") || null },
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  depois(id)
  return { ok: "Custeio salvo." }
}

export async function pagamentoAction(fd: FormData): Promise<void> {
  const sessao = await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  await registrarPagamento(id, sessao.usuario.id as string)
  depois(id)
}

export async function confirmarAction(_prev: Estado, fd: FormData): Promise<Estado> {
  const sessao = await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  const { erro } = await confirmarCessao(id, sessao.usuario.id as string)
  if (erro) return { erro }
  depois(id)
  return { ok: "Cessão confirmada e solicitante avisado." }
}

export async function recusarAction(_prev: Estado, fd: FormData): Promise<Estado> {
  const sessao = await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  const { erro } = await recusarPedido(
    id,
    txt(fd, "motivo"),
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  depois(id)
  return { ok: "Pedido recusado e solicitante avisado." }
}

export async function cancelarAction(_prev: Estado, fd: FormData): Promise<Estado> {
  const sessao = await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  const { erro } = await cancelarPedido(
    id,
    txt(fd, "motivo"),
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  depois(id)
  return { ok: "Pedido cancelado." }
}

/** Gera (ou regera) o termo desta cessão a partir do modelo em vigor. */
export async function gerarTermoAction(
  _prev: Estado,
  fd: FormData
): Promise<Estado> {
  const sessao = await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  const { erro, codigo } = await gerarTermoDaCessao(id, sessao.usuario.id as string)
  if (erro) return { erro }
  depois(id)
  return { ok: `Termo gerado a partir da versão ${codigo ?? "vigente"}.` }
}

// ── Assinatura do termo ──────────────────────────────────────────────────────

export async function enviarAssinaturaAction(
  _prev: Estado,
  fd: FormData
): Promise<Estado> {
  const sessao = await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  const { erro } = await enviarTermoParaAssinatura(
    id,
    {
      cedenteNome: txt(fd, "cedente_nome"),
      cedenteEmail: txt(fd, "cedente_email"),
      concessionarioNome: txt(fd, "concessionario_nome"),
      concessionarioEmail: txt(fd, "concessionario_email"),
    },
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  depois(id)
  return { ok: "Enviado. O cedente assina primeiro; depois o link vai para o concessionário." }
}

export async function cancelarAssinaturaAction(fd: FormData): Promise<void> {
  const sessao = await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  await cancelarAssinaturaCessao(id, sessao.usuario.id as string)
  depois(id)
}
