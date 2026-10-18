import { rotaApi } from "@/lib/api-publica"
import { serieArrecadacao } from "@/lib/db/analitica"
import { texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/v1/arrecadacao?meses=12 — arrecadação mensal por tipo e fonte (camada analítica). */
export const GET = rotaApi("arrecadacao", async (req) => {
  const meses = Math.min(60, Math.max(1, Number(new URL(req.url).searchParams.get("meses") ?? "12") || 12))
  const serie = await serieArrecadacao(meses)
  if (!serie.disponivel) return { status: 503, corpo: { erro: "Camada analítica não disponível nesta entidade." } }
  const fonteIds = [...new Set(serie.linhas.map((l) => l.fonteId).filter((v): v is string => !!v))]
  const nomes = new Map<string, string | null>()
  if (fonteIds.length) {
    const admin = await createAdminClient()
    for (let i = 0; i < fonteIds.length; i += 200) {
      const { data } = await admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", fonteIds.slice(i, i + 200))
      for (const e of data ?? []) nomes.set(String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao))
    }
  }
  return {
    quantidade: serie.linhas.length,
    corpo: {
      meses,
      linhas: serie.linhas.map((l) => ({ mes: l.mes.slice(0, 7), tipo: l.tipo, fonteId: l.fonteId, fonte: l.fonteId ? (nomes.get(l.fonteId) ?? null) : null, valor: l.valor, lancamentos: l.lancamentos, pagantes: l.pagantes })),
    },
  }
})
