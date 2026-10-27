"use server"

import { requirePermissao } from "@/lib/auth"
import {
  ALTERNATIVAS_CAT,
  lerEClassificar,
  PERMISSAO_CAT,
  validarPdf,
  type EstadoExtracaoCat,
} from "@/lib/cat-pdf-lote"

// O lote de PDFs (vários de uma vez, registro sem conferência) passa pela
// rota /api/painel/saude/cat-pdf, não por server action — ver lib/cat-pdf-lote.ts.

export async function extrairCatDePdf(
  _prev: EstadoExtracaoCat,
  formData: FormData
): Promise<EstadoExtracaoCat> {
  await requirePermissao(PERMISSAO_CAT, ALTERNATIVAS_CAT)
  const arquivo = validarPdf(formData.get("arquivo"))
  if (typeof arquivo === "string") return { erro: arquivo }
  return lerEClassificar(arquivo)
}
