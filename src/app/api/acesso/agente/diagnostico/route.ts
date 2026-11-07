import { autenticarAgente, registrarDiagnostico } from "@/lib/acesso-agente"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function resposta(corpo: unknown, status = 200): Response {
  return Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } })
}

/**
 * POST /api/acesso/agente/diagnostico — o agente devolve a lista de
 * verificação (servidor, login, permissão, teste). Corpo
 * { comandoId?, verificacoes: [{ id, ok, detalhe? }] }.
 */
export async function POST(req: Request) {
  const agente = await autenticarAgente(req)
  if (!agente) return resposta({ erro: "Token do agente inválido ou desligado." }, 401)
  let corpo: { comandoId?: unknown; verificacoes?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return resposta({ erro: "Envie JSON." }, 400)
  }
  const r = await registrarDiagnostico(agente, { comandoId: typeof corpo.comandoId === "string" ? corpo.comandoId : null, verificacoes: corpo.verificacoes })
  if (r.erro) return resposta({ erro: r.erro }, 400)
  return resposta({ ok: true })
}
