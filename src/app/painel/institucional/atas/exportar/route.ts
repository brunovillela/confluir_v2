import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { ROTULO_TIPO_REUNIAO, TIPOS_REUNIAO, type TipoReuniao } from "@/lib/atas-constantes"
import { listarAtasParaPlanilha, type AtaPlanilha } from "@/lib/db/atas"
import { listarDeliberacoes } from "@/lib/db/deliberacoes"
import { nivelSigilo, ROTULO_SIGILO_DELIBERACAO, sigilosVisiveis } from "@/lib/deliberacoes-constantes"
import { registrarExportacao } from "@/lib/exportacoes"
import { podeAcessar } from "@/lib/permissoes"
import { dataXlsx, planilhaXlsxAbas, respostaXlsx, type AbaXlsx, type ColunaXlsx } from "@/lib/xlsx"

import { COLUNAS_DELIBERACOES } from "../../deliberacoes/colunas"

const COLUNAS_ATAS: ColunaXlsx<AtaPlanilha>[] = [
  { titulo: "Nº", valor: (a) => a.numero, largura: 10 },
  { titulo: "Data", valor: (a) => dataXlsx(a.data), largura: 12 },
  { titulo: "Hora", valor: (a) => a.hora, largura: 10 },
  { titulo: "Título", valor: (a) => a.titulo, largura: 40 },
  { titulo: "Tipo", valor: (a) => (a.tipo === "outra" && a.orgao ? a.orgao : ROTULO_TIPO_REUNIAO[a.tipo]) },
  { titulo: "Mandato", valor: (a) => a.mandatoNome, largura: 22 },
  { titulo: "Local", valor: (a) => a.local, largura: 24 },
  { titulo: "Sigilo da ata", valor: (a) => ROTULO_SIGILO_DELIBERACAO[a.sigilo], largura: 12 },
  { titulo: "Pauta", valor: (a) => a.pauta, largura: 50 },
  { titulo: "Resumo", valor: (a) => a.resumo, largura: 60 },
  { titulo: "Presentes", valor: (a) => a.presentes, largura: 40 },
  { titulo: "Observações", valor: (a) => a.observacoes, largura: 40 },
  { titulo: "PDF anexado", valor: (a) => (a.temPdf ? "Sim" : "Não"), largura: 12 },
]

/**
 * Atas em XLSX, com os filtros da tela: aba Atas (textos acima do nível de
 * sigilo de quem exporta saem como "(sob sigilo)") e aba Deliberações (as
 * dessas atas, só até o nível).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "diretoria_reunioes", ["diretoria_atas_consulta"])) {
    return new Response("Sem acesso", { status: 403 })
  }
  const sigilos = sigilosVisiveis(nivelSigilo(sessao.permissoes))
  const sp = new URL(request.url).searchParams
  const tipo = TIPOS_REUNIAO.some((t) => t.chave === sp.get("tipo")) ? (sp.get("tipo") as TipoReuniao) : "todos"
  const atas = await listarAtasParaPlanilha(
    { tipo, mandatoId: sp.get("mandato") || undefined, busca: (sp.get("busca") ?? "").trim() },
    sigilos
  )
  const ids = new Set(atas.map((a) => a.id))
  const deliberacoes = (await listarDeliberacoes({}, sigilos)).filter((d) => ids.has(d.ataId))

  await registrarExportacao(request, {
    usuarioId: sessao.usuario.id,
    recurso: "atas",
    formato: "xlsx",
    quantidade: atas.length,
  })
  const abas = [
    { aba: "Atas", colunas: COLUNAS_ATAS, linhas: atas },
    { aba: "Deliberações", colunas: COLUNAS_DELIBERACOES, linhas: deliberacoes },
  ] as AbaXlsx<unknown>[]
  return respostaXlsx("atas", planilhaXlsxAbas(abas))
}
