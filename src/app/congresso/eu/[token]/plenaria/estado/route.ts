import { obterCongresso } from "@/lib/db/congressos"
import { estadoDaPlenaria, participanteDoLink } from "@/lib/db/congressos-ao-vivo"
import { tenantAtual } from "@/lib/tenant"

/**
 * Estado da plenária para o celular do participante (consulta a cada poucos
 * segundos). O link e o estado vêm de cache curto, então quase nenhuma
 * consulta chega ao banco. Sem dado de voto de ninguém.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const tenantId = await tenantAtual()
  const p = await participanteDoLink(token, tenantId)
  if (!p) return Response.json({ erro: "Link inválido." }, { status: 404 })
  const c = await obterCongressoEmCache(p.congressoId)
  if (!c) return Response.json({ erro: "Congresso não encontrado." }, { status: 404 })
  const e = await estadoDaPlenaria(c, tenantId)
  const minha = e.fila.findIndex((f) => f.participanteId === p.id)
  return Response.json(
    {
      agora: Date.now(),
      sessao: e.sessao,
      assunto: e.assunto,
      inscricoesAbertas: e.inscricoesAbertas,
      votacao: e.votacao && {
        id: e.votacao.id,
        titulo: e.votacao.titulo,
        tipo: e.votacao.tipo,
        sigilo: e.votacao.sigilo,
        itens: e.votacao.itens,
        maximoEscolhas: e.votacao.maximoEscolhas,
        aberta: !e.votacao.fechadaEm,
        votaram: e.votacao.votaram,
        baseVotantes: e.votacao.baseVotantes,
        resultado: e.votacao.resultado,
      },
      parcial: e.parcial,
      falando: e.falando && { id: e.falando.id, nome: e.falando.nome, tipo: e.falando.tipo, segundos: e.falando.segundos, inicioEm: e.falando.inicioEm, pausadaEm: e.falando.pausadaEm, pausadoMs: e.falando.pausadoMs },
      fila: e.fila.map((f) => ({ id: f.id, nome: f.nome, tipo: f.tipo, minha: f.participanteId === p.id })),
      minhaPosicao: minha >= 0 ? minha + 1 : null,
    },
    { headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" } }
  )
}

// O congresso muda pouco durante a plenária: 30 s por instância.
const congressos = new Map<string, { ate: number; c: Promise<Awaited<ReturnType<typeof obterCongresso>>> }>()
function obterCongressoEmCache(id: string) {
  const e = congressos.get(id)
  if (e && e.ate > Date.now()) return e.c
  const c = obterCongresso(id)
  congressos.set(id, { ate: Date.now() + 30_000, c })
  return c
}
