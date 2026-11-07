"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import type { ComprovanteLido, Sugestao } from "@/lib/comprovantes-casamento"
import {
  candidataPorCodigo,
  lerArquivoDeComprovantes,
  ordensSemComprovante,
  resumoDaOrdem,
  sugestoesPara,
  vincularComprovante,
  type OrdemResumo,
  type Vinculo,
} from "@/lib/db/comprovantes-distribuicao"

export type ItemLido = {
  chave: string
  caminho: string
  nomeArquivo: string
  totalPaginas: number
  lido: ComprovanteLido
  sugestoes: Sugestao[]
}

export type ResultadoLeitura = {
  erro?: string
  avisos?: string[]
  itens?: ItemLido[]
  /** Ordens citadas nas sugestões, para a tela mostrar. */
  ordens?: Record<string, OrdemResumo>
}

/** Lê um arquivo (a tela chama uma vez por arquivo) e sugere as ordens. */
export async function lerComprovantesAction(formData: FormData): Promise<ResultadoLeitura> {
  await requirePermissao("financeiro_pagamento")
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione o arquivo." }
  const [lido, candidatas] = await Promise.all([lerArquivoDeComprovantes(arquivo), ordensSemComprovante()])
  if ("erro" in lido) return { erro: lido.erro }
  if (lido.comprovantes.length === 0) {
    return { erro: `${lido.nome}: nenhum comprovante de pagamento encontrado.`, avisos: lido.avisos }
  }
  const sugestoes = sugestoesPara(lido.comprovantes, candidatas)
  const porId = new Map(candidatas.map((c) => [c.id, c]))
  const ordens: Record<string, OrdemResumo> = {}
  for (const s of sugestoes.flat()) {
    const c = porId.get(s.ordemId)
    if (c) ordens[c.id] = resumoDaOrdem(c)
  }
  return {
    avisos: lido.avisos.map((a) => `${lido.nome}: ${a}`),
    itens: lido.comprovantes.map((c, i) => ({
      chave: `${lido.caminho}#${i}`,
      caminho: lido.caminho,
      nomeArquivo: lido.nome,
      totalPaginas: lido.totalPaginas,
      lido: c,
      sugestoes: sugestoes[i],
    })),
    ordens,
  }
}

/** Busca manual pelo código, quando a sugestão não acertou. */
export async function buscarOrdemAction(codigo: string): Promise<{ erro?: string; ordem?: OrdemResumo }> {
  await requirePermissao("financeiro_pagamento")
  if (!codigo.trim()) return { erro: "Informe o código da ordem." }
  const r = await candidataPorCodigo(codigo)
  return "erro" in r ? { erro: r.erro } : { ordem: resumoDaOrdem(r) }
}

export type ResultadoVinculo = { chave: string; ok: boolean; pagou?: boolean; erro?: string }

/** Confirma os vínculos (um ou vários), um a um; cada um pode recusar sozinho. */
export async function vincularComprovantesAction(
  vinculos: (Vinculo & { chave: string })[],
  centroReceitaId: string | null
): Promise<ResultadoVinculo[]> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const resultados: ResultadoVinculo[] = []
  const usadas = new Set<string>()
  for (const v of vinculos.slice(0, 100)) {
    if (usadas.has(v.ordemId)) {
      resultados.push({ chave: v.chave, ok: false, erro: "a mesma ordem foi escolhida para outro comprovante." })
      continue
    }
    usadas.add(v.ordemId)
    const r = await vincularComprovante(v, { centroReceitaId: centroReceitaId || null, usuarioId: sessao.usuario.id })
    resultados.push({ chave: v.chave, ok: !r.erro, pagou: r.pagou, erro: r.erro })
    if (!r.erro) revalidatePath(`/painel/financeiro/ordens/${v.ordemId}`)
  }
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/financeiro")
  return resultados
}
