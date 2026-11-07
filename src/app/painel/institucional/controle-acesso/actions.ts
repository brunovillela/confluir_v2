"use server"

import { revalidatePath } from "next/cache"

import { cadastrarAgente, desligarAgente, novoCodigoAgente, solicitarVerificacao } from "@/lib/acesso-agente"
import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"

const ROTA = "/painel/institucional/controle-acesso"

function campo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim()
}

export type EstadoCodigo = EstadoForm & { codigo?: string }

export async function cadastrarAgenteAction(_prev: EstadoCodigo, fd: FormData): Promise<EstadoCodigo> {
  const sessao = await requirePermissao("configuracoes")
  const r = await cadastrarAgente({ nome: campo(fd, "nome"), sedeId: campo(fd, "sede_id"), conector: campo(fd, "conector") }, sessao.usuario.id as string)
  if (r.erro) return { erro: r.erro, campo: r.campo }
  revalidatePath(ROTA)
  return { ok: "Computador cadastrado. Digite este código no assistente do agente:", codigo: r.codigo }
}

export async function novoCodigoAction(_prev: EstadoCodigo, fd: FormData): Promise<EstadoCodigo> {
  await requirePermissao("configuracoes")
  const r = await novoCodigoAgente(campo(fd, "agente_id"))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { codigo: r.codigo }
}

export async function verificarAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("configuracoes")
  const r = await solicitarVerificacao(campo(fd, "agente_id"), sessao.usuario.id as string)
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: "Pedido enviado ao agente." }
}

export async function desligarAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("configuracoes")
  const r = await desligarAgente(campo(fd, "agente_id"))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: "Agente desligado." }
}
