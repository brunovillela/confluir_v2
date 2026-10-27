import { getSessaoPainel } from "@/lib/auth"
import {
  ALTERNATIVAS_CAT,
  gravarLidaSemConferencia,
  lerDoLote,
  PERMISSAO_CAT,
  validarPdf,
} from "@/lib/cat-pdf-lote"
import { podeAcessar } from "@/lib/permissoes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// O PDF escaneado vai pela leitura por visão, que pode passar de um minuto.
export const maxDuration = 300

/**
 * Lote de CATs em PDF (lote-cat-pdf.tsx): um PDF por requisição, várias ao
 * mesmo tempo. Rota e não server action porque o Next despacha as actions
 * de um cliente uma de cada vez — o lote virava fila e travava.
 *  - `acao=ler`: lê com a IA e compara com a base; com `registrar=1`, já
 *    grava sem conferência o que for seguro gravar.
 *  - `acao=gravar`: grava sem conferência uma leitura já feita (`valores`,
 *    `avisos` em JSON), junto com o PDF.
 */
export async function POST(req: Request): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao) return Response.json({ erro: "Sessão expirada — entre de novo." }, { status: 401 })
  if (!podeAcessar(sessao.permissoes, PERMISSAO_CAT, ALTERNATIVAS_CAT)) {
    return Response.json({ erro: "Sem acesso às CATs." }, { status: 403 })
  }

  let fd: FormData
  try {
    fd = await req.formData()
  } catch {
    return Response.json({ erro: "Envio inválido — o PDF pode passar de 4 MB." }, { status: 400 })
  }
  const arquivo = validarPdf(fd.get("arquivo"))
  if (typeof arquivo === "string") return Response.json({ erro: arquivo })

  const resultado =
    fd.get("acao") === "gravar"
      ? await gravarLidaSemConferencia(arquivo, String(fd.get("valores") ?? ""), String(fd.get("avisos") ?? ""))
      : await lerDoLote(arquivo, fd.get("registrar") === "1")
  return Response.json(resultado, { headers: { "Cache-Control": "no-store" } })
}
