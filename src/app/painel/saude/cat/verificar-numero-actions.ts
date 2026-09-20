"use server"

import { requirePermissao } from "@/lib/auth"
import type { ClassificacaoCat } from "@/lib/cat-classificacao"
import { classificarCat } from "@/lib/db/cat-duplicidades"
import { buscarCat } from "@/lib/db/saude"
import { CAMPOS_CAT, CAMPOS_DO_ACIDENTE, nomeCampo, valoresDoRegistro } from "@/lib/saude-campos"

export type EstadoVerificacaoNumero = {
  numero?: string
  classificacao?: ClassificacaoCat
  /** Valores para abrir o formulário: o número e, numa atualização, o acidente da CAT de origem. */
  valores?: Record<string, string>
  erro?: string
}

const CAMPO_NUMERO = nomeCampo(CAMPOS_CAT.find((c) => c.n === 5)!)

/**
 * Antes da digitação completa: o número já está na base? Evita digitar de
 * novo uma CAT já lançada, e numa reabertura/óbito (mesmo número-base, outra
 * sequência) já traz os dados do acidente da CAT de origem.
 */
export async function verificarNumeroCatAction(
  _prev: EstadoVerificacaoNumero,
  formData: FormData
): Promise<EstadoVerificacaoNumero> {
  await requirePermissao("saude_cat", ["saude_gestao"])
  const numero = String(formData.get("numero") ?? "").trim()
  if (numero.replace(/\D/g, "").length < 5) {
    return { erro: "Informe o número da CAT (como está no formulário, ex.: 2023.625358-1/01)." }
  }

  const { disponivel, ...classificacao } = await classificarCat({ numero_cat: numero }, { soNumero: true })
  if (!disponivel) return { erro: "A verificação ainda não está disponível — rode supabase/saude-cat-duplicidades.sql." }

  const valores: Record<string, string> = { [CAMPO_NUMERO]: numero }
  if (classificacao.classe === "atualizacao" && classificacao.origemId) {
    const origem = (await buscarCat(classificacao.origemId)) as Record<string, unknown> | null
    if (origem) {
      const daOrigem = valoresDoRegistro(origem)
      for (const campo of CAMPOS_CAT.filter((c) => CAMPOS_DO_ACIDENTE.includes(c.n))) {
        const nome = nomeCampo(campo)
        if (daOrigem[nome]) valores[nome] = daOrigem[nome]
      }
    }
  }
  return { numero, classificacao, valores }
}
