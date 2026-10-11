import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { convidarParaAvaliar, tenantsComHotel } from "@/lib/db/hospedagem-avaliacoes"
import { lembretesNaoComparecimento, lembretesOfertasDeVaga } from "@/lib/db/hospedagem-garantida"
import { createServiceClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

type Resultado = {
  tenant: string
  criadas: number
  convites: number
  lembretes: number
  /** Avisos de não comparecimento (achado A21). */
  faltas: number
  /** Lembretes de oferta da lista de espera perto de vencer (achado A102). */
  ofertas: number
  erro?: string
}

/**
 * Tick diário da hospedagem. Protegido por `CRON_SECRET` (header
 * `x-cron-secret` ou `Authorization: Bearer`), igual aos outros ticks.
 *
 * Para cada entidade com hotel:
 *  - AVALIAÇÃO: abre as pendências das estadias concluídas (check-out até
 *    ontem), manda o CONVITE com as 5 estrelas e, depois de alguns dias sem
 *    resposta, um LEMBRETE — uma vez cada (ver lib/db/hospedagem-avaliacoes.ts);
 *  - NÃO COMPARECIMENTO: avisa quem teve a falta registrada, com o caminho
 *    do abono — uma vez por reserva;
 *  - LISTA DE ESPERA: lembra a vaga guardada perto de vencer — uma vez por
 *    oferta. Rodando 1x por dia, só alcança as ofertas que vencem depois do
 *    tick (ver `lembretesOfertasDeVaga`).
 * Os avisos rodam sem requisição: client de serviço, entidade e identidade
 * do e-mail vão explícitos. Uma etapa que falha não impede as outras.
 *
 * `?tenant=<uuid>` roda uma entidade só (disparo manual e testes na demo).
 */
async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const enviado =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    ""
  if (!secret || enviado !== secret) {
    return new Response("Não autorizado", { status: 401 })
  }

  const unico = new URL(req.url).searchParams.get("tenant")
  const tenants = (await tenantsComHotel()).filter((t) => !unico || t === unico)
  const svc = createServiceClient()
  const resultados: Resultado[] = []
  for (const tenantId of tenants) {
    const r: Resultado = { tenant: tenantId, criadas: 0, convites: 0, lembretes: 0, faltas: 0, ofertas: 0 }
    const erros: string[] = []
    try {
      const a = await convidarParaAvaliar(tenantId)
      r.criadas = a.criadas
      r.convites = a.convites
      r.lembretes = a.lembretes
      if (a.erro) erros.push(`avaliação: ${a.erro}`)
    } catch (e) {
      erros.push(`avaliação: ${e instanceof Error ? e.message : String(e)}`)
    }
    try {
      const contexto = await contextoDoTenant(tenantId, svc)
      const amb = { client: svc, tenantId, contexto }
      // allSettled: uma etapa que lança não apaga a contagem da outra.
      const [faltas, ofertas] = await Promise.allSettled([
        lembretesNaoComparecimento(amb),
        lembretesOfertasDeVaga(amb),
      ])
      const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e))
      if (faltas.status === "fulfilled") {
        r.faltas = faltas.value.avisados
        if (faltas.value.erro) erros.push(`não comparecimento: ${faltas.value.erro}`)
      } else {
        erros.push(`não comparecimento: ${motivo(faltas.reason)}`)
      }
      if (ofertas.status === "fulfilled") {
        r.ofertas = ofertas.value.avisados
        if (ofertas.value.erro) erros.push(`lista de espera: ${ofertas.value.erro}`)
      } else {
        erros.push(`lista de espera: ${motivo(ofertas.reason)}`)
      }
    } catch (e) {
      erros.push(`avisos: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (erros.length) r.erro = erros.join(" · ")
    if (r.criadas || r.convites || r.lembretes || r.faltas || r.ofertas || r.erro) resultados.push(r)
  }
  return Response.json({ verificados: tenants.length, processados: resultados })
}

export const GET = handler
export const POST = handler
