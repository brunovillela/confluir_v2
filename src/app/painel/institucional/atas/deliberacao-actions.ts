"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarDeliberacao,
  criarDeliberacao,
  excluirDeliberacao,
  obterDeliberacao,
  type DadosDeliberacao,
} from "@/lib/db/deliberacoes"
import {
  ehSigiloDeliberacao,
  ehSituacaoDeliberacao,
  nivelSigilo,
  sigilosVisiveis,
  type SigiloDeliberacao,
} from "@/lib/deliberacoes-constantes"

/**
 * Item existente fora do sigilo do usuário = como se não existisse (não
 * revela que há algo ali). Devolve o erro, ou nada se pode mexer.
 */
async function conferirAlcance(id: string, sigilos: SigiloDeliberacao[]): Promise<string | null> {
  const atual = await obterDeliberacao(id)
  if (!atual || !sigilos.includes(atual.sigilo)) return "Deliberação não encontrada."
  return null
}

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
  const sigilos = sigilosVisiveis(nivelSigilo(sessao.permissoes))
  if (sigilos.length === 0) return { erro: "Seu acesso às deliberações é nenhum — peça à administração um nível de sigilo." }
  const ataId = campo(fd, "ata_id")
  const id = campo(fd, "deliberacao_id")
  if (!ataId) return { erro: "Ata inválida." }
  const dados = lerDados(fd)
  if ("erro" in dados) return dados
  if (!sigilos.includes(dados.sigilo)) {
    return { erro: "Esse grau de sigilo está acima do seu acesso às deliberações.", campo: "sigilo" }
  }
  if (id) {
    const fora = await conferirAlcance(id, sigilos)
    if (fora) return { erro: fora }
  }
  const { erro } = id
    ? await atualizarDeliberacao(id, dados, sessao.usuario.id)
    : await criarDeliberacao(ataId, dados, sessao.usuario.id)
  if (erro) return { erro }
  revalidar(ataId)
  redirect(`/painel/institucional/atas/${ataId}?deliberacao_salva=1#deliberacoes`)
}

export async function excluirDeliberacaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("diretoria_reunioes")
  const ataId = campo(fd, "ata_id")
  const id = campo(fd, "deliberacao_id")
  if (!ataId || !id) return { erro: "Deliberação inválida." }
  const fora = await conferirAlcance(id, sigilosVisiveis(nivelSigilo(sessao.permissoes)))
  if (fora) return { erro: fora }
  const { erro } = await excluirDeliberacao(id)
  if (erro) return { erro }
  revalidar(ataId)
  redirect(`/painel/institucional/atas/${ataId}?deliberacao_excluida=1#deliberacoes`)
}
