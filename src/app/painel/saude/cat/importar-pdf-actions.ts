"use server"

import { requirePermissao } from "@/lib/auth"
import { lerCatDoPdf } from "@/lib/cat-leitura-ia"
import type { ClassificacaoCat } from "@/lib/cat-classificacao"
import { classificarCat, type EntradaCat } from "@/lib/db/cat-duplicidades"
import { buscarCat, type RegistroCat } from "@/lib/db/saude"
import {
  CAMPOS_CAT,
  nomeCampo,
  valorParaColunas,
  valoresDoRegistro,
} from "@/lib/saude-campos"

export type EstadoExtracaoCat = {
  valores?: Record<string, string>
  avisos?: string[]
  erro?: string
  /** Nova, já lançada, atualização ou possível duplicidade. */
  classificacao?: ClassificacaoCat
  /**
   * CAT já lançada: os valores dela completados pelo PDF, para atualizar a
   * existente em vez de lançar de novo — e os campos em que o PDF difere.
   */
  existente?: { id: string; numero: string | null; valores: Record<string, string>; diferentes: string[] }
}

export async function extrairCatDePdf(
  _prev: EstadoExtracaoCat,
  formData: FormData
): Promise<EstadoExtracaoCat> {
  await requirePermissao("saude_cat", ["saude_gestao"])

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione um arquivo PDF." }
  }
  if (arquivo.type && arquivo.type !== "application/pdf") {
    return { erro: "Envie um arquivo PDF." }
  }

  const leitura = await lerCatDoPdf(new Uint8Array(await arquivo.arrayBuffer()))
  if (leitura.erro !== undefined) return { erro: leitura.erro }
  const { valores, avisos } = leitura

  // Compara com a base: a CAT já foi lançada? É reabertura/óbito de outra?
  let registro: RegistroCat = {}
  for (const campo of CAMPOS_CAT) {
    registro = { ...registro, ...valorParaColunas(campo, valores[nomeCampo(campo)] ?? "") }
  }
  const { disponivel, ...classificacao } = await classificarCat(registro as EntradaCat)

  let existente: EstadoExtracaoCat["existente"]
  if (disponivel && classificacao.classe === "duplicada" && classificacao.relacionadas.length === 1) {
    const alvo = classificacao.relacionadas[0]
    const cat = (await buscarCat(alvo.id)) as Record<string, unknown> | null
    if (cat) {
      const naBase = valoresDoRegistro(cat)
      const juntos: Record<string, string> = { ...naBase }
      const diferentes: string[] = []
      for (const campo of CAMPOS_CAT) {
        const nome = nomeCampo(campo)
        const doPdf = valores[nome]
        if (!doPdf) continue
        if (naBase[nome] && naBase[nome] !== doPdf) diferentes.push(`${campo.n} — ${campo.rotulo}`)
        juntos[nome] = doPdf
      }
      existente = { id: alvo.id, numero: alvo.numero, valores: juntos, diferentes }
    }
  }

  return {
    valores,
    avisos: avisos.length ? avisos : undefined,
    classificacao: disponivel ? classificacao : undefined,
    existente,
  }
}
