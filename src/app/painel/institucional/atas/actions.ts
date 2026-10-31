"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarAta,
  criarAta,
  excluirAta,
  sigiloDocumentoDaAta,
  subirDocumentoAta,
  type DadosAta,
} from "@/lib/db/atas"
import { registrarDeliberacoesLidas } from "@/lib/db/deliberacoes"
import {
  ehSigiloDeliberacao,
  nivelSigilo,
  sigilosVisiveis,
  type SigiloDeliberacao,
} from "@/lib/deliberacoes-constantes"
import type { Permissoes } from "@/lib/permissoes"
import { TIPOS_REUNIAO, type TipoReuniao } from "@/lib/atas-constantes"

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}
function ouNull(v: string): string | null {
  return v || null
}
function revalidar(id?: string, mandatoId?: string) {
  revalidatePath("/painel/institucional/atas")
  if (id) revalidatePath(`/painel/institucional/atas/${id}`)
  if (mandatoId) {
    revalidatePath(`/painel/institucional/diretoria/${mandatoId}`, "layout")
  }
}

async function lerDocumento(
  fd: FormData
): Promise<{ caminho?: string | null; erro?: string }> {
  const arq = fd.get("documento")
  if (!(arq instanceof File) || arq.size === 0) return { caminho: undefined }
  const { caminho, erro } = await subirDocumentoAta(arq)
  if (erro) return { erro }
  return { caminho }
}

/**
 * Sigilo do PDF pedido no formulário, dentro do nível de quem salva. Sem
 * nível (nenhum), o PDF fica restrito. `atual`: numa ata cujo PDF está acima
 * do nível de quem edita, o sigilo não muda (undefined = não mexer).
 */
function lerSigiloDocumento(
  fd: FormData,
  permissoes: Permissoes,
  atual?: SigiloDeliberacao
): { sigilo?: SigiloDeliberacao; erro?: string } {
  const sigilos = sigilosVisiveis(nivelSigilo(permissoes))
  // Acima do nível: nem o sigilo nem o resumo mudam (ver atualizarAtaAction).
  if (atual && !sigilos.includes(atual)) return { sigilo: undefined }
  if (sigilos.length === 0) return { sigilo: "restrito" }
  const pedido = texto(fd, "sigilo_documento")
  if (!ehSigiloDeliberacao(pedido) || !sigilos.includes(pedido)) {
    return { erro: "Escolha um sigilo do PDF dentro do seu acesso às deliberações." }
  }
  return { sigilo: pedido }
}

function lerDados(fd: FormData): Omit<DadosAta, "documento_url"> {
  const tipo = texto(fd, "tipo")
  return {
    mandato_id: ouNull(texto(fd, "mandato_id")),
    tipo: TIPOS_REUNIAO.some((t) => t.chave === tipo)
      ? (tipo as TipoReuniao)
      : "outra",
    orgao: ouNull(texto(fd, "orgao")),
    titulo: ouNull(texto(fd, "titulo")),
    data: ouNull(texto(fd, "data")),
    hora: ouNull(texto(fd, "hora")),
    local: ouNull(texto(fd, "local")),
    pauta: ouNull(texto(fd, "pauta")),
    resumo: ouNull(texto(fd, "resumo")),
    presentes: ouNull(texto(fd, "presentes")),
    observacoes: ouNull(texto(fd, "observacoes")),
  }
}

/**
 * Deliberações que a IA leu do PDF, vindas do formulário como JSON
 * (`deliberacoes_ia`). Formato inválido = nenhuma.
 */
function lerDeliberacoesLidas(fd: FormData) {
  try {
    const lista = JSON.parse(String(fd.get("deliberacoes_ia") ?? "[]")) as unknown
    if (!Array.isArray(lista)) return []
    return lista.slice(0, 50).flatMap((d) => {
      if (!d || typeof d !== "object") return []
      const o = d as Record<string, unknown>
      const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "")
      const assunto = s("assunto").slice(0, 200)
      if (!assunto) return []
      const prazo = s("prazo")
      return [{
        assunto,
        texto: s("texto") || null,
        votacao: s("votacao") || null,
        responsavel: s("responsavel") || null,
        prazo: /^\d{4}-\d{2}-\d{2}$/.test(prazo) ? prazo : null,
      }]
    })
  } catch {
    return []
  }
}

export async function criarAtaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("diretoria_reunioes")
  const sigilo = lerSigiloDocumento(fd, sessao.permissoes)
  if (sigilo.erro) return { erro: sigilo.erro, campo: "sigilo_documento" }
  const { caminho, erro: erroArq } = await lerDocumento(fd)
  if (erroArq) return { erro: erroArq }
  const dados = lerDados(fd)
  const { id, erro } = await criarAta({
    ...dados,
    documento_url: caminho ?? null,
    sigilo_documento: sigilo.sigilo ?? "restrito",
  })
  if (erro || !id) return { erro: erro ?? "Falha ao criar." }
  // A ata já existe: falha nas deliberações lidas não desfaz a ata — elas
  // podem ser lançadas à mão no cartão Deliberações.
  await registrarDeliberacoesLidas(id, lerDeliberacoesLidas(fd), sessao.usuario.id)
  revalidar(id, dados.mandato_id ?? undefined)
  redirect(`/painel/institucional/atas/${id}?salvo=1`)
}

export async function atualizarAtaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("diretoria_reunioes")
  const id = texto(fd, "ata_id")
  if (!id) return { erro: "Ata inválida." }
  const atual = await sigiloDocumentoDaAta(id)
  if (!atual) return { erro: "Ata não encontrada." }
  const sigilo = lerSigiloDocumento(fd, sessao.permissoes, atual)
  if (sigilo.erro) return { erro: sigilo.erro, campo: "sigilo_documento" }
  const { caminho, erro: erroArq } = await lerDocumento(fd)
  if (erroArq) return { erro: erroArq }
  const dados = lerDados(fd)
  // sigilo.sigilo undefined = PDF e resumo acima do nível de quem edita: o
  // resumo não veio no formulário e não pode ser apagado.
  const { erro } = await atualizarAta(id, {
    ...dados,
    resumo: sigilo.sigilo === undefined ? undefined : dados.resumo,
    documento_url: caminho,
    sigilo_documento: sigilo.sigilo,
  })
  if (erro) return { erro }
  // Só entram se a ata ainda não tem deliberações (ver registrarDeliberacoesLidas).
  await registrarDeliberacoesLidas(id, lerDeliberacoesLidas(fd), sessao.usuario.id)
  revalidar(id, dados.mandato_id ?? undefined)
  redirect(`/painel/institucional/atas/${id}?salvo=1`)
}

export async function excluirAtaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("diretoria_reunioes")
  const id = texto(fd, "ata_id")
  const mandatoId = texto(fd, "mandato_id")
  const { erro } = await excluirAta(id)
  if (erro) return { erro }
  revalidar(undefined, mandatoId || undefined)
  redirect(
    mandatoId
      ? `/painel/institucional/diretoria/${mandatoId}?ata_excluida=1`
      : "/painel/institucional/atas?excluida=1"
  )
}
