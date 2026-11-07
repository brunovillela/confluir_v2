import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { listarDeliberacoes } from "@/lib/db/deliberacoes"
import { CHAVES_DELIBERACOES, nivelSigilo, sigilosVisiveis } from "@/lib/deliberacoes-constantes"
import { registrarExportacao } from "@/lib/exportacoes"
import { podeAcessar } from "@/lib/permissoes"
import { planilhaXlsx, respostaXlsx } from "@/lib/xlsx"

import { COLUNAS_DELIBERACOES } from "../colunas"
import { lerFiltrosDeliberacoes } from "../filtros"

/** Deliberações em XLSX, com os filtros da tela e só até o nível de sigilo de quem exporta. */
export async function GET(request: NextRequest): Promise<Response> {
  const sessao = await getSessaoPainel()
  const [primeira, ...outras] = CHAVES_DELIBERACOES
  if (!sessao || !podeAcessar(sessao.permissoes, primeira, outras)) {
    return new Response("Sem acesso", { status: 403 })
  }
  const sigilos = sigilosVisiveis(nivelSigilo(sessao.permissoes))
  const sp = new URL(request.url).searchParams
  const filtros = lerFiltrosDeliberacoes(Object.fromEntries(sp), sigilos, sessao.usuario.id, hojeSP())
  const linhas = await listarDeliberacoes(filtros, sigilos)

  await registrarExportacao(request, {
    usuarioId: sessao.usuario.id,
    recurso: "deliberacoes",
    formato: "xlsx",
    quantidade: linhas.length,
  })
  return respostaXlsx("deliberacoes", planilhaXlsx("Deliberações", COLUNAS_DELIBERACOES, linhas))
}
