"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarDeliberacao,
  criarDeliberacao,
  excluirDeliberacao,
  type DadosDeliberacao,
} from "@/lib/db/deliberacoes"
import { ehSigiloDeliberacao, ehSituacaoDeliberacao } from "@/lib/deliberacoes-constantes"

function campo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim()
}

function lerDados(fd: FormData): DadosDeliberacao | { erro: string; campo: string } {
  const assunto = campo(fd, "assunto")
  if (!assunto) return { erro: "Informe o assunto da deliberação.", campo: "assunto" }
  if (assunto.length > 200) return { erro: "O assunto passa de 200 caracteres — o detalhe vai no teor.", campo: "assunto" }
  const situacao = campo(fd, "situacao")
  const sigilo = campo(fd, "sigilo")
  if (!ehSigiloDeliberacao(sigilo)) return { erro: "Escolha o sigilo.", campo: "sigilo" }
  const prazo = campo(fd, "prazo")
  return {
    assunto,
    texto: campo(fd, "texto") || null,
    votacao: campo(fd, "votacao") || null,
    responsavel: campo(fd, "responsavel") || null,
    prazo: /^\d{4}-\d{2}-\d{2}$/.test(prazo) ? prazo : null,
    situacao: ehSituacaoDeliberacao(situacao) ? situacao : "a_cumprir",
    sigilo,
  }
}

function revalidar(ataId: string) {
  revalidatePath(`/painel/institucional/atas/${ataId}`)
  revalidatePath("/painel/institucional/deliberacoes")
}

export async function salvarDeliberacaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("diretoria_reunioes")
  const ataId = campo(fd, "ata_id")
  const id = campo(fd, "deliberacao_id")
  if (!ataId) return { erro: "Ata inválida." }
  const dados = lerDados(fd)
  if ("erro" in dados) return dados
  const { erro } = id
    ? await atualizarDeliberacao(id, dados, sessao.usuario.id)
    : await criarDeliberacao(ataId, dados, sessao.usuario.id)
  if (erro) return { erro }
  revalidar(ataId)
  redirect(`/painel/institucional/atas/${ataId}?deliberacao_salva=1#deliberacoes`)
}

export async function excluirDeliberacaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("diretoria_reunioes")
  const ataId = campo(fd, "ata_id")
  const id = campo(fd, "deliberacao_id")
  if (!ataId || !id) return { erro: "Deliberação inválida." }
  const { erro } = await excluirDeliberacao(id)
  if (erro) return { erro }
  revalidar(ataId)
  redirect(`/painel/institucional/atas/${ataId}?deliberacao_excluida=1#deliberacoes`)
}
