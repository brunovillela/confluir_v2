import { rodarRepasseAutomatico, type ResultadoAutomatico } from "@/lib/db/repasse-automatico"
import { createServiceClient } from "@/lib/supabase/admin"
import { comTenant } from "@/lib/tenant-contexto"
import { origemDoTenant } from "@/lib/tenant-url"

export const runtime = "nodejs"
// Uma entidade com muitas empresas manda um e-mail por empresa.
export const maxDuration = 300

/**
 * Tick diário do CONTROLE DE ENVIO DAS RELAÇÕES DE DESCONTO (15/11/2026).
 * Protegido por `CRON_SECRET` (header `x-cron-secret` ou `Authorization:
 * Bearer`), como os outros ticks.
 *
 * Sem `?tenant`: lista as entidades com o controle ativado e chama esta mesma
 * rota uma vez por entidade (`?tenant=<uuid>`). Cada entidade roda na sua
 * própria requisição: os caches por requisição (React `cache`) não misturam
 * entidades, e a falha de uma não para as outras.
 *
 * Com `?tenant=<uuid>`: fixa a entidade (lib/tenant-contexto.ts) e roda o dia
 * dela (lib/db/repasse-automatico.ts): cria as remessas que faltam e, com a
 * cobrança automática ligada, manda os lembretes e as cobranças.
 * `&simular=1` só conta o que seria enviado.
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

  const url = new URL(req.url)
  const tenant = url.searchParams.get("tenant")
  const simular = url.searchParams.get("simular") === "1"
  const svc = createServiceClient()

  if (tenant) {
    if (!/^[0-9a-f-]{36}$/i.test(tenant)) return Response.json({ erro: "tenant inválido" }, { status: 400 })
    const { data: t } = await svc.from("tenants").select("slug").eq("empresa_id", tenant).maybeSingle()
    const origem = t?.slug ? origemDoTenant(String(t.slug)) : url.origin
    try {
      const resultado = await comTenant({ tenantId: tenant, origem }, () => rodarRepasseAutomatico({ simular }))
      return Response.json({ tenant, ...resultado })
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e)
      console.error(`[repasse/tick] ${tenant}: ${erro}`)
      return Response.json({ tenant, erro }, { status: 500 })
    }
  }

  const { data: ativos, error } = await svc.from("empresa").select("id").not("filiacao_repasse_desde", "is", null)
  if (error) return Response.json({ erro: error.message }, { status: 500 })
  const resultados: ({ tenant: string; erro?: string } & Partial<ResultadoAutomatico>)[] = []
  for (const { id } of ativos ?? []) {
    try {
      const r = await fetch(`${url.origin}/api/repasse/tick?tenant=${id}${simular ? "&simular=1" : ""}`, {
        headers: { "x-cron-secret": secret },
        cache: "no-store",
      })
      resultados.push(await r.json())
    } catch (e) {
      resultados.push({ tenant: id, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  for (const r of resultados) if (r.erro || r.erros?.length) console.error("[repasse/tick]", JSON.stringify(r))
  return Response.json({ entidades: resultados.length, resultados })
}

export const GET = handler
export const POST = handler
