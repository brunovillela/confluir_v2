import { autenticarRequisicaoApi, respostaApi } from "@/lib/api-publica"
import { listarEventos } from "@/lib/db/agenda"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/v1/agenda — compromissos futuros. */
export async function GET(req: Request): Promise<Response> {
  const auth = await autenticarRequisicaoApi(req)
  if (!auth.ok) return auth.resposta
  const linhas = await listarEventos({ quando: "futuros" })
  return respostaApi({
    linhas: linhas.map((e) => ({ id: e.id, atividade: e.atividade, tipo: e.tipo, inicio: e.inicio, termino: e.termino, diaTodo: e.diaTodo, local: e.local, sede: e.sedeNome, departamento: e.departamentoNome })),
  })
}
