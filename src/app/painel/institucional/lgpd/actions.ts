"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { criarBloqueio, encerrarBloqueio, salvarRegra, simularRetencao } from "@/lib/db/lgpd-retencao"

const ROTA = "/painel/institucional/lgpd"

function campo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim()
}

export async function simularAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("configuracoes")
  const codigo = campo(fd, "codigo") || undefined
  try {
    const r = await simularRetencao(sessao.usuario.id as string, codigo)
    revalidatePath(ROTA)
    const falha = r.find((x) => x.erro)
    if (falha) return { erro: `${falha.codigo}: ${falha.erro}` }
    const total = r.reduce((s, x) => s + x.linhas, 0)
    return { ok: `Simulação concluída: ${total} registro${total === 1 ? "" : "s"} sairia${total === 1 ? "" : "m"} hoje. Nada foi apagado.` }
  } catch (e) {
    return { erro: (e as Error).message }
  }
}

export async function salvarRegraAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("configuracoes")
  const prazoTxt = campo(fd, "prazo_dias")
  const prazoDias = prazoTxt ? Number(prazoTxt) : null
  if (prazoTxt && !Number.isInteger(prazoDias)) return { erro: "Prazo em dias inteiros.", campo: "prazo_dias" }
  const r = await salvarRegra(campo(fd, "regra_id"), { prazoDias, ativa: fd.get("ativa") !== null }, sessao.usuario.id as string)
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: "Regra salva." }
}

export async function criarBloqueioAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("configuracoes")
  const r = await criarBloqueio(
    { cpf: campo(fd, "cpf") || null, email: campo(fd, "email") || null, motivo: campo(fd, "motivo"), processo: campo(fd, "processo") || null },
    sessao.usuario.id as string
  )
  if (r.erro) return { erro: r.erro, campo: r.campo }
  revalidatePath(ROTA)
  return { ok: "Bloqueio criado. A pessoa fica fora de todas as regras até o bloqueio ser encerrado." }
}

export async function encerrarBloqueioAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("configuracoes")
  const r = await encerrarBloqueio(campo(fd, "bloqueio_id"), sessao.usuario.id as string)
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: "Bloqueio encerrado." }
}
