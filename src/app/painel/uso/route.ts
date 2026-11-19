import { getSessaoPainel } from "@/lib/auth"
import { registrarUsoPainel } from "@/lib/db/uso-fora-expediente"

export const runtime = "nodejs"

/**
 * Sinal de uso do painel (RegistroUsoPainel, uma vez por minuto com a aba
 * visível e em uso). Estende o bloco aberto da pessoa ou abre um novo.
 * 204 = registrado; 410 = não registrar mais (sem jornada ou sem a tabela).
 */
export async function POST() {
  const sessao = await getSessaoPainel()
  if (!sessao) return new Response(null, { status: 401 })
  const r = await registrarUsoPainel(String(sessao.usuario.id))
  return new Response(null, { status: r === "ok" ? 204 : r === "parar" ? 410 : 500 })
}
