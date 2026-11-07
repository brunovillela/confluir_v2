import { autenticarAgente, registrarContato } from "@/lib/acesso-agente"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function resposta(corpo: unknown, status = 200): Response {
  return Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } })
}

/**
 * POST /api/acesso/agente/contato — o agente avisa que está vivo e recebe os
 * comandos pendentes. Cabeçalho Authorization: Bearer ca_…; corpo
 * { versao?, maquina? }.
 */
export async function POST(req: Request) {
  const agente = await autenticarAgente(req)
  if (!agente) return resposta({ erro: "Token do agente inválido ou desligado. Pareie de novo com um código novo." }, 401)
  let corpo: { versao?: unknown; maquina?: unknown } = {}
  try {
    corpo = await req.json()
  } catch {
    // corpo vazio é aceito
  }
  const comandos = await registrarContato(agente, {
    versao: typeof corpo.versao === "string" ? corpo.versao : undefined,
    maquina: typeof corpo.maquina === "string" ? corpo.maquina : undefined,
  })
  return resposta({ agente: { nome: agente.nome, sede: agente.sedeNome, conector: agente.conector }, comandos })
}
