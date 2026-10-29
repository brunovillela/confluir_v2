"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { padronizarLinha, type LinhaLista } from "@/lib/atualizacao-lista"
import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  aplicarLote,
  cadastrarNaoEncontrados,
  type Descartada,
  descartarRascunho,
  desfazerLote,
  montarRascunho,
} from "@/lib/db/filiacao-atualizacao-lista"
import { lerListaTrabalhadores, MAX_LINHAS_LISTA } from "@/lib/ia-lista-trabalhadores"

/** Atualização de cadastros por lista de trabalhadores — só a gestão da filiação. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BASE = "/painel/filiados/saude-cadastros/atualizar"

export async function lerListaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha o arquivo da lista (planilha, CSV, PDF ou imagem)." }
  }
  // O envio por server action tem teto de 4 MB (next.config: bodySizeLimit).
  if (arquivo.size > 4 * 1024 * 1024) return { erro: "Arquivo grande demais — máximo de 4 MB. Divida a lista ou reduza a imagem." }
  const fonte = String(formData.get("fonte_id") ?? "")
  const fonteId = UUID.test(fonte) ? fonte : null

  const leitura = await lerListaTrabalhadores(arquivo)
  if (leitura.erro || !leitura.linhas) return { erro: leitura.erro ?? "Falha na leitura." }
  if (leitura.linhas.length === 0) return { erro: "A IA não encontrou trabalhadores neste arquivo." }
  if (leitura.linhas.length > MAX_LINHAS_LISTA) {
    return { erro: `Lista grande demais (${leitura.linhas.length} trabalhadores). Divida em arquivos de até ${MAX_LINHAS_LISTA}.` }
  }

  const linhas: LinhaLista[] = []
  const descartadas: Descartada[] = []
  const invalidos = new Map<string, number>()
  leitura.linhas.forEach((bruta, i) => {
    const l = padronizarLinha(bruta, i + 1)
    if (!l) {
      descartadas.push({ linha: i + 1, nome: String(bruta.nome ?? "").trim() || null, motivo: "Sem CPF válido, matrícula ou nome." })
      return
    }
    for (const c of l.invalidos) invalidos.set(c, (invalidos.get(c) ?? 0) + 1)
    linhas.push(l)
  })
  const avisos = [...(leitura.avisos ?? [])]
  if (invalidos.size) {
    avisos.push(
      `Valores ignorados por estarem fora do padrão: ${[...invalidos].map(([c, n]) => `${c} (${n})`).join(", ")}. O resto da linha foi aproveitado.`
    )
  }

  const { loteId, erro } = await montarRascunho({
    fonteId,
    arquivo: arquivo.name,
    linhas,
    descartadas,
    avisos,
    linhasLidas: leitura.linhas.length,
    usuario: { id: sessao.usuario.id, nome: sessao.usuario.nome_completo ?? sessao.usuario.email ?? null },
  })
  if (erro || !loteId) return { erro: erro ?? "Falha ao montar a prévia." }
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
