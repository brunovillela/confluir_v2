"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao, requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { abrirCiclo, decidirItem, encerrarCiclo, tratarItem, type Decisao } from "@/lib/db/acessos-revisao-ciclo"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Revisão periódica de acessos. Abrir, encerrar e resolver são da Gestão
 * (gestao_sistema, ou quem cuida de Usuários e permissões). Responder um item
 * é do coordenador da equipe — sem permissão nenhuma: a autoridade vem de ser
 * o revisor do item (conferida em decidirItem) — ou da Gestão.
 */

const ROTA = "/painel/gestao/usuarios/revisao"
const CHAVE = "gestao_sistema"
const ALT = ["permissoes"]

function revalidar() {
  revalidatePath(ROTA)
  revalidatePath("/painel/gestao")
  revalidatePath("/painel")
}

export async function abrirRevisaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao(CHAVE, ALT)
  const titulo = String(fd.get("titulo") ?? "").trim()
  const prazo = String(fd.get("prazo") ?? "").trim()
  if (!titulo) return { erro: "Dê um nome à revisão (ex.: 4º trimestre de 2026).", campo: "titulo" }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return { erro: "Informe o prazo.", campo: "prazo" }
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
  if (prazo < hoje) return { erro: "O prazo não pode ser no passado.", campo: "prazo" }
  const r = await abrirCiclo(titulo, prazo, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidar()
  return { ok: `Revisão aberta com ${r.itens} ${r.itens === 1 ? "acesso" : "acessos"}. Os coordenadores foram avisados.` }
}

export async function encerrarRevisaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao(CHAVE, ALT)
  const id = String(fd.get("ciclo_id") ?? "")
  if (!id) return { erro: "Revisão inválida." }
  const r = await encerrarCiclo(id, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidar()
  return { ok: "Revisão encerrada. Ela fica no histórico como registro." }
}

const DECISOES: Decisao[] = ["manter", "retirar", "ajustar"]

export async function decidirRevisaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const id = String(fd.get("item_id") ?? "")
  const decisao = DECISOES.find((d) => d === fd.get("decisao"))
  const observacao = String(fd.get("observacao") ?? "").trim().slice(0, 500) || null
  if (!id || !decisao) return { erro: "Escolha uma resposta." }
  const comoGestao = podeAcessar(sessao.permissoes, CHAVE, ALT)
  const r = await decidirItem(id, decisao, observacao, String(sessao.usuario.id), comoGestao)
  if (r.erro) return { erro: r.erro, campo: r.erro.startsWith("Diga") ? "observacao" : undefined }
  revalidar()
  return { ok: "Resposta registrada." }
}

export async function tratarItemAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao(CHAVE, ALT)
  const id = String(fd.get("item_id") ?? "")
  const tratamento = String(fd.get("tratamento") ?? "").trim().slice(0, 300)
  if (!id) return { erro: "Item inválido." }
  if (!tratamento) return { erro: "Diga o que foi feito (ex.: retirei o perfil Financeiro).", campo: "tratamento" }
  const r = await tratarItem(id, tratamento, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidar()
  return { ok: "Marcado como resolvido." }
}
