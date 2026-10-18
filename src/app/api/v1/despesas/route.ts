import { periodoContabil } from "@/app/painel/financeiro/contabil/periodo"
import { rotaApi } from "@/lib/api-publica"
import { lancamentosContabeis } from "@/lib/db/contabil"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/v1/despesas?de=AAAA-MM-DD&ate=AAAA-MM-DD — ordens pagas no período (igual à exportação contábil). */
export const GET = rotaApi("despesas", async (req) => {
  const sp = new URL(req.url).searchParams
  const { de, ate } = periodoContabil(sp.get("de"), sp.get("ate"))
  const l = await lancamentosContabeis(de, ate)
  return { quantidade: l.despesas.length, corpo: { de, ate, total: l.totalDespesas, linhas: l.despesas } }
})
