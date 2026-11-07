import { parearAgente, podeTentarParear } from "@/lib/acesso-agente"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function resposta(corpo: unknown, status = 200): Response {
  return Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } })
}

/**
 * POST /api/acesso/agente/parear — o agente da sede troca o código de 6
 * dígitos (mostrado no painel, vale 15 min) pelo token permanente.
 * Corpo: { codigo, versao?, maquina? }. Vale no endereço da entidade.
 */
export async function POST(req: Request) {
  const origem = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "?"
  if (!podeTentarParear(origem)) return resposta({ erro: "Muitas tentativas. Espere 10 minutos." }, 429)
  let corpo: { codigo?: unknown; versao?: unknown; maquina?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return resposta({ erro: "Envie JSON." }, 400)
  }
  const r = await parearAgente(String(corpo.codigo ?? "").trim(), {
    versao: typeof corpo.versao === "string" ? corpo.versao : undefined,
    maquina: typeof corpo.maquina === "string" ? corpo.maquina : undefined,
  })
  if (!r.ok) return resposta({ erro: r.mensagem }, r.status)
  return resposta({ token: r.token, agente: { id: r.id, nome: r.nome, sede: r.sedeNome, conector: r.conector } })
}
