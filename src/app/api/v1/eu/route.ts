import { rotaApi } from "@/lib/api-publica"
import { obterOrganizacao } from "@/lib/db/organizacao"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/v1/eu — quem é a chave (não exige escopo). */
export const GET = rotaApi(null, async (_req, auth) => {
  const org = await obterOrganizacao()
  return {
    corpo: {
      entidade: { id: auth.emp, nome: org?.nomeFantasia ?? org?.nomeRazao ?? null },
      chave: auth.chave,
    },
  }
})
