import { autenticarRequisicaoApi, respostaApi } from "@/lib/api-publica"
import { obterOrganizacao } from "@/lib/db/organizacao"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/v1/eu — quem é a chave. */
export async function GET(req: Request): Promise<Response> {
  const auth = await autenticarRequisicaoApi(req)
  if (!auth.ok) return auth.resposta
  const org = await obterOrganizacao()
  return respostaApi({
    entidade: { id: auth.emp, nome: org?.nomeFantasia ?? org?.nomeRazao ?? null },
    chave: auth.chave,
  })
}
