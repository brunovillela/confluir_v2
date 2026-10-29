"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { after } from "next/server"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  aplicarLote,
  cadastrarNaoEncontrados,
  criarEnvioLista,
  descartarRascunho,
  desfazerLote,
  iniciarLeitura,
  MAX_ARQUIVO_LISTA,
  processarLeitura,
} from "@/lib/db/filiacao-atualizacao-lista"

/** Atualização de cadastros por lista de trabalhadores — só a gestão da filiação. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BASE = "/painel/filiados/saude-cadastros/atualizar"

/** 1º passo do envio: URL assinada para o navegador subir o arquivo direto ao armazenamento. */
export async function prepararEnvioListaAction(
  nomeArquivo: string,
  tamanho: number
): Promise<{ caminho?: string; token?: string; erro?: string }> {
  await requirePermissao("filiacao_gestao")
  if (!(tamanho > 0)) return { erro: "Escolha o arquivo da lista (planilha, CSV, PDF ou imagem)." }
  if (tamanho > MAX_ARQUIVO_LISTA) return { erro: "Arquivo grande demais — até 25 MB. Divida a lista." }
  return criarEnvioLista(nomeArquivo)
}

/**
 * 2º passo: com o arquivo no armazenamento, cria o lote em 'lendo' e agenda a
 * leitura para depois da resposta — a tela do lote acompanha o andamento.
 */
export async function iniciarLeituraAction(entrada: {
  caminho: string
  arquivo: string
  fonteId: string
}): Promise<{ erro?: string }> {
  const sessao = await requirePermissao("filiacao_gestao")
  const { loteId, erro } = await iniciarLeitura({
    caminho: entrada.caminho,
    arquivo: entrada.arquivo,
    fonteId: UUID.test(entrada.fonteId) ? entrada.fonteId : null,
    usuario: { id: sessao.usuario.id, nome: sessao.usuario.nome_completo ?? sessao.usuario.email ?? null },
  })
  if (erro || !loteId) return { erro: erro ?? "Falha ao registrar a lista." }
  // Roda até o maxDuration da página (300 s), depois da resposta.
  after(() => processarLeitura(loteId))
  revalidatePath(BASE)
  redirect(`${BASE}/${loteId}`)
}

/** Recebe os seq marcados na prévia (JSON) e grava. */
export async function aplicarLoteAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")
  const loteId = String(formData.get("lote_id") ?? "")
  if (!UUID.test(loteId)) return { erro: "Lote inválido." }
  let seqs: number[] = []
  try {
    const bruto = JSON.parse(String(formData.get("seqs") ?? "[]"))
    if (Array.isArray(bruto)) seqs = bruto.filter((n): n is number => Number.isInteger(n) && n > 0)
  } catch {
    return { erro: "Seleção inválida." }
  }
  const { erro } = await aplicarLote(loteId, seqs, sessao.usuario.id)
  revalidatePath(`${BASE}/${loteId}`)
  revalidatePath("/painel/filiados")
  if (erro && !/Parte não/.test(erro)) return { erro }
  redirect(`${BASE}/${loteId}${erro ? "?parcial=1" : ""}`)
}

export async function desfazerLoteAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")
  const loteId = String(formData.get("lote_id") ?? "")
  if (!UUID.test(loteId)) return { erro: "Lote inválido." }
  const { erro } = await desfazerLote(loteId, sessao.usuario.id)
  revalidatePath(`${BASE}/${loteId}`)
  revalidatePath(BASE)
  revalidatePath("/painel/filiados")
  if (erro && !/Parte não/.test(erro)) return { erro }
  redirect(`${BASE}/${loteId}`)
}

export async function descartarRascunhoAction(formData: FormData): Promise<void> {
  await requirePermissao("filiacao_gestao")
  const loteId = String(formData.get("lote_id") ?? "")
  if (UUID.test(loteId)) await descartarRascunho(loteId)
  revalidatePath(BASE)
  redirect(BASE)
}

export type EstadoCadastroLista = EstadoForm & { criados?: number; reaproveitados?: number; erros?: string[] }

export async function cadastrarNaoEncontradosAction(
  _prev: EstadoCadastroLista,
  formData: FormData
): Promise<EstadoCadastroLista> {
  const sessao = await requirePermissao("filiacao_gestao")
  const loteId = String(formData.get("lote_id") ?? "")
  if (!UUID.test(loteId)) return { erro: "Lote inválido." }
  const linhas = formData
    .getAll("linha")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0)
  const condicao = String(formData.get("condicao") ?? "Ativo")
  const r = await cadastrarNaoEncontrados(loteId, linhas, condicao, sessao.usuario.id)
  if (r.erro) return { erro: r.erro }
  revalidatePath(`${BASE}/${loteId}`)
  revalidatePath("/painel/filiados")
  return {
    ok: `${r.criados} cadastrado(s)${r.reaproveitados ? `, ${r.reaproveitados} já tinham cadastro e ganharam o vínculo` : ""}.`,
    criados: r.criados,
    reaproveitados: r.reaproveitados,
    erros: r.erros,
  }
}
