import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { panoramaFornecedores } from "@/lib/db/fornecedores-indicadores"
import { podeAcessar } from "@/lib/permissoes"
import { dataXlsx, planilhaXlsx, respostaXlsx } from "@/lib/xlsx"

import { filtrar, NATUREZAS, ORDENS, ordenar, PROBLEMAS, SITUACOES, type Filtros, type Ordem } from "../filtros"

/** Lista de fornecedores em XLSX, com os filtros e a ordem da tela (I8). */
export async function GET(request: NextRequest): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "aquisicoes_fornecedores", ["aquisicoes_compras_edicao"])) {
    return new Response("Sem acesso", { status: 403 })
  }
  const sp = Object.fromEntries(new URL(request.url).searchParams.entries())
  const f: Filtros = {
    busca: (sp.busca ?? "").trim(),
    situacao: SITUACOES.some((x) => x.valor === sp.situacao) ? sp.situacao : "ativos",
    natureza: NATUREZAS.some((x) => x.valor === sp.natureza) ? sp.natureza : "todas",
    problema: PROBLEMAS.some((x) => x.valor === sp.problema) ? sp.problema : "todos",
    ordem: (ORDENS as readonly string[]).includes(sp.ordem ?? "") ? (sp.ordem as Ordem) : "nome",
    dir: sp.dir === "desc" ? "desc" : "asc",
    pagina: 1,
    porPagina: 0,
  }
  const linhas = ordenar(filtrar(await panoramaFornecedores(), f), f)
  const bytes = planilhaXlsx("Fornecedores", [
    { titulo: "Nome", valor: (l) => l.nome, largura: 36 },
    { titulo: "Razão social", valor: (l) => l.nome_razao, largura: 36 },
    { titulo: "CPF/CNPJ", valor: (l) => l.cnpj_cpf },
    { titulo: "Natureza", valor: (l) => (l.apoiada ? "Entidade apoiada" : l.pessoa_juridica ? "Pessoa jurídica" : "Pessoa física") },
    { titulo: "Situação", valor: (l) => (l.inativa ? "Inativo" : l.bloqueado ? "Bloqueado" : "Ativo") },
    { titulo: "Pago (12 meses)", valor: (l) => l.pago12m },
    { titulo: "Ordens", valor: (l) => l.ordens },
    { titulo: "Última ordem", valor: (l) => dataXlsx(l.ultimaOrdem) },
    { titulo: "Cadastro", valor: (l) => dataXlsx(l.created_at) },
    { titulo: "Problemas", valor: (l) => l.problemas.map((p) => p.codigo).join(", "), largura: 40 },
  ], linhas)
  return respostaXlsx("fornecedores", bytes)
}
