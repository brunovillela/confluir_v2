import { rotaApi } from "@/lib/api-publica"
import { listarEventos, type SituacaoEvento } from "@/lib/db/eventos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/v1/eventos?situacao= — eventos da entidade. */
export const GET = rotaApi("eventos", async (req) => {
  const situacao = new URL(req.url).searchParams.get("situacao")
  const { eventos } = await listarEventos({ situacao: (situacao || "todos") as SituacaoEvento | "todos" })
  return {
    quantidade: eventos.length,
    corpo: {
      linhas: eventos.map((e) => {
        const r = e as unknown as Record<string, unknown>
        return {
          id: r.id,
          titulo: r.titulo,
          situacao: r.situacao,
          inicio: r.inicio ?? null,
          termino: r.termino ?? null,
          local: r.local ?? null,
          inscricoesAbremEm: r.inscricoes_abrem_em ?? null,
          inscricoesFechamEm: r.inscricoes_fecham_em ?? null,
          limiteInscricoes: r.limite_inscricoes ?? null,
        }
      }),
    },
  }
})
