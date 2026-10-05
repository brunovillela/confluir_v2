import { autenticarRequisicaoApi, paginaDe, respostaApi } from "@/lib/api-publica"
import { listarFiliados, type FiltrosFiliados } from "@/lib/db/filiados"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/v1/filiados?situacao=&condicao=&busca=&pagina= */
export async function GET(req: Request): Promise<Response> {
  const auth = await autenticarRequisicaoApi(req)
  if (!auth.ok) return auth.resposta
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
  const lista = await listarFiliados(filtros)
  return respostaApi({
    linhas: lista.linhas.map((f) => ({
      id: f.id,
      nome: f.nome_completo,
      cpf: f.cpf,
      matricula: f.matricula_sindical,
      lotacao: f.filiacao_lotacao,
      condicao: f.filiacao_condicao,
      excluida: f.filiacao_excluida === true,
      cadastradoEm: f.created_at,
    })),
    total: lista.total,
    pagina: lista.pagina,
    totalPaginas: lista.totalPaginas,
  })
}
