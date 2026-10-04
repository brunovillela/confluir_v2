import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { listarCategoriasContrato, listarContratos } from "@/lib/db/contratos"
import { SITUACOES_CONTRATO, TIPOS_CONTRATO_MARCAVEIS, type SituacaoContrato } from "@/lib/contratos-constantes"
import { podeAcessar } from "@/lib/permissoes"
import { dataXlsx, planilhaXlsx, respostaXlsx } from "@/lib/xlsx"

const ROTULO_VIGENCIA: Record<string, string> = {
  vencido: "Vencido",
  vencendo: "Vencendo",
  vigente: "Vigente",
  sem_termo: "Sem término",
}

/** Contratos em XLSX, com os filtros da tela (I8). Ajudas institucionais ficam fora, como na tela. */
export async function GET(request: NextRequest): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "aquisicoes_contratos", ["aquisicoes_contratos_edicao"])) {
    return new Response("Sem acesso", { status: 403 })
  }
  const podeEditar = podeAcessar(sessao.permissoes, "aquisicoes_contratos_edicao")
  const sp = new URL(request.url).searchParams
  const situacao = (SITUACOES_CONTRATO as readonly string[]).includes(sp.get("situacao") ?? "")
    ? (sp.get("situacao") as SituacaoContrato)
    : "todos"
  const tipo = TIPOS_CONTRATO_MARCAVEIS.some((t) => t.chave === sp.get("tipo")) ? (sp.get("tipo") as string) : ""
  const categorias = (await listarCategoriasContrato()).filter((c) => podeEditar || !c.sigiloso)
  const categoria = categorias.some((c) => c.id === sp.get("categoria")) ? (sp.get("categoria") as string) : ""

  const linhas = await listarContratos({
    busca: (sp.get("busca") ?? "").trim(),
    situacao,
    tipo,
    categoriaId: categoria || undefined,
    verSigilosos: podeEditar,
    apoioInstitucional: false,
  })

  const bytes = planilhaXlsx("Contratos", [
    { titulo: "Código", valor: (c) => c.codigo, largura: 22 },
    { titulo: "Objeto", valor: (c) => c.objeto, largura: 60 },
    { titulo: "Fornecedor", valor: (c) => c.fornecedorNome, largura: 36 },
    { titulo: "Departamento", valor: (c) => c.departamentoNome },
    { titulo: "Categoria", valor: (c) => c.categoriaNome },
    { titulo: "Valor", valor: (c) => c.valor },
    { titulo: "Início", valor: (c) => dataXlsx(c.vigencia_inicio) },
    { titulo: "Término", valor: (c) => dataXlsx(c.vigencia_termino) },
    { titulo: "Vigência", valor: (c) => ROTULO_VIGENCIA[String(c.vigencia)] ?? String(c.vigencia) },
    { titulo: "Aditivo", valor: (c) => (c.aditivo ? "Sim" : "Não"), largura: 10 },
    { titulo: "Sob demanda", valor: (c) => (c.sob_demanda ? "Sim" : "Não"), largura: 12 },
  ], linhas)
  return respostaXlsx("contratos", bytes)
}
