"use server"

import { revalidatePath } from "next/cache"

import { criarChaveApi, revogarChaveApi } from "@/lib/api-publica"
import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { emitirEvento, excluirWebhook, reenviarEntrega, salvarWebhook } from "@/lib/db/webhooks"

const ROTA = "/painel/institucional/api"

function campo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim()
}

export type EstadoChave = EstadoForm & { token?: string }
export type EstadoWebhook = EstadoForm & { segredo?: string }

export async function criarChaveAction(_prev: EstadoChave, fd: FormData): Promise<EstadoChave> {
  const sessao = await requirePermissao("configuracoes")
  const r = await criarChaveApi(campo(fd, "nome"), sessao.usuario.id as string)
  if (r.erro) return { erro: r.erro, campo: "nome" }
  revalidatePath(ROTA)
  return { ok: "Chave criada. Copie agora: ela não será mostrada de novo.", token: r.token }
}

export async function revogarChaveAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("configuracoes")
  const r = await revogarChaveApi(campo(fd, "chave_id"))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: "Chave revogada." }
}

export async function salvarWebhookAction(_prev: EstadoWebhook, fd: FormData): Promise<EstadoWebhook> {
  const sessao = await requirePermissao("configuracoes")
  const r = await salvarWebhook(
    campo(fd, "webhook_id") || null,
    { url: campo(fd, "url"), eventos: fd.getAll("eventos").map(String), descricao: campo(fd, "descricao") || null, ativo: fd.get("ativo") !== null },
    sessao.usuario.id as string
  )
  if (r.erro) return { erro: r.erro, campo: r.campo }
  revalidatePath(ROTA)
  return { ok: r.segredo ? "Webhook criado. Guarde o segredo: ele assina cada entrega e não será mostrado de novo." : "Webhook salvo.", segredo: r.segredo }
}

export async function excluirWebhookAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("configuracoes")
  const r = await excluirWebhook(campo(fd, "webhook_id"))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: "Webhook excluído." }
}

export async function testarWebhookAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("configuracoes")
  const n = await emitirEvento("teste", { mensagem: campo(fd, "mensagem") || "Evento de teste do Confluir", enviadoPor: sessao.usuario.email ?? null })
  revalidatePath(ROTA)
  return n ? { ok: `Teste enviado para ${n} webhook(s). Veja o resultado nas entregas em instantes.` } : { erro: "Nenhum webhook ativo inscrito no evento \"teste\"." }
}

export async function reenviarEntregaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("configuracoes")
  const r = await reenviarEntrega(campo(fd, "entrega_id"))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: "Reenviada." }
}
