import { paginaDe, rotaApi } from "@/lib/api-publica"
import { listarFiliados, type FiltrosFiliados } from "@/lib/db/filiados"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/v1/filiados?situacao=&condicao=&busca=&pagina=
 * O CPF só sai com o escopo "filiados_cpf" (achado M6 da RIPD); sem ele, nulo.
 */
export const GET = rotaApi("filiados", async (req, auth) => {
  const sp = new URL(req.url).searchParams
  const situacao = sp.get("situacao")
  const filtros: FiltrosFiliados = {
    situacao: situacao === "todas" || situacao === "excluidas" ? situacao : "ativas",
    condicao: sp.get("condicao") || "todas",
    busca: sp.get("busca") ?? "",
    pagina: paginaDe(req),
    ordem: "nome",
    dir: "asc",
  }
  const comCpf = auth.chave.escopos.includes("filiados_cpf")
  const lista = await listarFiliados(filtros)
  return {
    quantidade: lista.linhas.length,
    corpo: {
      linhas: lista.linhas.map((f) => ({
        id: f.id,
        nome: f.nome_completo,
        cpf: comCpf ? f.cpf : null,
        matricula: f.matricula_sindical,
        lotacao: f.filiacao_lotacao,
        condicao: f.filiacao_condicao,
        excluida: f.filiacao_excluida === true,
        cadastradoEm: f.created_at,
      })),
      total: lista.total,
      pagina: lista.pagina,
      totalPaginas: lista.totalPaginas,
    },
  }
})
